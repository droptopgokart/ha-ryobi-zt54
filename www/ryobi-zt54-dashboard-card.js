class RyobiZt54DashboardCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      title: 'RYOBI 54" ZTR',
      assetVersion: "20260616-3",
      entities: {
        battery: "sensor.ryobi_zero_turn_battery",
        signal: "sensor.ryobi_zero_turn_signal_strength",
        online: "binary_sensor.ryobi_zero_turn_online",
        charging: "binary_sensor.ryobi_zero_turn_charging",
        chargerConnected: "binary_sensor.ryobi_zero_turn_charger_connected",
        bladesActive: "binary_sensor.ryobi_zero_turn_blades_active",
        totalHours: "sensor.ryobi_zero_turn_total_hours",
        bladeHours: "sensor.ryobi_zero_turn_blade_hours",
        driveHours: "sensor.ryobi_zero_turn_drive_hours",
        voltage: "sensor.ryobi_zero_turn_voltage",
        current: "sensor.ryobi_zero_turn_current",
        power: "sensor.ryobi_zero_turn_power",
        bayReference: "sensor.ryobi_zero_turn_battery_bay_reference_level",
        ...config.entities,
      },
      ...config,
    };
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  getCardSize() {
    return 8;
  }

  state(entityId) {
    return entityId ? this._hass?.states?.[entityId] : undefined;
  }

  numeric(entityId) {
    const value = Number(this.state(entityId)?.state);
    return Number.isFinite(value) ? value : null;
  }

  bool(entityId) {
    const state = this.state(entityId)?.state;
    if (state === "on") return true;
    if (state === "off") return false;
    return null;
  }

  rawCharacteristics() {
    return this.state(this.config.entities.signal)?.attributes?.raw_characteristics || {};
  }

  statusPayload() {
    return this.rawCharacteristics()["04414e2e-8fda-4b3c-ac4c-05ef47b19628"] || "";
  }

  isCharging() {
    const entityValue = this.bool(this.config.entities.charging);
    if (entityValue !== null) return entityValue;
    const raw = this.statusPayload();
    return raw.slice(6, 8) === "01" || raw.slice(16, 18) === "01";
  }

  chargerConnected() {
    const entityValue = this.bool(this.config.entities.chargerConnected);
    if (entityValue !== null) return entityValue;
    return this.statusPayload().slice(8, 10) === "01";
  }

  bayEntity(index) {
    return {
      level: this.numeric(`sensor.ryobi_zero_turn_battery_bay_${index}`),
      voltage: this.numeric(`sensor.ryobi_zero_turn_battery_bay_${index}_voltage_class`),
      present: this.bool(`binary_sensor.ryobi_zero_turn_battery_bay_${index}_present`),
    };
  }

  allBays() {
    return Array.from({ length: 7 }, (_, index) => ({
      index: index + 1,
      ...this.bayEntity(index + 1),
    }));
  }

  mainBattery() {
    const direct = this.numeric(this.config.entities.battery);
    if (direct !== null && direct > 0) {
      const rounded = Math.round(direct);
      return rounded === 100 && this.isCharging() ? 99 : rounded;
    }

    const driveLevels = this.allBays()
      .filter((bay) => bay.present && bay.voltage === 80 && bay.level !== null)
      .map((bay) => bay.level);
    if (!driveLevels.length) return direct ?? null;

    const average = Math.round(
      driveLevels.reduce((sum, level) => sum + level, 0) / driveLevels.length,
    );
    return average === 100 && this.isCharging() ? 99 : average;
  }

  chargeColor(percent) {
    if (percent === null) return "#8b949e";
    if (percent >= 80) return "#a8ff1a";
    if (percent >= 50) return "#f2e94e";
    if (percent >= 25) return "#ff9f1c";
    return "#ff3b30";
  }

  chargeTone(percent) {
    if (percent === null || percent >= 80) return "green";
    if (percent >= 50) return "yellow";
    if (percent >= 25) return "orange";
    return "red";
  }

  fmt(entityId, suffix = "", fallback = "N/A") {
    const state = this.state(entityId)?.state;
    if (!state || ["unknown", "unavailable"].includes(state)) return fallback;
    return `${state}${suffix}`;
  }

  icon(name) {
    return `<ha-icon icon="${name}"></ha-icon>`;
  }

  async refreshTelemetry() {
    await this._hass.callService("homeassistant", "update_entity", {
      entity_id: this.config.entities.signal,
    });
  }

  render() {
    if (!this._hass || !this.config) return;

    const battery = this.mainBattery();
    const color = this.chargeColor(battery);
    const tone = this.chargeTone(battery);
    const charging = this.isCharging();
    const online = this.bool(this.config.entities.online);
    const charger = this.chargerConnected();
    const signal = this.numeric(this.config.entities.signal);
    const bays = this.allBays();
    const presentBays = bays.filter((bay) => bay.present);
    const driveBays = bays.filter((bay) => bay.present && bay.voltage === 80);
    const accessoryBays = bays.filter((bay) => bay.present && bay.voltage === 40);
    const emptyBays = bays.filter((bay) => !bay.present);
    const driveVoltage = driveBays.reduce((sum, bay) => sum + (bay.voltage || 0), 0);
    const accessoryVoltage = accessoryBays.reduce((sum, bay) => sum + (bay.voltage || 0), 0);
    const driveAverage = this.averageLevel(driveBays);
    const accessoryAverage = this.averageLevel(accessoryBays);
    const imageExt = charging ? "gif" : "png";
    const mowerImage = `/local/ryobi-zt54/ryobi-zt54-glow-${tone}.${imageExt}?v=${this.config.assetVersion}`;
    const status = charging ? "Charging" : charger ? "Charger connected" : online ? "Ready" : "Offline";

    this.innerHTML = `
      <style>
        :host {
          --accent: ${color};
          --card: #101419;
          --panel: #0c1117;
          --line: rgba(255,255,255,.09);
          --muted: #9aa4ad;
          --text: #edf3f7;
          display: block;
          color: var(--text);
          font-family: var(--ha-font-family-body, "Roboto", sans-serif);
        }
        ha-icon {
          width: 20px;
          height: 20px;
          color: var(--accent);
        }
        .wrap {
          min-height: 100%;
          padding: 16px;
          background:
            radial-gradient(circle at 24% 16%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 29rem),
            linear-gradient(135deg, #080b0f 0%, #121821 52%, #07090c 100%);
          box-sizing: border-box;
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, .82fr);
          gap: 14px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .card {
          background: linear-gradient(180deg, rgba(18,23,30,.96), rgba(10,14,19,.96));
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: 0 18px 42px rgba(0,0,0,.34);
          overflow: hidden;
        }
        .panel { padding: 18px 20px; }
        .stack { display: grid; gap: 14px; }
        h1, h2, h3, p { margin: 0; }
        h1 {
          font-size: clamp(28px, 4vw, 46px);
          line-height: 1;
          letter-spacing: 0;
        }
        h2 {
          font-size: 14px;
          letter-spacing: 0;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 9px;
        }
        .muted { color: var(--muted); }
        .hero {
          display: grid;
          grid-template-columns: minmax(300px, 1fr) 220px;
          min-height: 350px;
          gap: 20px;
        }
        .connected {
          color: #9fe8d5;
          margin-top: 12px;
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .mower-stage {
          min-height: 254px;
          display: grid;
          align-items: end;
          justify-items: center;
          margin-top: 8px;
        }
        .mower-image {
          width: min(100%, 510px);
          max-height: 292px;
          object-fit: contain;
          filter: drop-shadow(0 0 16px color-mix(in srgb, var(--accent) 38%, transparent));
          border-radius: 6px;
        }
        .charge-side {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 18px;
        }
        .status {
          color: var(--accent);
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
          text-transform: uppercase;
        }
        .percent {
          font-size: 76px;
          line-height: .9;
          color: var(--accent);
          font-weight: 900;
          text-shadow: 0 0 24px color-mix(in srgb, var(--accent) 65%, transparent);
        }
        .percent span { font-size: 32px; }
        .button, button.tool {
          border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--line));
          background: color-mix(in srgb, var(--accent) 10%, #121820);
          color: var(--text);
          border-radius: 7px;
          padding: 13px 14px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
          font: inherit;
          cursor: pointer;
        }
        .gauge {
          width: 220px;
          height: 130px;
          margin: 14px auto 4px;
          position: relative;
          background:
            conic-gradient(from 270deg,
              var(--accent) 0deg,
              var(--accent) ${Math.max(0, Math.min(100, battery ?? 0)) * 1.8}deg,
              rgba(255,255,255,.10) ${Math.max(0, Math.min(100, battery ?? 0)) * 1.8}deg 180deg,
              transparent 180deg);
          border-radius: 220px 220px 0 0;
          -webkit-mask: radial-gradient(circle at 50% 100%, transparent 0 78px, #000 80px);
          mask: radial-gradient(circle at 50% 100%, transparent 0 78px, #000 80px);
        }
        .gauge-value {
          text-align: center;
          margin-top: -62px;
          color: var(--accent);
          font-size: 44px;
          font-weight: 900;
        }
        .metric, .usage-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          border-top: 1px solid var(--line);
          padding: 12px 0;
        }
        .metric:first-of-type { border-top: 0; }
        .metric-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
        }
        .metric strong, .usage-row strong { font-size: 18px; }
        .battery-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, .72fr);
          gap: 14px;
          align-items: stretch;
        }
        .battery-group {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: rgba(255,255,255,.025);
          padding: 14px;
          display: grid;
          gap: 12px;
          align-content: start;
        }
        .battery-group h3 {
          font-size: 14px;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .group-subtitle {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.35;
        }
        .bay-list { display: grid; gap: 10px; }
        .bay {
          --bay-color: var(--accent);
          display: grid;
          grid-template-columns: 58px 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border-radius: 7px;
          border: 1px solid color-mix(in srgb, var(--bay-color) 45%, var(--line));
          background: color-mix(in srgb, var(--bay-color) 9%, #111820);
        }
        .bay.empty {
          opacity: .58;
          --bay-color: #6f7880;
        }
        .bay-name {
          color: var(--muted);
          font-size: 12px;
          text-transform: uppercase;
        }
        .bay-bar {
          height: 8px;
          border-radius: 999px;
          background: rgba(255,255,255,.09);
          overflow: hidden;
        }
        .bay-fill {
          height: 100%;
          width: var(--level);
          background: var(--bay-color);
          box-shadow: 0 0 12px var(--bay-color);
        }
        .bay-value {
          color: var(--bay-color);
          font-weight: 900;
        }
        .summary-grid, .tool-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .mini {
          border: 1px solid var(--line);
          border-radius: 7px;
          padding: 14px;
          display: grid;
          gap: 8px;
          justify-items: center;
          text-align: center;
          background: rgba(255,255,255,.025);
        }
        .tool-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .bottom-note {
          grid-column: 1 / -1;
          padding: 12px 14px;
          color: var(--muted);
          text-align: center;
        }
        @media (max-width: 900px) {
          .grid, .hero, .battery-layout { grid-template-columns: 1fr; }
          .charge-side { align-items: flex-start; }
          .summary-grid, .tool-grid { grid-template-columns: 1fr; }
          .panel { padding: 16px; }
        }
      </style>
      <div class="wrap">
        <div class="grid">
          <section class="card hero panel">
            <div>
              <h1>${this.config.title}</h1>
              <div class="connected">${this.icon("mdi:bluetooth")} ${online ? "Connected" : "Disconnected"}</div>
              <div class="mower-stage">
                <img class="mower-image" src="${mowerImage}" alt="Ryobi 54 inch zero-turn mower with charge glow">
              </div>
            </div>
            <div class="charge-side">
              <div class="status">${this.icon(charging ? "mdi:battery-charging" : "mdi:battery")} ${status}</div>
              <div class="percent">${battery ?? "N/A"}${battery === null ? "" : "<span>%</span>"}</div>
              <div>
                <p>Charge Level</p>
                <p class="muted">${charging ? "Charging to 100%" : "Live mower telemetry"}</p>
              </div>
              <button class="tool" id="refresh-main">${this.icon("mdi:refresh")} Refresh Telemetry</button>
            </div>
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:battery-high")} Battery Overview</h2>
            <div>
              <div class="gauge"></div>
              <div class="gauge-value">${battery ?? "N/A"}${battery === null ? "" : "%"}</div>
              <p class="muted" style="text-align:center;">80V drive pack charge shown in app</p>
            </div>
            ${this.metric("mdi:car-battery", "80V drive pack class total", `${driveVoltage || "N/A"}${driveVoltage ? " V" : ""}`)}
            ${this.metric("mdi:battery-heart-variant", "80V drive pack average", driveAverage === null ? "N/A" : `${driveAverage}%`)}
            ${this.metric("mdi:battery-outline", "40V accessory bay average", accessoryAverage === null ? "N/A" : `${accessoryAverage}%`)}
            ${this.metric("mdi:counter", "Bays installed", `${presentBays.length} / 7`)}
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:battery-multiple")} Battery Bays</h2>
            <div class="battery-layout">
              ${this.batteryGroup("40V Accessory Bays", "Side 40V batteries shown separately from mower drive charge.", accessoryBays, accessoryVoltage)}
              ${this.batteryGroup("80V Drive Pack", "Main traction batteries. This group drives the app charge level.", driveBays, driveVoltage)}
              ${this.batteryGroup("Open Bays", "Installed state from Bluetooth telemetry.", emptyBays, 0)}
            </div>
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:clock-outline")} Runtime & Usage</h2>
            ${this.usage("mdi:timer-outline", "Total Run Hours", this.fmt(this.config.entities.totalHours, " hrs"))}
            ${this.usage("mdi:mower-bag", "Inspect Blades In", this.fmt(this.config.entities.bladeHours, " hrs"))}
            ${this.usage("mdi:chart-bar", "Drive Hours", this.fmt(this.config.entities.driveHours, " hrs"))}
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:mower")} Blade Status</h2>
            ${this.metric("mdi:fan", "Blades Active", this.bool(this.config.entities.bladesActive) ? "Yes" : "No")}
            ${this.metric("mdi:timer-sand", "Blade Hours", this.fmt(this.config.entities.bladeHours, " hrs"))}
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:shield-check-outline")} System Status</h2>
            <div class="summary-grid">
              ${this.summary("mdi:power-plug", "Charger", charger ? "Connected" : "Disconnected")}
              ${this.summary("mdi:wifi-strength-2", "Signal", signal === null ? "N/A" : `${signal} dBm`)}
              ${this.summary("mdi:lan-connect", "Online", online ? "Connected" : "Offline")}
            </div>
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:tune-variant")} Telemetry Tools</h2>
            <div class="tool-grid">
              <button class="tool" id="refresh-tools">${this.icon("mdi:refresh")} Refresh Data</button>
              <div class="mini">${this.icon("mdi:clock-check-outline")}<span class="muted">Last signal update</span><strong>${this.relative(this.state(this.config.entities.signal)?.last_updated)}</strong></div>
            </div>
          </section>

          <div class="card bottom-note">
            Dashboard values are live Home Assistant entities from the Ryobi ZT54 Bluetooth integration. No autonomous start/return controls are shown for this zero-turn mower.
          </div>
        </div>
      </div>
    `;

    this.querySelector("#refresh-main")?.addEventListener("click", () => this.refreshTelemetry());
    this.querySelector("#refresh-tools")?.addEventListener("click", () => this.refreshTelemetry());
  }

  averageLevel(bays) {
    const levels = bays.map((bay) => bay.level).filter((level) => level !== null);
    if (!levels.length) return null;
    return Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length);
  }

  metric(icon, label, value) {
    return `<div class="metric"><span class="metric-label">${this.icon(icon)} ${label}</span><strong>${value}</strong></div>`;
  }

  usage(icon, label, value) {
    return `<div class="usage-row"><span class="metric-label">${this.icon(icon)} ${label}</span><strong>${value}</strong></div>`;
  }

  summary(icon, label, value) {
    return `<div class="mini">${this.icon(icon)}<span class="muted">${label}</span><strong>${value}</strong></div>`;
  }

  batteryGroup(title, subtitle, bays, voltageTotal) {
    const average = this.averageLevel(bays);
    return `
      <div class="battery-group">
        <h3><span>${title}</span><strong>${voltageTotal ? `${voltageTotal}V` : ""}</strong></h3>
        <p class="group-subtitle">${subtitle}</p>
        <div class="metric" style="padding:8px 0;"><span class="muted">Average</span><strong>${average === null ? "N/A" : `${average}%`}</strong></div>
        <div class="bay-list">
          ${bays.length ? bays.map((bay) => this.bayRow(bay)).join("") : '<div class="muted">None</div>'}
        </div>
      </div>
    `;
  }

  bayRow(bay) {
    const level = bay.present ? bay.level : null;
    const color = this.chargeColor(level);
    const width = level === null ? "0%" : `${Math.max(0, Math.min(100, level))}%`;
    return `
      <div class="bay ${bay.present ? "" : "empty"}" style="--bay-color:${color};--level:${width};">
        <div>
          <div class="bay-name">Bay ${bay.index}</div>
          <strong>${bay.present ? `${bay.voltage || "?"}V` : "Empty"}</strong>
        </div>
        <div class="bay-bar"><div class="bay-fill"></div></div>
        <div class="bay-value">${level === null ? "--" : `${level}%`}</div>
      </div>
    `;
  }

  relative(value) {
    if (!value) return "N/A";
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.round(minutes / 60)} hr ago`;
  }
}

customElements.define("ryobi-zt54-dashboard-card", RyobiZt54DashboardCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ryobi-zt54-dashboard-card",
  name: "Ryobi ZT54 Dashboard",
  description: "Live Ryobi ZT54 mower telemetry dashboard",
});
