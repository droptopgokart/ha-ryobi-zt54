"""BLE payload parsing helpers for Ryobi ZT54."""

from __future__ import annotations

import json
import logging
import struct
from dataclasses import dataclass
from typing import Any

from homeassistant.components.bluetooth import BluetoothServiceInfoBleak

from .const import ATTR_MANUFACTURER_DATA, ATTR_SERVICE_DATA

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class MappedCharacteristic:
    """Description of a user-defined characteristic mapping."""

    uuid: str
    key: str
    data_type: str = "uint16"
    scale: float = 1
    offset: float = 0
    byte_order: str = "little"


def normalise_uuid(uuid: str) -> str:
    """Normalize a UUID string for dictionary lookups."""
    return uuid.strip().lower()


def decode_text(value: bytes) -> str | None:
    """Decode a BLE text value."""
    if not value:
        return None
    try:
        return value.rstrip(b"\x00").decode("utf-8").strip() or None
    except UnicodeDecodeError:
        return None


def parse_advertisement(info: BluetoothServiceInfoBleak | None) -> dict[str, Any]:
    """Parse useful values from the latest advertisement."""
    if info is None:
        return {}

    values: dict[str, Any] = {
        "rssi": info.rssi,
        "advertised_name": info.name,
        ATTR_SERVICE_DATA: {
            normalise_uuid(uuid): payload.hex()
            for uuid, payload in info.service_data.items()
        },
        ATTR_MANUFACTURER_DATA: {
            str(company_id): payload.hex()
            for company_id, payload in info.manufacturer_data.items()
        },
    }

    return values


def parse_characteristic_map(raw_map: str | None) -> list[MappedCharacteristic]:
    """Parse the user-supplied characteristic map option."""
    if not raw_map:
        return []

    try:
        parsed = json.loads(raw_map)
    except json.JSONDecodeError as err:
        _LOGGER.warning("Invalid Ryobi ZT54 characteristic_map JSON: %s", err)
        return []

    mappings: list[MappedCharacteristic] = []
    if not isinstance(parsed, dict):
        _LOGGER.warning("Ryobi ZT54 characteristic_map must be a JSON object")
        return mappings

    for key, config in parsed.items():
        if not isinstance(config, dict) or "uuid" not in config:
            _LOGGER.warning("Skipping invalid characteristic_map entry for %s", key)
            continue
        mappings.append(
            MappedCharacteristic(
                uuid=normalise_uuid(str(config["uuid"])),
                key=str(key),
                data_type=str(config.get("type", "uint16")).lower(),
                scale=float(config.get("scale", 1)),
                offset=float(config.get("offset", 0)),
                byte_order=str(config.get("byte_order", "little")).lower(),
            )
        )

    return mappings


def apply_characteristic_map(
    payloads: dict[str, bytes], mappings: list[MappedCharacteristic]
) -> dict[str, float | int | str]:
    """Decode user-mapped characteristic values."""
    decoded: dict[str, float | int | str] = {}
    for mapping in mappings:
        payload = payloads.get(mapping.uuid)
        if payload is None:
            continue
        value = decode_scalar(payload, mapping.data_type, mapping.byte_order)
        if value is None:
            continue
        if isinstance(value, (int, float)):
            value = value * mapping.scale + mapping.offset
            if isinstance(value, float) and value.is_integer():
                value = int(value)
        decoded[mapping.key] = value
    return decoded


def decode_scalar(
    payload: bytes, data_type: str, byte_order: str = "little"
) -> int | float | str | None:
    """Decode a scalar value from bytes."""
    if data_type in {"hex", "bytes"}:
        return payload.hex()
    if data_type in {"string", "text"}:
        return decode_text(payload)

    endian = "<" if byte_order != "big" else ">"
    formats = {
        "uint8": "B",
        "int8": "b",
        "uint16": "H",
        "int16": "h",
        "uint32": "I",
        "int32": "i",
        "float32": "f",
    }
    size = {
        "uint8": 1,
        "int8": 1,
        "uint16": 2,
        "int16": 2,
        "uint32": 4,
        "int32": 4,
        "float32": 4,
    }.get(data_type)
    fmt = formats.get(data_type)
    if size is None or fmt is None or len(payload) < size:
        return None

    return struct.unpack(endian + fmt, payload[:size])[0]


def experimental_decode(payloads: dict[str, bytes]) -> dict[str, Any]:
    """Decode conservative hints from unknown Ryobi payloads.

    This intentionally only extracts values with strong signals. Unknown bytes
    remain available through diagnostics and the entity extra attributes.
    """
    decoded: dict[str, Any] = {}

    for uuid, payload in payloads.items():
        text = decode_text(payload)
        if text and text.isprintable() and len(text) >= 3:
            decoded[f"text_{short_uuid(uuid)}"] = text

        # Some BLE devices mirror a one-byte battery percentage outside the
        # standard Battery Service. Only accept physically plausible values.
        if len(payload) == 1 and 0 <= payload[0] <= 100:
            decoded.setdefault("battery_level", payload[0])

    return decoded


def decode_ryobi_status(payload: bytes) -> dict[str, Any]:
    """Decode the Ryobi mower status notification."""
    if len(payload) < 8 or payload[0] != 0x02:
        return {}

    decoded: dict[str, Any] = {}
    battery_level = payload[7]
    if 0 <= battery_level <= 100:
        decoded["battery_level"] = battery_level

    decoded["charging"] = payload[3] == 1 or (len(payload) > 8 and payload[8] == 1)
    decoded["charger_connected"] = payload[4] == 1
    decoded["ryobi_status_raw"] = payload.hex()

    if len(payload) > 17:
        decoded["status_sequence"] = payload[17]

    return decoded


def decode_ryobi_battery_bay(payload: bytes) -> dict[str, Any]:
    """Decode an individual Ryobi battery bay notification."""
    if len(payload) < 3:
        return {}

    bay = payload[0]
    voltage_class = {0x10: 40, 0x20: 80}.get(payload[1], payload[1])
    level = payload[2]
    decoded: dict[str, Any] = {
        "ryobi_battery_bay_raw": payload.hex(),
    }

    if bay == 0:
        decoded["battery_bay_reference_level"] = level
        decoded["battery_bay_reference_voltage"] = voltage_class
        return decoded

    if 1 <= bay <= 7:
        decoded[f"battery_bay_{bay}_level"] = level
        decoded[f"battery_bay_{bay}_voltage"] = voltage_class
        decoded[f"battery_bay_{bay}_present"] = payload[1] != 0

    return decoded


def short_uuid(uuid: str) -> str:
    """Return a compact, entity-safe UUID fragment."""
    uuid = normalise_uuid(uuid)
    if uuid.startswith("0000") and uuid.endswith("-0000-1000-8000-00805f9b34fb"):
        return uuid[4:8]
    return uuid.replace("-", "_")[:8]
