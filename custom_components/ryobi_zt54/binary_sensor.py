"""Binary sensors for Ryobi ZT54."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
    BinarySensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .entity import RyobiZT54Entity


@dataclass(frozen=True, kw_only=True)
class RyobiBinarySensorDescription(BinarySensorEntityDescription):
    """Ryobi binary sensor description."""


BINARY_SENSORS: tuple[RyobiBinarySensorDescription, ...] = (
    RyobiBinarySensorDescription(
        key="online",
        translation_key="online",
        device_class=BinarySensorDeviceClass.CONNECTIVITY,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RyobiBinarySensorDescription(
        key="charging",
        translation_key="charging",
        device_class=BinarySensorDeviceClass.BATTERY_CHARGING,
    ),
    RyobiBinarySensorDescription(
        key="charger_connected",
        translation_key="charger_connected",
        device_class=BinarySensorDeviceClass.PLUG,
    ),
    RyobiBinarySensorDescription(
        key="blades_active",
        translation_key="blades_active",
        device_class=BinarySensorDeviceClass.RUNNING,
    ),
)

BINARY_SENSORS = BINARY_SENSORS + tuple(
    RyobiBinarySensorDescription(
        key=f"battery_bay_{bay}_present",
        name=f"Battery Bay {bay} Present",
        device_class=BinarySensorDeviceClass.PLUG,
        entity_category=EntityCategory.DIAGNOSTIC,
    )
    for bay in range(1, 8)
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Ryobi ZT54 binary sensors."""
    coordinator = entry.runtime_data
    async_add_entities(
        RyobiZT54BinarySensor(coordinator, description)
        for description in BINARY_SENSORS
    )


class RyobiZT54BinarySensor(RyobiZT54Entity, BinarySensorEntity):
    """Ryobi ZT54 binary sensor."""

    entity_description: RyobiBinarySensorDescription

    def __init__(
        self, coordinator, description: RyobiBinarySensorDescription
    ) -> None:
        """Initialize binary sensor."""
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def is_on(self) -> bool | None:
        """Return the binary sensor state."""
        value: Any = self.coordinator.data.get(self.entity_description.key)
        if value is None:
            return None
        return bool(value)

    @property
    def available(self) -> bool:
        """Return if entity is available."""
        return super().available and self.is_on is not None
