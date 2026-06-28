# ESPHome — Daikin Madoka BLE Bridge

ESP32 project that bridges a **Daikin Madoka** BLE thermostat to MQTT, built with [ESPHome](https://esphome.io/).

## What it does

- Connects to the Madoka thermostat over Bluetooth LE
- Exposes a `climate` entity (read setpoint, mode, current temp)
- Publishes state to an MQTT broker over TLS (port 8883)

## Configs

| File | Description |
|---|---|
| `daikin-madoka.yaml` | Main config — flespi MQTT broker, ESP-IDF framework |

Older iterations (`madoka-bridge v1–v3.yaml`, `daikin-madoka v1.yaml`) are kept in [`archive/`](archive/) for reference.

## Hardware

- ESP32 dev board (e.g. ESP32-WROOM-32)
- Daikin Madoka thermostat (BTA446A1 or similar) — BLE MAC address configured in the YAML

## Setup

1. Create a virtualenv and install ESPHome:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # fish: source .venv/bin/activate.fish
   pip install esphome
   ```
2. Copy `secrets.yaml.example` to `secrets.yaml` and fill in your credentials:
   ```yaml
   wifi_ssid: "your-network"
   wifi_password: "your-password"
   ota_password: "choose-a-password"
   fallback_password: "choose-a-password"
   flespi_token: "your-flespi-token"
   ha_api_key: "your-32-byte-base64-key"  # openssl rand -base64 32
   ```
3. Update the BLE MAC address in the config to match your Madoka unit
4. Flash: `esphome run daikin-madoka.yaml`

## BLE Scanner

`scan.py` — scans for nearby BLE devices and prints them sorted by signal strength. Useful for finding your Madoka's MAC address.

```bash
pip install bleak
python scan.py
```

## External component

Uses the [`daikin_madoka`](https://github.com/Petapton/esphome/tree/madoka) custom ESPHome component by Petapton.



## MQTT Dashboard panels

I'm using the iOS MQTT app called: IoT MQTT Panel.

Create a dashboard, then add these panels. The topics map directly to what you saw in your `mosquitto_sub` output.

**Mode — use a Combo Box or Radio Buttons panel**

- Publish topic: `daikin/climate/madoka_climate/mode/command`
- Subscribe topic: `daikin/climate/madoka_climate/mode/state`
- Values: `off`, `cool`, `heat`, `auto`, `dry`, `fan_only`

Subscribing to the state topic too means the panel reflects the real thermostat mode, not just what you last tapped — important if someone changes it at the wall.

**Target temp low — Slider panel**

- Publish: `daikin/climate/madoka_climate/target_temperature_low/command`
- Subscribe: `daikin/climate/madoka_climate/target_temperature_low/state`
- Range: 16–30, step 0.5

**Target temp high — Slider panel**

- Publish: `daikin/climate/madoka_climate/target_temperature_high/command`
- Subscribe: `daikin/climate/madoka_climate/target_temperature_high/state`
- Range: 16–30, step 0.5

Remember it's a dual-setpoint unit, so you need _both_ low and high sliders — there's no single setpoint topic.

**Fan mode — Combo Box panel**

- Publish: `daikin/climate/madoka_climate/fan_mode/command`
- Subscribe: `daikin/climate/madoka_climate/fan_mode/state`
- Values: `auto`, `low`, `medium`, `high` (confirm the exact set your unit accepts by watching the state topic as you cycle it)

**Current temperature — Text or Gauge panel (read-only)**

- Subscribe only: `daikin/climate/madoka_climate/current_temperature/state`
- No publish topic — this is sensor data from the room

**Online status — Text or LED Indicator panel (read-only)**

- Subscribe: `daikin/status`
- Shows `online`/`offline` so you know the ESP32 is alive before trusting the other readings
