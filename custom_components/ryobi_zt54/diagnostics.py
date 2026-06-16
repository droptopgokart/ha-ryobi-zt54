"""Diagnostics for Ryobi ZT54."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant


TO_REDACT = {"address", "serial_number"}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    coordinator = entry.runtime_data
    data = dict(coordinator.data or {})
    device_info = dict(data.get("device_info") or {})
    for key in TO_REDACT:
        device_info.pop(key, None)
    data["device_info"] = device_info
    return {
        "entry": {
            "title": entry.title,
            "options": dict(entry.options),
        },
        "data": data,
    }
