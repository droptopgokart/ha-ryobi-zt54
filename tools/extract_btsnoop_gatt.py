#!/usr/bin/env python3
"""Extract ATT/GATT payloads from an Android Bluetooth HCI snoop log.

This is intentionally dependency-free so it can run anywhere Python 3 is
available. It focuses on BLE ACL packets carrying ATT traffic on CID 0x0004.
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import struct
import sys
from pathlib import Path

BTSNOOP_EPOCH_DELTA_US = 0x00DCDDB30F2F8000
ATT_CID = 0x0004
MIN_PLAUSIBLE_UNIX_US = 946684800 * 1_000_000
MAX_PLAUSIBLE_UNIX_US = 4102444800 * 1_000_000

ATT_OPCODES = {
    0x01: "Error Response",
    0x02: "Exchange MTU Request",
    0x03: "Exchange MTU Response",
    0x04: "Find Information Request",
    0x05: "Find Information Response",
    0x06: "Find By Type Value Request",
    0x07: "Find By Type Value Response",
    0x08: "Read By Type Request",
    0x09: "Read By Type Response",
    0x0A: "Read Request",
    0x0B: "Read Response",
    0x0C: "Read Blob Request",
    0x0D: "Read Blob Response",
    0x0E: "Read Multiple Request",
    0x0F: "Read Multiple Response",
    0x10: "Read By Group Type Request",
    0x11: "Read By Group Type Response",
    0x12: "Write Request",
    0x13: "Write Response",
    0x16: "Prepare Write Request",
    0x17: "Prepare Write Response",
    0x18: "Execute Write Request",
    0x19: "Execute Write Response",
    0x1B: "Handle Value Notification",
    0x1D: "Handle Value Indication",
    0x1E: "Handle Value Confirmation",
    0x52: "Write Command",
}


@dataclass
class GattEvent:
    index: int
    timestamp: str
    direction: str
    connection_handle: int
    opcode: str
    opcode_hex: str
    attribute_handle: str | None
    value_hex: str
    value_ascii: str


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="btsnoop_hci.log path")
    parser.add_argument("--json", type=Path, help="Write JSON events")
    parser.add_argument("--csv", type=Path, help="Write CSV events")
    parser.add_argument("--summary", type=Path, help="Write grouped handle summary JSON")
    args = parser.parse_args()

    events = list(extract_events(args.input))
    if args.json:
        args.json.write_text(json.dumps([asdict(event) for event in events], indent=2))
    if args.csv:
        write_csv(args.csv, events)
    if args.summary:
        args.summary.write_text(json.dumps(summarize(events), indent=2))

    print(f"Extracted {len(events)} ATT/GATT events")
    for event in events[:25]:
        handle = event.attribute_handle or "-"
        print(
            f"{event.timestamp} {event.direction:>2} {event.opcode:<28} "
            f"handle={handle:<6} value={event.value_hex}"
        )
    if len(events) > 25:
        print(f"... {len(events) - 25} more events")
    return 0


def extract_events(path: Path):
    data = path.read_bytes()
    if len(data) < 16 or data[:8] != b"btsnoop\x00":
        raise SystemExit("Input is not a btsnoop file")

    offset = 16
    index = 0
    while offset + 24 <= len(data):
        orig_len, incl_len, flags, _drops, timestamp_us = struct.unpack(
            ">IIIIq", data[offset : offset + 24]
        )
        offset += 24
        packet = data[offset : offset + incl_len]
        offset += incl_len
        index += 1

        if not packet:
            continue

        direction = "rx" if flags & 1 else "tx"
        when = decode_btsnoop_timestamp(timestamp_us)

        for event in parse_hci_packet(index, when, direction, packet):
            yield event


def parse_hci_packet(index: int, when: str, direction: str, packet: bytes):
    packet_type = packet[0]
    if packet_type != 0x02:
        return

    if len(packet) < 5:
        return
    handle_flags, acl_len = struct.unpack("<HH", packet[1:5])
    connection_handle = handle_flags & 0x0FFF
    acl_payload = packet[5 : 5 + acl_len]
    if len(acl_payload) < 4:
        return

    l2cap_len, cid = struct.unpack("<HH", acl_payload[:4])
    if cid != ATT_CID:
        return

    att = acl_payload[4 : 4 + l2cap_len]
    if not att:
        return

    event = parse_att(index, when, direction, connection_handle, att)
    if event:
        yield event


def decode_btsnoop_timestamp(timestamp_us: int) -> str:
    """Decode a btsnoop timestamp.

    Classic btsnoop uses a year-0000 epoch. Some Android bugreports store Unix
    epoch microseconds in the same field, so prefer the Unix interpretation
    when it lands in a plausible modern range.
    """
    if MIN_PLAUSIBLE_UNIX_US <= timestamp_us <= MAX_PLAUSIBLE_UNIX_US:
        unix_us = timestamp_us
    else:
        unix_us = timestamp_us - BTSNOOP_EPOCH_DELTA_US
    return datetime.fromtimestamp(unix_us / 1_000_000, timezone.utc).isoformat()


def parse_att(
    index: int, when: str, direction: str, connection_handle: int, att: bytes
) -> GattEvent | None:
    opcode = att[0]
    name = ATT_OPCODES.get(opcode, f"Unknown 0x{opcode:02x}")
    handle: int | None = None
    value = b""

    if opcode in {0x0A, 0x0C} and len(att) >= 3:
        handle = struct.unpack("<H", att[1:3])[0]
        value = att[3:]
    elif opcode in {0x12, 0x52, 0x16} and len(att) >= 3:
        handle = struct.unpack("<H", att[1:3])[0]
        value = att[3:] if opcode != 0x16 else att[5:]
    elif opcode in {0x1B, 0x1D} and len(att) >= 3:
        handle = struct.unpack("<H", att[1:3])[0]
        value = att[3:]
    elif opcode in {0x0B, 0x0D, 0x0F}:
        value = att[1:]
    elif opcode in {0x08, 0x10} and len(att) >= 7:
        value = att[5:]
    elif opcode in {0x09, 0x11}:
        value = att[1:]
    else:
        value = att[1:]

    return GattEvent(
        index=index,
        timestamp=when,
        direction=direction,
        connection_handle=connection_handle,
        opcode=name,
        opcode_hex=f"0x{opcode:02x}",
        attribute_handle=f"0x{handle:04x}" if handle is not None else None,
        value_hex=value.hex(),
        value_ascii=ascii_preview(value),
    )


def ascii_preview(value: bytes) -> str:
    return "".join(chr(byte) if 32 <= byte <= 126 else "." for byte in value)


def summarize(events: list[GattEvent]) -> dict[str, object]:
    grouped: dict[str, dict[str, object]] = {}
    for event in events:
        handle = event.attribute_handle or "no_handle"
        bucket = grouped.setdefault(
            handle,
            {"count": 0, "opcodes": {}, "values": []},
        )
        bucket["count"] = int(bucket["count"]) + 1
        opcodes = bucket["opcodes"]
        assert isinstance(opcodes, dict)
        opcodes[event.opcode] = int(opcodes.get(event.opcode, 0)) + 1
        values = bucket["values"]
        assert isinstance(values, list)
        if event.value_hex and event.value_hex not in values:
            values.append(event.value_hex)
    return {"handles": grouped}


def write_csv(path: Path, events: list[GattEvent]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(events[0]).keys()) if events else [])
        if events:
            writer.writeheader()
            for event in events:
                writer.writerow(asdict(event))


if __name__ == "__main__":
    sys.exit(main())
