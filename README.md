# Ryobi ZT54 Home Assistant Integration

This folder contains a custom Home Assistant integration for a Ryobi ZT54 mower over Bluetooth, plus tooling to help decode the proprietary values exposed by the Ryobi app.

## What Works Now

- Discovers likely Ryobi/ZT54 BLE devices through Home Assistant Bluetooth.
- Uses Home Assistant Bluetooth Proxy infrastructure for active reads.
- Subscribes to the Ryobi ZT54 custom status stream decoded from a real app capture.
- Decodes overall charge level, charging state, charger connected state, and battery bay levels.
- Reads standard BLE battery service data when the mower exposes it.
- Captures advertisements, service data, manufacturer data, readable GATT characteristics, and RSSI.
- Exposes ready-made Home Assistant entities for battery, voltage, current, power, temperature, runtime, hour meters, charging, charger connected, and blades active.
- Lets decoded values be added through an options JSON map without changing code.
- Includes diagnostics with raw characteristic hex payloads.

## Important Bluetooth Proxy Limitation

The Home Assistant Bluetooth Proxy is not a BLE packet sniffer. It can forward advertisements and let Home Assistant connect to a device, but it cannot passively capture the phone app's existing connection to the mower. If the Ryobi app session is paired or encrypted, a proxy near the mower still will not reveal the app payloads.

For app payload decoding, capture from the phone running the Ryobi app. On Android, enable Bluetooth HCI snoop logging, use the Ryobi app while viewing known values, then export a bugreport or `btsnoop_hci.log`.

## Install

Copy this directory into Home Assistant:

```text
custom_components/ryobi_zt54
```

Restart Home Assistant, then add the integration from:

```text
Settings > Devices & services > Add integration > Ryobi ZT54
```

If the mower is visible through your Bluetooth Proxy, it may be discovered automatically. Otherwise enter the Bluetooth address manually.

## Decode Workflow

1. Install the integration and let it poll the mower near your Bluetooth Proxy.
2. Download the integration diagnostics from Home Assistant and save the raw BLE data.
3. Capture the Ryobi app traffic from Android:
   - Enable Developer options.
   - Enable Bluetooth HCI snoop log.
   - Toggle Bluetooth off/on.
   - Open the Ryobi app and view the mower screen.
   - Record the visible app values and the exact time.
   - Export a bugreport or copy `btsnoop_hci.log`.
4. Run the extractor:

```powershell
python .\tools\extract_btsnoop_gatt.py .\btsnoop_hci.log --json .\gatt-events.json --csv .\gatt-events.csv --summary .\gatt-summary.json
```

5. Compare app values to payloads in `gatt-events.json`, `gatt-summary.json`, and the Home Assistant diagnostics.

## Characteristic Map

Once a UUID is decoded, add it in the integration options as JSON:

```json
{
  "voltage": {
    "uuid": "00000000-0000-0000-0000-000000000000",
    "type": "uint16",
    "scale": 0.01
  },
  "pack_temperature": {
    "uuid": "00000000-0000-0000-0000-000000000001",
    "type": "int16",
    "scale": 0.1,
    "offset": -40
  }
}
```

Supported types: `uint8`, `int8`, `uint16`, `int16`, `uint32`, `int32`, `float32`, `string`, and `hex`.

## What I Need To Finish The Exact ZT54 Decoder

Send me:

- The Home Assistant diagnostics from this integration.
- `gatt-events.json` and `gatt-summary.json` from the Android HCI snoop capture.
- A note with the app-displayed battery percent, voltage, runtime, hours, charging state, and blade/motor state at the capture time.

The current decoder covers the charge/status and battery-bay packets from the first capture. Total run hours and inspect-blades countdown were visible in screenshots but not present in the captured notification payloads, so those need one more capture that starts before the app refreshes its mower data.
