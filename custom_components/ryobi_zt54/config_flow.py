"""Config flow for Ryobi ZT54."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.components import bluetooth
from homeassistant.components.bluetooth import BluetoothServiceInfoBleak
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import (
    CONF_ADDRESS,
    CONF_CHARACTERISTIC_MAP,
    CONF_CHARACTERISTIC_UUIDS,
    CONF_EXPERIMENTAL_DECODER,
    CONF_KEEP_RAW,
    CONF_NOTIFICATION_SAMPLE_SECONDS,
    CONF_POLL_INTERVAL,
    DEFAULT_NOTIFICATION_SAMPLE_SECONDS,
    DEFAULT_POLL_INTERVAL,
    DOMAIN,
    MIN_NOTIFICATION_SAMPLE_SECONDS,
    MIN_POLL_INTERVAL,
)


class RyobiZT54ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a Ryobi ZT54 config flow."""

    VERSION = 1

    _discovery: BluetoothServiceInfoBleak | None = None

    async def async_step_bluetooth(
        self, discovery_info: BluetoothServiceInfoBleak
    ) -> FlowResult:
        """Handle Bluetooth discovery."""
        await self.async_set_unique_id(discovery_info.address)
        self._abort_if_unique_id_configured()
        self._discovery = discovery_info
        self.context["title_placeholders"] = {
            CONF_NAME: discovery_info.name or discovery_info.address
        }
        return await self.async_step_bluetooth_confirm()

    async def async_step_bluetooth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Confirm a Bluetooth-discovered mower."""
        assert self._discovery is not None
        if user_input is not None:
            return self.async_create_entry(
                title=self._discovery.name or "Ryobi ZT54",
                data={
                    CONF_ADDRESS: self._discovery.address,
                    CONF_NAME: self._discovery.name or "Ryobi ZT54",
                },
            )

        return self.async_show_form(
            step_id="bluetooth_confirm",
            description_placeholders={
                CONF_NAME: self._discovery.name or self._discovery.address
            },
        )

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle manual setup."""
        errors: dict[str, str] = {}

        if user_input is not None:
            address = user_input[CONF_ADDRESS].strip()
            await self.async_set_unique_id(address)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=user_input[CONF_NAME].strip() or "Ryobi ZT54",
                data={
                    CONF_ADDRESS: address,
                    CONF_NAME: user_input[CONF_NAME].strip() or "Ryobi ZT54",
                },
            )

        discovered = _discovered_mowers(self.hass)
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_ADDRESS,
                    default=discovered[0][0] if discovered else "",
                ): str,
                vol.Required(
                    CONF_NAME,
                    default=discovered[0][1] if discovered else "Ryobi ZT54",
                ): str,
            }
        )
        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
            description_placeholders={
                "discovered": "\n".join(
                    f"{name} ({address})" for address, name in discovered
                )
                or "No likely Ryobi mower advertisements are visible yet.",
            },
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return RyobiZT54OptionsFlow(config_entry)


class RyobiZT54OptionsFlow(config_entries.OptionsFlow):
    """Handle Ryobi ZT54 options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_POLL_INTERVAL,
                        default=options.get(CONF_POLL_INTERVAL, DEFAULT_POLL_INTERVAL),
                    ): vol.All(vol.Coerce(int), vol.Range(min=MIN_POLL_INTERVAL)),
                    vol.Optional(
                        CONF_NOTIFICATION_SAMPLE_SECONDS,
                        default=options.get(
                            CONF_NOTIFICATION_SAMPLE_SECONDS,
                            DEFAULT_NOTIFICATION_SAMPLE_SECONDS,
                        ),
                    ): vol.All(
                        vol.Coerce(int),
                        vol.Range(min=MIN_NOTIFICATION_SAMPLE_SECONDS),
                    ),
                    vol.Optional(
                        CONF_CHARACTERISTIC_UUIDS,
                        default=options.get(CONF_CHARACTERISTIC_UUIDS, ""),
                    ): str,
                    vol.Optional(
                        CONF_CHARACTERISTIC_MAP,
                        default=options.get(CONF_CHARACTERISTIC_MAP, ""),
                    ): str,
                    vol.Optional(
                        CONF_EXPERIMENTAL_DECODER,
                        default=options.get(CONF_EXPERIMENTAL_DECODER, True),
                    ): bool,
                    vol.Optional(
                        CONF_KEEP_RAW,
                        default=options.get(CONF_KEEP_RAW, True),
                    ): bool,
                }
            ),
        )


def _discovered_mowers(hass) -> list[tuple[str, str]]:
    """Return likely visible Ryobi mower advertisements."""
    discoveries: list[tuple[str, str]] = []
    for info in bluetooth.async_discovered_service_info(hass, connectable=True):
        name = info.name or ""
        haystack = f"{name} {info.address}".lower()
        if any(token in haystack for token in ("ryobi", "zt54", "zero turn")):
            discoveries.append((info.address, name or "Ryobi ZT54"))
    return discoveries
