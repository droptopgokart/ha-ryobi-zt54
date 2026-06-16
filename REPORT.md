# Ryobi ZT54 Home Assistant Integration Report

Date: 2026-06-16

## Summary

This repository contains an experimental Home Assistant custom integration for a Ryobi 54 inch ZTR mower using Bluetooth data captured from the Ryobi mobile app. The first Home Assistant install was done manually by copying the custom component into `/config/custom_components`. That manual install caused Home Assistant's Integrations backend to error, which made the Integrations page spin indefinitely.

The integration was immediately disabled by moving it out of `custom_components`, Home Assistant was restarted, and the Integrations backend was verified working again.

## What Was Built

- Custom integration domain: `ryobi_zt54`
- Bluetooth-based config flow
- Sensors and binary sensors for decoded mower values
- Conservative decoder for captured Ryobi GATT payloads
- BTSnoop GATT extraction tool
- HACS metadata file: `hacs.json`

Decoded from the capture:

- Overall battery level
- Charging state
- Charger connected state
- Battery bay index
- Battery bay voltage class, including 40V and 80V
- Battery bay percent
- Battery bay presence

Not decoded yet:

- Total run hours
- Inspect blades countdown

Those values were visible in the app screenshots but did not appear in the decoded GATT notification samples captured so far.

## Capture Source

The decoding work used the Android bugreport BTSnoop log provided by the user:

`bugreport-e3qsqw-BP4A.251205.006-2026-06-16-09-23-38.zip`

The capture showed the app subscribing to a custom Ryobi service and enabling notifications before sending a command to start telemetry.

Key UUIDs discovered:

- Service: `6995d02a-d584-4b8b-b891-42a09d0e6151`
- Command characteristic: `dea095ae-8174-4bf9-90a4-9008ee202610`
- Status characteristic: `04104e2e-8fda-4b3c-ac4c-05ef47b19628`
- Battery bay characteristic: `66ce28eb-2087-4630-adcd-3777d5c8a7cc`

## Home Assistant Incident

Manual install path used:

`\\10.0.0.237\config\custom_components\ryobi_zt54`

After restart, Home Assistant reported `RUNNING`, but the Integrations page spun indefinitely. The backend WebSocket command for config entries returned an unknown error while the custom component folder was present.

Rollback performed:

`\\10.0.0.237\config\codex-disabled-custom-components\ryobi_zt54-20260616-111224`

After moving the component out of `custom_components` and restarting Home Assistant, the config entries backend returned successfully again.

## Fixes Applied After Rollback

- Added `hacs.json`
- Removed runtime dependency on `homeassistant.data_entry_flow.FlowResult`
- Updated config flow type annotations for Home Assistant 2026 compatibility
- Removed raw JSON braces from translation text that could interfere with Home Assistant translation formatting
- Rebuilt the output zip package
- Verified Python syntax with `compileall`

Local commit:

`38e77c3 Make Ryobi integration HACS-ready`

## Correct Install Path Going Forward

Do not reinstall this manually into production Home Assistant until it has been published to a GitHub repository and added through HACS as a custom repository.

Recommended repository name:

`droptopgokart/ha-ryobi-zt54`

Recommended HACS path:

1. Push this repo to GitHub.
2. In Home Assistant, open HACS.
3. Add the GitHub repository as a custom integration repository.
4. Install through HACS.
5. Restart Home Assistant.
6. Add the integration from Settings > Devices & services.

## Current Status

- Home Assistant production install has been rolled back and recovered.
- The integration remains local and HACS-ready, but not currently installed in Home Assistant.
- GitHub upload is still pending because no dedicated target repo is visible to the GitHub connector.
