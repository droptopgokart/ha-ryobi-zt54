class RyobiZt54DashboardCard extends HTMLElement {
  setConfig(config) {
    this.config = {
      title: 'RYOBI 54" ZTR',
      assetVersion: "20260618-5",
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
      return Math.round(direct);
    }

    const driveLevels = this.allBays()
      .filter((bay) => bay.present && bay.voltage === 80 && bay.level !== null)
      .map((bay) => bay.level);
    if (!driveLevels.length) return direct ?? null;

    const average = Math.round(
      driveLevels.reduce((sum, level) => sum + level, 0) / driveLevels.length,
    );
    return average;
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
    if (name === "zt54:zero-turn") {
      return `
        <svg class="zt-icon" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
          <path d="M15 24h29c4.8 0 8.7-2 11.7-6l2.4 1.8c-3.6 5.1-8.4 7.7-14.1 7.7H15z" />
          <path d="M19 22l6-11h13l8 11h-5.2l-5.5-7.3h-7.8L23.2 22z" />
          <path d="M34 12h7.4c4.2 0 7.8 2.8 8.8 6.8l.8 3.2h-5.2l-.4-1.9c-.5-2.4-2.6-4.1-5.1-4.1H34z" />
          <path d="M12.8 21.5c0-4 2.9-7.2 6.4-7.2h4.1v3.4h-4.1c-1.6 0-3 1.7-3 3.8z" />
          <path d="M24.5 8h9.2v3.4h-9.2z" />
          <circle cx="17.5" cy="29.5" r="7.2" />
          <circle cx="48.5" cy="29.5" r="7.2" />
          <circle class="zt-cutout" cx="17.5" cy="29.5" r="3.1" />
          <circle class="zt-cutout" cx="48.5" cy="29.5" r="3.1" />
          <path d="M6 28h6v3H6zM54 28h5v3h-5z" />
        </svg>
      `;
    }
    return `<ha-icon icon="${name}"></ha-icon>`;
  }

  async refreshTelemetry() {
    if (this._refreshing) return;
    this._refreshing = true;
    this._lastManualRefresh = new Date();
    this._refreshResult = "Refreshing now";
    this.render();
    try {
      await this._hass.callService("homeassistant", "update_entity", {
        entity_id: this.config.entities.signal,
      });
      this._refreshResult = "Refresh requested";
    } catch (err) {
      this._refreshResult = "Refresh failed";
      throw err;
    } finally {
      window.setTimeout(() => {
        this._refreshing = false;
        this.render();
      }, 1200);
    }
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
    const driveClass = this.packClass(driveBays);
    const accessoryClass = this.packClass(accessoryBays);
    const driveAverage = this.averageLevel(driveBays);
    const accessoryAverage = this.averageLevel(accessoryBays);
    const ringExt = charging ? "gif" : "png";
    const mowerImage = `/local/ryobi-zt54/ryobi-zt54-mower-clean.png?v=${this.config.assetVersion}`;
    const ringImage = `/local/ryobi-zt54/ryobi-zt54-ring-${tone}.${ringExt}?v=${this.config.assetVersion}`;
    const status = charging ? "Charging" : charger ? "Charger connected" : online ? "Ready" : "Offline";
    const refreshLabel = this._refreshing ? "Refreshing..." : "Refresh Telemetry";
    const refreshToolsLabel = this._refreshing ? "Refreshing..." : "Refresh Data";
    const refreshIcon = this._refreshing ? "mdi:loading" : "mdi:refresh";
    const manualRefreshText = this._lastManualRefresh
      ? `${this._refreshResult || "Refresh requested"} ${this.relative(this._lastManualRefresh.toISOString())}`
      : "Not tapped this session";

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
        .zt-icon {
          width: 22px;
          height: 22px;
          color: var(--accent);
          fill: currentColor;
          flex: 0 0 auto;
          display: inline-block;
          vertical-align: middle;
        }
        .zt-icon .zt-cutout {
          fill: var(--card);
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
          min-height: 286px;
          display: grid;
          align-items: end;
          justify-items: center;
          margin-top: 8px;
        }
        .mower-visual {
          position: relative;
          width: min(100%, 560px);
          aspect-ratio: 1.55;
        }
        .glow-ring {
          position: absolute;
          left: 50%;
          bottom: 2px;
          width: 96%;
          transform: translateX(-50%);
          object-fit: contain;
          z-index: 1;
          pointer-events: none;
        }
        .mower-image {
          position: absolute;
          left: 50%;
          bottom: 28px;
          width: 96%;
          max-height: 315px;
          transform: translateX(-50%);
          object-fit: contain;
          filter: drop-shadow(0 18px 24px rgba(0,0,0,.5));
          z-index: 2;
          pointer-events: none;
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
        button.tool:disabled {
          cursor: progress;
          opacity: .82;
        }
        button.tool.busy ha-icon {
          animation: spin 850ms linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
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
                <div class="mower-visual">
                  <img class="glow-ring" src="${ringImage}" alt="" aria-hidden="true">
                  <img class="mower-image" src="${mowerImage}" alt="Ryobi 54 inch zero-turn mower">
                </div>
              </div>
            </div>
            <div class="charge-side">
              <div class="status">${this.icon(charging ? "mdi:battery-charging" : "mdi:battery")} ${status}</div>
              <div class="percent">${battery ?? "N/A"}${battery === null ? "" : "<span>%</span>"}</div>
              <div>
                <p>Charge Level</p>
                <p class="muted">${charging ? "Charging to 100%" : "Live mower telemetry"}</p>
              </div>
              <button type="button" class="tool ${this._refreshing ? "busy" : ""}" id="refresh-main" ${this._refreshing ? "disabled" : ""}>${this.icon(refreshIcon)} ${refreshLabel}</button>
            </div>
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:battery-high")} Battery Overview</h2>
            <div>
              <div class="gauge"></div>
              <div class="gauge-value">${battery ?? "N/A"}${battery === null ? "" : "%"}</div>
              <p class="muted" style="text-align:center;">80V drive pack charge shown in app</p>
            </div>
            ${this.metric("mdi:car-battery", "Drive pack voltage class", driveClass === null ? "N/A" : `${driveClass} V parallel`)}
            ${this.metric("mdi:battery-heart-variant", "80V drive pack average", driveAverage === null ? "N/A" : `${driveAverage}%`)}
            ${this.metric("mdi:battery-outline", "40V accessory bay average", accessoryAverage === null ? "N/A" : `${accessoryAverage}%`)}
            ${this.metric("mdi:counter", "Bays installed", `${presentBays.length} / 7`)}
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:battery-multiple")} Battery Bays</h2>
            <div class="battery-layout">
              ${this.batteryGroup("40V Accessory Bays", "Parallel 40V accessory batteries. Voltage class is not summed.", accessoryBays, accessoryClass)}
              ${this.batteryGroup("80V Drive Pack", "Parallel 80V traction batteries. This group drives the app charge level.", driveBays, driveClass)}
              ${this.batteryGroup("Open Bays", "Installed state from Bluetooth telemetry.", emptyBays, null)}
            </div>
          </section>

          <section class="card panel stack">
            <h2>${this.icon("mdi:clock-outline")} Runtime & Usage</h2>
            ${this.usage("mdi:timer-outline", "Total Run Hours", this.fmt(this.config.entities.totalHours, " hrs"))}
            ${this.usage("zt54:zero-turn", "Inspect Blades In", this.fmt(this.config.entities.bladeHours, " hrs"))}
            ${this.usage("mdi:chart-bar", "Drive Hours", this.fmt(this.config.entities.driveHours, " hrs"))}
          </section>

          <section class="card panel stack">
            <h2>${this.icon("zt54:zero-turn")} Blade Status</h2>
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
              <button type="button" class="tool ${this._refreshing ? "busy" : ""}" id="refresh-tools" ${this._refreshing ? "disabled" : ""}>${this.icon(refreshIcon)} ${refreshToolsLabel}</button>
              <div class="mini">${this.icon("mdi:clock-check-outline")}<span class="muted">Last signal update</span><strong>${this.relative(this.state(this.config.entities.signal)?.last_updated)}</strong></div>
              <div class="mini">${this.icon("mdi:gesture-tap-button")}<span class="muted">Manual refresh</span><strong>${manualRefreshText}</strong></div>
            </div>
          </section>

          <div class="card bottom-note">
            Dashboard values are live Home Assistant entities from the Ryobi ZT54 Bluetooth integration. No autonomous start/return controls are shown for this zero-turn mower.
          </div>
        </div>
      </div>
    `;

    this.querySelector("#refresh-main")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.refreshTelemetry();
    });
    this.querySelector("#refresh-tools")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.refreshTelemetry();
    });
  }

  averageLevel(bays) {
    const levels = bays.map((bay) => bay.level).filter((level) => level !== null);
    if (!levels.length) return null;
    return Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length);
  }

  packClass(bays) {
    const classes = [...new Set(
      bays
        .map((bay) => bay.voltage)
        .filter((voltage) => voltage !== null && voltage > 0),
    )];
    if (classes.length !== 1) return classes[0] ?? null;
    return classes[0];
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

  batteryGroup(title, subtitle, bays, voltageClass) {
    const average = this.averageLevel(bays);
    const installed = bays.filter((bay) => bay.present).length;
    const count = installed || bays.length;
    const countLabel = installed ? "Installed" : "Slots";
    return `
      <div class="battery-group">
        <h3><span>${title}</span><strong>${voltageClass ? `${voltageClass}V class` : "Open"}</strong></h3>
        <p class="group-subtitle">${subtitle}</p>
        <div class="metric" style="padding:8px 0;"><span class="muted">${countLabel}</span><strong>${count} bay${count === 1 ? "" : "s"}</strong></div>
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

customElements.define("ryobi-zt54-dashboard-card-v7", RyobiZt54DashboardCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "ryobi-zt54-dashboard-card-v7",
  name: "Ryobi ZT54 Dashboard",
  description: "Live Ryobi ZT54 mower telemetry dashboard",
});
