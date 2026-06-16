"""Sensors for Ryobi ZT54."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    EntityCategory,
    PERCENTAGE,
    UnitOfElectricCurrent,
    UnitOfElectricPotential,
    UnitOfPower,
    UnitOfTemperature,
    UnitOfTime,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import CONF_CHARACTERISTIC_MAP
from .entity import RyobiZT54Entity
from .parser import parse_characteristic_map


@dataclass(frozen=True, kw_only=True)
class RyobiSensorDescription(SensorEntityDescription):
    """Ryobi sensor description."""

    attr_name: str | None = None


SENSORS: tuple[RyobiSensorDescription, ...] = (
    RyobiSensorDescription(
        key="battery_level",
        translation_key="battery_level",
        native_unit_of_measurement=PERCENTAGE,
        device_class=SensorDeviceClass.BATTERY,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RyobiSensorDescription(
        key="rssi",
        translation_key="rssi",
        native_unit_of_measurement="dBm",
        device_class=SensorDeviceClass.SIGNAL_STRENGTH,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
    RyobiSensorDescription(
        key="voltage",
        translation_key="voltage",
        native_unit_of_measurement=UnitOfElectricPotential.VOLT,
        device_class=SensorDeviceClass.VOLTAGE,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RyobiSensorDescription(
        key="current",
        translation_key="current",
        native_unit_of_measurement=UnitOfElectricCurrent.AMPERE,
        device_class=SensorDeviceClass.CURRENT,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RyobiSensorDescription(
        key="power",
        translation_key="power",
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RyobiSensorDescription(
        key="pack_temperature",
        translation_key="pack_temperature",
        native_unit_of_measurement=UnitOfTemperature.CELSIUS,
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RyobiSensorDescription(
        key="runtime_remaining",
        translation_key="runtime_remaining",
        native_unit_of_measurement=UnitOfTime.MINUTES,
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.MEASUREMENT,
    ),
    RyobiSensorDescription(
        key="blade_hours",
        translation_key="blade_hours",
        native_unit_of_measurement=UnitOfTime.HOURS,
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
    ),
    RyobiSensorDescription(
        key="drive_hours",
        translation_key="drive_hours",
        native_unit_of_measurement=UnitOfTime.HOURS,
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
    ),
    RyobiSensorDescription(
        key="total_hours",
        translation_key="total_hours",
        native_unit_of_measurement=UnitOfTime.HOURS,
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.TOTAL_INCREASING,
    ),
    RyobiSensorDescription(
        key="battery_bay_reference_level",
        name="Battery Bay Reference Level",
        native_unit_of_measurement=PERCENTAGE,
        device_class=SensorDeviceClass.BATTERY,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
    ),
)

SENSORS = SENSORS + tuple(
    RyobiSensorDescription(
        key=f"battery_bay_{bay}_level",
        name=f"Battery Bay {bay}",
        native_unit_of_measurement=PERCENTAGE,
        device_class=SensorDeviceClass.BATTERY,
        state_class=SensorStateClass.MEASUREMENT,
    )
    for bay in range(1, 8)
) + tuple(
    RyobiSensorDescription(
        key=f"battery_bay_{bay}_voltage",
        name=f"Battery Bay {bay} Voltage Class",
        native_unit_of_measurement=UnitOfElectricPotential.VOLT,
        device_class=SensorDeviceClass.VOLTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        entity_category=EntityCategory.DIAGNOSTIC,
    )
    for bay in range(1, 8)
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Ryobi ZT54 sensors."""
    coordinator = entry.runtime_data
    descriptions = list(SENSORS)

    for mapping in parse_characteristic_map(entry.options.get(CONF_CHARACTERISTIC_MAP)):
        if mapping.key not in {description.key for description in descriptions}:
            descriptions.append(
                RyobiSensorDescription(
                    key=mapping.key,
                    name=mapping.key.replace("_", " ").title(),
                    translation_key=None,
                    state_class=SensorStateClass.MEASUREMENT,
                )
            )

    async_add_entities(
        RyobiZT54Sensor(coordinator, description) for description in descriptions
    )


class RyobiZT54Sensor(RyobiZT54Entity, SensorEntity):
    """Ryobi ZT54 sensor."""

    entity_description: RyobiSensorDescription

    def __init__(
        self, coordinator, description: RyobiSensorDescription
    ) -> None:
        """Initialize sensor."""
        super().__init__(coordinator, description.key)
        self.entity_description = description

    @property
    def native_value(self) -> Any:
        """Return the sensor value."""
        return self.coordinator.data.get(self.entity_description.key)

    @property
    def available(self) -> bool:
        """Return if entity is available."""
        return super().available and self.native_value is not None

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """Return diagnostic attributes."""
        if self.entity_description.key != "rssi":
            return None
        attrs: dict[str, Any] = {}
        for key in ("advertised_name", "service_data", "manufacturer_data"):
            if key in self.coordinator.data:
                attrs[key] = self.coordinator.data[key]
        if "raw_characteristics" in self.coordinator.data:
            attrs["raw_characteristics"] = self.coordinator.data["raw_characteristics"]
        return attrs
