"""Data coordinator for Ryobi ZT54 BLE devices."""

from __future__ import annotations

import asyncio
from datetime import timedelta
import logging
from typing import Any

from bleak.exc import BleakError
from bleak_retry_connector import BleakClientWithServiceCache, establish_connection

from homeassistant.components import bluetooth
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_CHARACTERISTIC_MAP,
    CONF_CHARACTERISTIC_UUIDS,
    CONF_EXPERIMENTAL_DECODER,
    CONF_KEEP_RAW,
    CONF_NOTIFICATION_SAMPLE_SECONDS,
    CONF_POLL_INTERVAL,
    DEFAULT_NOTIFICATION_SAMPLE_SECONDS,
    DEFAULT_POLL_INTERVAL,
    DIS_CHARACTERISTICS,
    MIN_POLL_INTERVAL,
    RYOBI_BATTERY_BAY_UUID,
    RYOBI_COMMAND_UUID,
    RYOBI_STATUS_UUID,
    STANDARD_BATTERY_LEVEL_UUID,
)
from .parser import (
    apply_characteristic_map,
    decode_ryobi_battery_bay,
    decode_ryobi_status,
    decode_text,
    experimental_decode,
    normalise_uuid,
    parse_advertisement,
    parse_characteristic_map,
)

_LOGGER = logging.getLogger(__name__)


