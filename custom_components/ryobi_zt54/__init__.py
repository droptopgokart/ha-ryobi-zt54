"""Ryobi ZT54 Bluetooth integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_NAME
from homeassistant.core import HomeAssistant

from .const import CONF_ADDRESS, DOMAIN, PLATFORMS
from .coordinator import RyobiZT54Coordinator

RyobiZT54ConfigEntry = ConfigEntry


async def async_setup_entry(
    hass: HomeAssistant, entry: RyobiZT54ConfigEntry
) -> bool:
    """Set up Ryobi ZT54 from a config entry."""
    coordinator = RyobiZT54Coordinator(
        hass=hass,
        address=entry.data[CONF_ADDRESS],
        name=entry.data[CONF_NAME],
        options=entry.options,
    )

    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: RyobiZT54ConfigEntry
) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_update_listener(
    hass: HomeAssistant, entry: RyobiZT54ConfigEntry
) -> None:
    """Reload when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
