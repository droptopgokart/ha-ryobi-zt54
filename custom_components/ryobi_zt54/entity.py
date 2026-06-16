"""Base entities for Ryobi ZT54."""

from __future__ import annotations

from homeassistant.helpers.device_registry import CONNECTION_BLUETOOTH, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_ADDRESS, DOMAIN
from .coordinator import RyobiZT54Coordinator


class RyobiZT54Entity(CoordinatorEntity[RyobiZT54Coordinator]):
    """Base Ryobi ZT54 entity."""

    _attr_has_entity_name = True

    def __init__(self, coordinator: RyobiZT54Coordinator, key: str) -> None:
        """Initialize entity."""
        super().__init__(coordinator)
        self._key = key
        self._attr_unique_id = f"{coordinator.address}_{key}"

    @property
    def device_info(self) -> DeviceInfo:
        """Return device information."""
        info = self.coordinator.data.get("device_info", {})
        return DeviceInfo(
            identifiers={(DOMAIN, self.coordinator.address)},
            connections={(CONNECTION_BLUETOOTH, self.coordinator.address)},
            name=self.coordinator.device_name,
            manufacturer=info.get("manufacturer", "Ryobi"),
            model=info.get("model", "ZT54"),
            serial_number=info.get("serial_number"),
            sw_version=info.get("software") or info.get("firmware"),
            hw_version=info.get("hardware"),
        )