class RyobiZT54Coordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinate polling a Ryobi mower over Bluetooth."""

    def __init__(
        self,
        hass: HomeAssistant,
        address: str,
        name: str,
        options: dict[str, Any],
    ) -> None:
        """Initialize the coordinator."""
        interval = max(
            int(options.get(CONF_POLL_INTERVAL, DEFAULT_POLL_INTERVAL)),
            MIN_POLL_INTERVAL,
        )
        super().__init__(
            hass,
            _LOGGER,
            name=name,
            update_interval=timedelta(seconds=interval),
        )
        self.address = address
        self.device_name = name
        self.options = options

    async def _async_update_data(self) -> dict[str, Any]:
        """Fetch data from the mower."""
        service_info = bluetooth.async_last_service_info(
            self.hass, self.address, connectable=True
        )
        data = parse_advertisement(service_info)
        data["online"] = service_info is not None

        ble_device = bluetooth.async_ble_device_from_address(
            self.hass, self.address, connectable=True
        )
        if ble_device is None:
            if self.last_update_success:
                _LOGGER.debug("Ryobi ZT54 %s is not currently visible", self.address)
            return data

        raw_payloads: dict[str, bytes] = {}
        device_info: dict[str, str] = {}

        try:
            client = await establish_connection(
                BleakClientWithServiceCache,
                ble_device,
                self.device_name,
            )
        except (BleakError, TimeoutError) as err:
            raise UpdateFailed(f"Could not connect to Ryobi ZT54: {err}") from err

        try:
            data["online"] = True
            data.update(await self._read_standard_characteristics(client))
            raw_payloads.update(await self._read_configured_characteristics(client))
            raw_payloads.update(await self._read_discovered_readable_characteristics(client))
            notification_payloads = await self._collect_notification_payloads(client)
            raw_payloads.update(notification_payloads)
            data.update(self._decode_notification_payloads(notification_payloads))
            for uuid, payload in raw_payloads.items():
                if uuid in DIS_CHARACTERISTICS:
                    text = decode_text(payload)
                    if text:
                        device_info[DIS_CHARACTERISTICS[uuid]] = text
            data["device_info"] = device_info
        except (BleakError, TimeoutError) as err:
            raise UpdateFailed(f"Could not read Ryobi ZT54 data: {err}") from err
        finally:
            if client.is_connected:
                await client.disconnect()

        mappings = parse_characteristic_map(self.options.get(CONF_CHARACTERISTIC_MAP))
        data.update(apply_characteristic_map(raw_payloads, mappings))

        if self.options.get(CONF_EXPERIMENTAL_DECODER, True):
            data.update(experimental_decode(raw_payloads))

        if self.options.get(CONF_KEEP_RAW, True):
            data["raw_characteristics"] = {
                uuid: payload.hex() for uuid, payload in raw_payloads.items()
            }

        return data

    async def _collect_notification_payloads(
        self, client: BleakClientWithServiceCache
    ) -> dict[str, bytes]:
        """Subscribe briefly to known Ryobi notification characteristics."""
        payloads: dict[str, bytes] = {}
        started: list[str] = []
        notify_uuids = (RYOBI_COMMAND_UUID, RYOBI_STATUS_UUID, RYOBI_BATTERY_BAY_UUID)

        def _callback(uuid: str):
            def _store(_sender, data: bytearray) -> None:
                payload = bytes(data)
                payloads[uuid] = payload
                if uuid == RYOBI_BATTERY_BAY_UUID and len(payload) >= 1:
                    payloads[f"{uuid}#{payload[0]}"] = payload

            return _store

        for uuid in notify_uuids:
            try:
                await client.start_notify(uuid, _callback(uuid))
                started.append(uuid)
            except BleakError as err:
                _LOGGER.debug("Could not subscribe to %s: %s", uuid, err)

        if started:
            try:
                await client.write_gatt_char(
                    RYOBI_COMMAND_UUID,
                    bytes.fromhex("0001000000000000000000000000000000000000"),
                    response=False,
                )
            except BleakError as err:
                _LOGGER.debug("Could not request Ryobi status stream: %s", err)
            await asyncio.sleep(
                float(
                    self.options.get(
                        CONF_NOTIFICATION_SAMPLE_SECONDS,
                        DEFAULT_NOTIFICATION_SAMPLE_SECONDS,
                    )
                )
            )

        for uuid in started:
            try:
                await client.stop_notify(uuid)
            except BleakError as err:
                _LOGGER.debug("Could not stop notification for %s: %s", uuid, err)

        return payloads

    def _decode_notification_payloads(
        self, payloads: dict[str, bytes]
    ) -> dict[str, Any]:
        """Decode known Ryobi notification payloads."""
        decoded: dict[str, Any] = {}
        for uuid, payload in payloads.items():
            if uuid == RYOBI_STATUS_UUID:
                decoded.update(decode_ryobi_status(payload))
            elif uuid.startswith(f"{RYOBI_BATTERY_BAY_UUID}#"):
                decoded.update(decode_ryobi_battery_bay(payload))
        return decoded

    async def _read_standard_characteristics(
        self, client: BleakClientWithServiceCache
    ) -> dict[str, Any]:
        """Read standard BLE characteristics."""
        data: dict[str, Any] = {}
        try:
            payload = await client.read_gatt_char(STANDARD_BATTERY_LEVEL_UUID)
        except BleakError:
            payload = None

        if payload and len(payload) >= 1 and 0 <= payload[0] <= 100:
            data["battery_level"] = payload[0]

        return data

    async def _read_configured_characteristics(
        self, client: BleakClientWithServiceCache
    ) -> dict[str, bytes]:
        """Read user-configured characteristic UUIDs."""
        uuids = self._configured_uuids()
        payloads: dict[str, bytes] = {}
        for uuid in uuids:
            try:
                payloads[uuid] = bytes(await client.read_gatt_char(uuid))
            except BleakError as err:
                _LOGGER.debug("Could not read configured characteristic %s: %s", uuid, err)
        return payloads

    async def _read_discovered_readable_characteristics(
        self, client: BleakClientWithServiceCache
    ) -> dict[str, bytes]:
        """Read readable non-control characteristics for diagnostics."""
        payloads: dict[str, bytes] = {}
        services = client.services
        if services is None:
            return payloads

        for service in services:
            for char in service.characteristics:
                uuid = normalise_uuid(char.uuid)
                if uuid in payloads:
                    continue
                if "read" not in char.properties:
                    continue
                try:
                    payloads[uuid] = bytes(await client.read_gatt_char(char.uuid))
                except BleakError as err:
                    _LOGGER.debug("Could not read characteristic %s: %s", uuid, err)

        return payloads

    def _configured_uuids(self) -> set[str]:
        """Return configured characteristic UUIDs."""
        configured = self.options.get(CONF_CHARACTERISTIC_UUIDS, "")
        uuids = {
            normalise_uuid(uuid)
            for uuid in configured.replace("\n", ",").split(",")
            if uuid.strip()
        }

        for mapping in parse_characteristic_map(self.options.get(CONF_CHARACTERISTIC_MAP)):
            uuids.add(mapping.uuid)

        uuids.update(DIS_CHARACTERISTICS)
        return uuids
