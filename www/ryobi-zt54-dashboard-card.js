class RyobiZt54DashboardCard extends HTMLElement {
  setConfig(config) {
    this.config = {
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
      title: "RYOBI 54\" ZTR",
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
    const state = this.state(entityId)?.state;
    const value = Number(state);
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
    const raw = this.statusPayload();
    return raw.slice(8, 10) === "01";
  }

  bayLevel(index) {
    return this.numeric(`sensor.ryobi_zero_turn_battery_bay_${index}`);
  }

  bayVoltage(index) {
    return this.numeric(`sensor.ryobi_zero_turn_battery_bay_${index}_voltage_class`);
  }

  bayPresent(index) {
    return this.bool(`binary_sensor.ryobi_zero_turn_battery_bay_${index}_present`);
  }

  mainBattery() {
    const direct = this.numeric(this.config.entities.battery);
    if (direct !== null && direct > 0) return Math.round(direct);

    const traction = [];
    for (let bay = 1; bay <= 7; bay += 1) {
      if (this.bayPresent(bay) && this.bayVoltage(bay) === 80) {
        const level = this.bayLevel(bay);
        if (level !== null) traction.push(level);
      }
    }
    if (!traction.length) return direct ?? null;
    const avg = Math.round(traction.reduce((sum, value) => sum + value, 0) / traction.length);
    return avg === 100 && this.isCharging() ? 99 : avg;
  }

  chargeColor(percent) {
    if (percent === null) return "#8b949e";
    if (percent >= 80) return "#a8ff1a";
    if (percent >= 50) return "#f2e94e";
    if (percent >= 25) return "#ff9f1c";
    return "#ff3b30";
  }

  fmt(entityId, suffix = "", fallback = "N/A") {
    const state = this.state(entityId)?.state;
    if (!state || ["unknown", "unavailable"].includes(state)) return fallback;
    return `${state}${suffix}`;
  }

  render() {
    if (!this._hass || !this.config) return;

    const battery = this.mainBattery();
    const color = this.chargeColor(battery);
    const charging = this.isCharging();
    const online = this.bool(this.config.entities.online);
    const charger = this.chargerConnected();
    const signal = this.numeric(this.config.entities.signal);
    const baysInstalled = Array.from({ length: 7 }, (_, index) => index + 1)
      .filter((bay) => this.bayPresent(bay)).length;
    const status = charging ? "CHARGING" : charger ? "CHARGER CONNECTED" : online ? "READY" : "OFFLINE";

    this.innerHTML = `
      <style>
        :host {
          --accent: ${color};
          --card: #101419;
          --card-2: #0b0f13;
          --line: rgba(255,255,255,.09);
          --muted: #9aa4ad;
          --text: #edf3f7;
          display: block;
          color: var(--text);
          font-family: var(--ha-font-family-body, "Roboto", sans-serif);
        }
        .wrap {
          min-height: 100%;
          padding: 16px;
          background:
            radial-gradient(circle at 25% 18%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 28rem),
            linear-gradient(135deg, #090c10 0%, #12161d 48%, #080a0d 100%);
          box-sizing: border-box;
        }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(320px, .8fr);
          gap: 14px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .card {
          background: linear-gradient(180deg, rgba(20,25,32,.95), rgba(12,16,21,.95));
          border: 1px solid var(--line);
          border-radius: 8px;
          box-shadow: 0 18px 42px rgba(0,0,0,.32);
          overflow: hidden;
        }
        .panel { padding: 18px 20px; }
        .hero {
          display: grid;
          grid-template-columns: minmax(260px, 1fr) 220px;
          min-height: 330px;
          gap: 18px;
        }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: clamp(28px, 4vw, 46px); line-height: 1; letter-spacing: 0; }
        h2 { font-size: 15px; letter-spacing: 0; text-transform: uppercase; display: flex; align-items: center; gap: 9px; }
        .connected { color: #9fe8d5; margin-top: 12px; display: flex; gap: 8px; align-items: center; }
        .mower-stage {
          position: relative;
          min-height: 230px;
          display: grid;
          place-items: end center;
          isolation: isolate;
        }
        .mower-glow {
          position: absolute;
          width: min(80%, 470px);
          aspect-ratio: 5 / 1;
          bottom: 18px;
          border: 5px solid var(--accent);
          border-radius: 50%;
          filter: blur(.2px) drop-shadow(0 0 18px var(--accent));
          opacity: .88;
          animation: ${charging ? "pulse 1.8s ease-in-out infinite" : "none"};
          z-index: 0;
        }
        .mower {
          position: relative;
          z-index: 1;
          width: min(88%, 470px);
          height: 190px;
          filter: drop-shadow(0 0 22px color-mix(in srgb, var(--accent) 50%, transparent));
        }
        .deck, .hood, .seat, .rollbar, .wheel, .caster, .stripe { position: absolute; }
        .deck {
          left: 15%; right: 7%; bottom: 28px; height: 45px;
          border-radius: 12px 36px 18px 18px;
          background: linear-gradient(180deg, #2a3032, #111518);
          border: 1px solid #374145;
        }
        .hood {
          left: 24%; bottom: 74px; width: 40%; height: 48px;
          border-radius: 16px 18px 8px 8px;
          background: linear-gradient(160deg, #343b3f, #111518 62%);
          border: 1px solid #424d50;
        }
        .seat {
          left: 43%; bottom: 122px; width: 88px; height: 58px;
          border-radius: 20px 20px 8px 8px;
          background: linear-gradient(180deg, #333, #111);
          border-right: 5px solid var(--accent);
        }
        .rollbar {
          left: 36%; bottom: 138px; width: 140px; height: 72px;
          border: 8px solid #31383a; border-bottom: 0; border-radius: 34px 34px 0 0;
        }
        .wheel {
          bottom: 8px; width: 82px; height: 82px; border-radius: 50%;
          background: radial-gradient(circle, #2c3335 0 28%, #08090a 30% 100%);
          border: 5px solid #181d20;
        }
        .wheel.rear { right: 9%; transform: scale(1.18); }
        .wheel.front { left: 16%; }
        .caster {
          bottom: 9px; left: 4%; width: 48px; height: 48px; border-radius: 50%;
          background: radial-gradient(circle, var(--accent) 0 20%, #111 23% 100%);
          border: 4px solid #171c1f;
        }
        .stripe {
          left: 25%; right: 18%; bottom: 88px; height: 9px;
          background: var(--accent); border-radius: 999px;
          box-shadow: 0 0 16px var(--accent);
        }
        .charge-side { display: flex; flex-direction: column; justify-content: center; gap: 18px; }
        .status { color: var(--accent); font-weight: 800; letter-spacing: 0; }
        .percent { font-size: 76px; line-height: .9; color: var(--accent); font-weight: 900; text-shadow: 0 0 24px color-mix(in srgb, var(--accent) 65%, transparent); }
        .percent span { font-size: 32px; }
        .muted { color: var(--muted); }
        .button {
          margin-top: 22px; padding: 14px 16px; border-radius: 7px;
          border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line));
          background: color-mix(in srgb, var(--accent) 10%, #14191e);
          display: inline-flex; gap: 8px; align-items: center; color: var(--text);
        }
        .stack { display: grid; gap: 14px; }
        .gauge {
          width: 220px; height: 130px; margin: 12px auto 4px; position: relative;
          background: conic-gradient(from 270deg, var(--accent) 0deg, var(--accent) ${Math.max(0, Math.min(100, battery ?? 0)) * 1.8}deg, #ff9f1c ${Math.max(0, Math.min(100, battery ?? 0)) * 1.8}deg 180deg, transparent 180deg);
          border-radius: 220px 220px 0 0;
          -webkit-mask: radial-gradient(circle at 50% 100%, transparent 0 78px, #000 80px);
          mask: radial-gradient(circle at 50% 100%, transparent 0 78px, #000 80px);
        }
        .gauge-value { text-align: center; margin-top: -62px; color: var(--accent); font-size: 44px; font-weight: 900; }
        .metric, .usage-row {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          border-top: 1px solid var(--line); padding: 12px 0;
        }
        .metric:first-of-type { border-top: 0; }
        .metric strong, .usage-row strong { font-size: 18px; }
        .bays {
          display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 18px; align-items: center;
          min-height: 250px;
        }
        .bay-col { display: grid; gap: 12px; }
        .bay {
          border: 1px solid color-mix(in srgb, var(--bay-color) 70%, var(--line));
          color: var(--bay-color);
          border-radius: 7px; padding: 10px 12px; text-align: center; font-weight: 900;
          background: color-mix(in srgb, var(--bay-color) 12%, #11161b);
          box-shadow: 0 0 16px color-mix(in srgb, var(--bay-color) 38%, transparent);
        }
        .bay.off { opacity: .35; filter: grayscale(1); }
        .bay-voltage { font-size: 14px; color: var(--accent); margin-bottom: -4px; text-align: center; font-weight: 800; }
        .bay-body {
          min-height: 210px; border-radius: 44px 44px 20px 20px; border: 1px solid rgba(255,255,255,.06);
          background: radial-gradient(circle at 50% 48%, rgba(255,255,255,.08), transparent 28%), linear-gradient(90deg, #101417, #202528, #101417);
          box-shadow: inset 0 0 34px rgba(0,0,0,.65), 0 0 18px color-mix(in srgb, var(--accent) 20%, transparent);
        }
        .status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .mini {
          border: 1px solid var(--line); border-radius: 7px; padding: 14px; text-align: center;
          background: rgba(255,255,255,.025);
        }
        .quick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .quick button {
          border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--line));
          background: color-mix(in srgb, var(--accent) 12%, #10151a);
          color: var(--text); border-radius: 7px; padding: 13px 12px; font: inherit;
        }
        .quick button.warn {
          border-color: rgba(255,159,28,.45); background: rgba(255,120,20,.18);
        }
        .bottom-nav {
          grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
          padding: 10px; color: var(--muted);
        }
        .bottom-nav div { text-align: center; padding: 12px; }
        .bottom-nav .active { color: var(--accent); font-weight: 800; }
        @keyframes pulse {
          0%, 100% { opacity: .55; transform: scale(.96); filter: drop-shadow(0 0 12px var(--accent)); }
          50% { opacity: 1; transform: scale(1.02); filter: drop-shadow(0 0 34px var(--accent)); }
        }
        @media (max-width: 900px) {
          .grid, .hero { grid-template-columns: 1fr; }
          .charge-side { align-items: flex-start; }
          .bays { grid-template-columns: 1fr; }
          .status-grid, .quick, .bottom-nav { grid-template-columns: 1fr 1fr; }
          .panel { padding: 16px; }
        }
      </style>
      <div class="wrap">
        <div class="grid">
          <section class="card hero panel">
            <div>
              <h1>${this.config.title}</h1>
              <div class="connected">⌁ ${online ? "Connected" : "Disconnected"}</div>
              <div class="mower-stage">
                <div class="mower-glow"></div>
                <div class="mower" aria-label="Ryobi mower">
                  <div class="rollbar"></div><div class="seat"></div><div class="hood"></div>
                  <div class="deck"></div><div class="stripe"></div>
                  <div class="wheel front"></div><div class="wheel rear"></div><div class="caster"></div>
                </div>
              </div>
            </div>
            <div class="charge-side">
              <div class="status">⚡ ${status}</div>
              <div class="percent">${battery ?? "N/A"}${battery === null ? "" : "<span>%</span>"}</div>
              <div>
                <p>Charge Level</p>
                <p class="muted">${charging ? "Charging to 100%" : "Live mower telemetry"}</p>
              </div>
              <div class="button">⌖ View on Map</div>
            </div>
          </section>

          <section class="card panel stack">
            <h2>▣ Battery Overview</h2>
            <div>
              <div class="gauge"></div>
              <div class="gauge-value">${battery ?? "N/A"}${battery === null ? "" : "%"}</div>
              <p class="muted" style="text-align:center;">TOTAL CHARGE</p>
            </div>
            ${this.metric("⚡", "Total Voltage", this.fmt(this.config.entities.voltage, " V"))}
            ${this.metric("↯", "Current", this.fmt(this.config.entities.current, " A"))}
            ${this.metric("⚡", "Power", this.fmt(this.config.entities.power, " W"))}
            ${this.metric("▣", "Battery Reference", this.fmt(this.config.entities.bayReference, "%"))}
            <p style="text-align:center;color:var(--accent);">${baysInstalled} / 7 Bays Installed</p>
          </section>

          <section class="card panel">
            <h2>▣ Battery Bays</h2>
            <div class="bays">
              <div class="bay-col">${this.bay(1)}${this.bay(2)}${this.bay(3)}</div>
              <div class="bay-body"></div>
              <div class="bay-col">${this.bay(4)}${this.bay(5)}${this.bay(6)}${this.bay(7)}</div>
            </div>
          </section>

          <section class="card panel stack">
            <h2>◴ Runtime & Usage</h2>
            ${this.usage("◷", "Total Run Hours", this.fmt(this.config.entities.totalHours, " hrs"))}
            ${this.usage("⚒", "Inspect Blades In", this.fmt(this.config.entities.bladeHours, " hrs"))}
            ${this.usage("▥", "Drive Hours", this.fmt(this.config.entities.driveHours, " hrs"))}
          </section>

          <section class="card panel stack">
            <h2>⚒ Blade Status</h2>
            <div class="metric"><span class="muted">Blades Active</span><strong>${this.bool(this.config.entities.bladesActive) ? "Yes" : "No"}</strong></div>
            <div class="metric"><span class="muted">Blade Hours</span><strong>${this.fmt(this.config.entities.bladeHours, " hrs")}</strong></div>
          </section>

          <section class="card panel stack">
            <h2>⌖ Location</h2>
            <div class="mini" style="min-height:110px;display:grid;place-items:center;color:var(--accent);font-size:44px;">⌖</div>
            <div class="metric"><span>Outside</span><strong class="muted">Last seen ${this.relative(this.state(this.config.entities.signal)?.last_updated)}</strong></div>
          </section>

          <section class="card panel stack">
            <h2>🛡 System Status</h2>
            <div class="status-grid">
              <div class="mini">⚡<br><span class="muted">Charger</span><br><strong>${charger ? "Connected" : "Disconnected"}</strong></div>
              <div class="mini">⌁<br><span class="muted">Signal</span><br><strong>${signal ?? "N/A"} dBm</strong></div>
              <div class="mini">◎<br><span class="muted">Online</span><br><strong>${online ? "Connected" : "Offline"}</strong></div>
            </div>
          </section>

          <section class="card panel stack">
            <h2>⚡ Quick Actions</h2>
            <div class="quick">
              <button>▶ Start Mowing</button>
              <button>⌂ Return to Base</button>
              <button>⌖ Locate Mower</button>
              <button class="warn">⚒ Blade Inspection</button>
            </div>
          </section>

          <nav class="card bottom-nav">
            <div class="active">⌂ Dashboard</div><div>◷ History</div><div>⚡ Automations</div><div>⚙ Settings</div>
          </nav>
        </div>
      </div>
    `;
  }

  metric(icon, label, value) {
    return `<div class="metric"><span>${icon} <span class="muted">${label}</span></span><strong>${value}</strong></div>`;
  }

  usage(icon, label, value) {
    return `<div class="usage-row"><span>${icon} <span class="muted">${label}</span></span><strong>${value}</strong></div>`;
  }

  bay(index) {
    const present = this.bayPresent(index);
    const level = this.bayLevel(index);
    const voltage = this.bayVoltage(index);
    const color = this.chargeColor(level);
    return `<div>
      <div class="bay-voltage">${voltage || ""}${voltage ? "V" : ""}</div>
      <div class="bay ${present ? "" : "off"}" style="--bay-color:${color};">${present ? `${level ?? "N/A"}%` : "Empty"}</div>
    </div>`;
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
