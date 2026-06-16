# Ryobi ZT54 BLE Decode Notes

Source capture:

- `bugreport-e3qsqw-BP4A.251205.006-2026-06-16-09-23-38.zip`
- Bluetooth snoop path: `FS/data/log/bt/btsnoop_hci.log`
- App screenshots around 2026-06-16 09:19 local time

Observed app values:

- Mower: `RYOBI 54" ZTR`
- State: `CHARGING`
- Charge level: `99%`
- Total run hours: `1092.0`
- Inspect blades in: `18 run hrs`

## Mower Connection

The mower traffic is connection handle `5` in the snoop log.

Custom service:

```text
6995d02a-d584-4b8b-b891-42a09d0e6151
```

Custom characteristics:

```text
Handle 0x001d, UUID dea095ae-8174-4bf9-90a4-9008ee202610
Command/status stream control. The app subscribes and writes:
0001000000000000000000000000000000000000

Handle 0x0020, UUID 04104e2e-8fda-4b3c-ac4c-05ef47b19628
Overall mower status notifications.

Handle 0x0023, UUID 66ce28eb-2087-4630-adcd-3777d5c8a7cc
Battery bay notifications.
```

## Overall Status Payload

Repeated notification:

```text
02070f010100006301a3fff00000000000010000
```

Current decode:

```text
byte 3: charging flag, observed 0x01
byte 4: charger connected flag, observed 0x01
byte 7: charge percent, observed 0x63 = 99
byte 8: charging/status flag, observed 0x01
byte 17: sequence/page indicator, observed 0x00/0x01/0x02
```

This matches the app showing `CHARGING` and `99%`.

## Battery Bay Payload

Payload format:

```text
byte 0: bay index
byte 1: battery class, 0x10 = 40V and 0x20 = 80V
byte 2: charge percent
```

Observed payloads:

```text
001058... bay reference/duplicate, 40V, 88%
011058... bay 1, 40V, 88%
021058... bay 2, 40V, 88%
031058... bay 3, 40V, 88%
042064... bay 4, 80V, 100%
052064... bay 5, 80V, 100%
062064... bay 6, 80V, 100%
070000... bay 7, absent/empty
```

## Not Yet Decoded

The total run hours (`1092.0`) and inspect-blades countdown (`18`) were visible in the screenshots but did not appear in the ATT/GATT notification payloads from this capture. The app may have cached those values before this snoop window, or it may read them through another path only during a refresh/update flow.

The integration keeps placeholder entities for hour counters, but it will not invent values. A follow-up capture should start with the Ryobi app force-stopped, Bluetooth toggled after HCI snoop is enabled, then the app opened directly to the mower so initial reads are captured.
