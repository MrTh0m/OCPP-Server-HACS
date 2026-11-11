/*
 * OCPP Server Cards
 * Deux cards Lovelace pour l'add-on Home Assistant « OCPP Backoffice Server » :
 *   - custom:ocpp-charger-card  : afficher et piloter un connecteur de borne
 *   - custom:ocpp-vehicle-card  : afficher les données d'un véhicule
 * Les entités sont celles que l'add-on publie par MQTT Discovery. Il suffit de
 * donner l'entité principale ; les autres sont retrouvées par leur nom, et
 * chacune peut être remplacée dans la clé `entities` de la configuration.
 */
const VERSION = "0.2.0";

/* Statuts OCPP 1.6 d'un connecteur. `hue` : rotation de teinte appliquée à
 * l'image (dont le voyant est vert), pour qu'une seule image suffise.
 * `step` : position sur la frise Disponible > Branchée > En charge > Terminée. */
const STATUS = {
  Available: { label: "Disponible", color: "#2e7d32", hue: 0, step: 0, title: "Prête à charger", hint: "Aucun véhicule branché" },
  Preparing: { label: "Véhicule branché", color: "#c25e00", hue: -80, step: 1, title: "Véhicule branché", hint: "En attente de démarrage" },
  Charging: { label: "En charge", color: "#1565c0", hue: 95, step: 2 },
  SuspendedEV: { label: "En pause", color: "#c25e00", hue: -80, step: 2, title: "En pause", hint: "Le véhicule a interrompu la charge" },
  SuspendedEVSE: { label: "En pause", color: "#c25e00", hue: -80, step: 2, title: "En pause", hint: "La borne a interrompu la charge" },
  Finishing: { label: "Charge terminée", color: "#00796b", hue: 50, step: 3, title: "Charge terminée", hint: "Vous pouvez débrancher le câble" },
  Reserved: { label: "Réservée", color: "#6a1b9a", hue: 160, step: -1, title: "Réservée", hint: "En attente du véhicule prévu" },
  Unavailable: { label: "Hors service", color: "#616161", gray: true, step: -1, title: "Hors service", hint: "Borne mise hors service" },
  Faulted: { label: "Défaut", color: "#c62828", hue: -120, step: -1, title: "Défaut", hint: "Vérifiez la borne" },
};
const OFFLINE = { label: "Hors ligne", color: "#616161", gray: true, step: -1, title: "Hors ligne", hint: "Dernières valeurs connues" };
const UNKNOWN_STATUS = { label: "Inconnu", color: "#616161", gray: true, step: -1, title: "Statut inconnu", hint: "" };
const SESSION_STATUSES = ["Charging", "SuspendedEV", "SuspendedEVSE", "Finishing"];
const STEPS = ["Disponible", "Branchée", "En charge", "Terminée"];
const NA = "n/d";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function num(st) {
  if (!st) return null;
  const v = parseFloat(st.state);
  return Number.isFinite(v) ? v : null;
}
const unitOf = (st) => (st && st.attributes && st.attributes.unit_of_measurement) || "";

function energyKwh(st) {
  const v = num(st);
  if (v === null) return null;
  const u = unitOf(st);
  if (u === "Wh") return v / 1000;
  if (u === "MWh") return v * 1000;
  return v;
}
function powerKw(st) {
  const v = num(st);
  if (v === null) return null;
  return unitOf(st) === "kW" ? v : v / 1000;
}
function minutes(st) {
  const v = num(st);
  if (v === null) return null;
  const u = unitOf(st);
  if (u === "h") return v * 60;
  if (u === "s") return v / 60;
  if (u === "d") return v * 1440;
  return v;
}
function fmt(v, digits, lang) {
  if (v === null || v === undefined) return NA;
  return new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
function fmtDuration(min) {
  if (min === null) return NA;
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}
function parseDate(st) {
  if (!st) return null;
  const d = new Date(st.state);
  return Number.isNaN(d.getTime()) ? null : d;
}
function currency(st) {
  const u = unitOf(st);
  return u === "EUR" || u === "" ? "€" : u;
}

const BASE_STYLE = `
  :host { display: block; }
  ha-card { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .title { font-size: 18px; font-weight: 500; line-height: 1.3; }
  .sub, .muted { color: var(--secondary-text-color); }
  .sub { font-size: 12px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; letter-spacing: 0.4px;
          text-transform: uppercase; border: 1px solid var(--accent); border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
  .grid { display: grid; gap: 10px; }
  .g2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .g4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tile { background: var(--secondary-background-color); border: 0; border-radius: 10px; padding: 12px; margin: 0;
          display: flex; flex-direction: column; gap: 4px; text-align: left; font: inherit; color: inherit; cursor: pointer; min-height: 44px; }
  .tile:focus-visible, .action:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .label { font-size: 11px; color: var(--secondary-text-color); }
  .value { font-size: 20px; font-weight: 500; line-height: 1.2; }
  .value.big { font-size: 30px; font-weight: 700; }
  .unit { font-size: 12px; font-weight: 400; color: var(--secondary-text-color); }
  .section { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: 12px; }
  .foot { border-top: 1px solid var(--divider-color); padding-top: 12px; }
  .warn { color: var(--error-color); font-size: 13px; }
`;

class OcppBaseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = null;
    this._ids = {};
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const sig = this._signature();
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  getCardSize() {
    return 6;
  }

  _st(key) {
    const id = this._ids[key];
    const st = id && this._hass ? this._hass.states[id] : undefined;
    if (!st || st.state === "unavailable" || st.state === "unknown") return undefined;
    return st;
  }

  _lang() {
    return (this._hass && this._hass.locale && this._hass.locale.language) || "fr";
  }

  _signature() {
    const parts = Object.values(this._ids).map((id) => {
      const st = this._hass.states[id];
      return st ? `${st.state}|${unitOf(st)}` : "-";
    });
    return parts.join(";") + ";" + this._lang();
  }

  _bind() {
    this.shadowRoot.querySelectorAll("[data-more]").forEach((el) => {
      el.addEventListener("click", () => {
        const entityId = this._ids[el.dataset.more];
        if (!entityId) return;
        this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId } }));
      });
    });
  }

  _tile(key, label, value, unit, sub, big) {
    return `<button class="tile" data-more="${key}">
      <span class="label">${esc(label)}</span>
      <span class="value${big ? " big" : ""}">${esc(value)}${unit && value !== NA ? ` <span class="unit">${esc(unit)}</span>` : ""}</span>
      ${sub ? `<span class="label">${esc(sub)}</span>` : ""}
    </button>`;
  }
}

/* ------------------------------------------------------------------ borne */

class OcppChargerCard extends OcppBaseCard {
  static getConfigForm() {
    const labels = {
      entity: "Capteur de statut du connecteur",
      name: "Nom affiché",
      subtitle: "Sous-titre (modèle, emplacement)",
      image: "Image de la borne (URL, facultatif)",
    };
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
        { name: "name", selector: { text: {} } },
        { name: "subtitle", selector: { text: {} } },
        { name: "image", selector: { text: {} } },
      ],
      computeLabel: (s) => labels[s.name] || s.name,
    };
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find((id) => /^sensor\..+_connecteur_\d+_statut$/.test(id));
    return { entity: entity || "", name: "Borne maison" };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("Indiquez `entity` : le capteur de statut du connecteur.");
    this._config = config;
    const ids = { status: config.entity };
    const m = /^sensor\.(.+)_connecteur_(\d+)_statut$/.exec(config.entity);
    if (m) {
      const pre = `sensor.${m[1]}_connecteur_${m[2]}_`;
      Object.assign(ids, {
        power: pre + "puissance",
        current: pre + "courant",
        voltage: pre + "tension",
        sessionEnergy: pre + "energie_session",
        sessionCost: pre + "cout_session",
        duration: pre + "duree_de_charge",
        start: pre + "debut_de_session",
        lastEnergy: pre + "derniere_charge_energie",
        lastCost: pre + "derniere_charge_cout",
        total: pre + "energie_totale",
        control: `switch.${m[1]}_connecteur_${m[2]}_autoriser_la_charge`,
        online: `binary_sensor.${m[1]}_en_ligne`,
        vehicle: `select.${m[1]}_connecteur_${m[2]}_vehicule`,
      });
    }
    this._ids = Object.assign(ids, config.entities || {});
    this._sig = null;
    if (this._hass) this.hass = this._hass;
  }

  _render() {
    const lang = this._lang();
    const cfg = this._config;
    const statusSt = this._st("status");
    const onlineSt = this._st("online");
    const offline = onlineSt ? onlineSt.state !== "on" : false;
    const status = statusSt ? statusSt.state : null;
    const meta = offline ? OFFLINE : STATUS[status] || UNKNOWN_STATUS;
    const inSession = !offline && SESSION_STATUSES.includes(status);

    let figure;
    if (!offline && status === "Charging") {
      const details = [];
      const a = num(this._st("current"));
      const v = num(this._st("voltage"));
      if (a !== null) details.push(`${fmt(a, 0, lang)} A`);
      if (v !== null) details.push(`${fmt(v, 0, lang)} V`);
      figure = `<div class="power"><span class="powerval">${esc(fmt(powerKw(this._st("power")), 1, lang))}</span><span class="powerunit">kW</span></div>
        <div class="hint">${esc(details.join(" · "))}</div>`;
    } else {
      figure = `<div class="state">${esc(meta.title)}</div><div class="hint">${esc(meta.hint)}</div>`;
    }

    const steps = STEPS.map((label, i) => {
      const cls = i === meta.step ? "step now" : i < meta.step ? "step done" : "step";
      return `<div class="${cls}"><span class="bar"></span><span>${esc(label)}</span></div>`;
    }).join("");

    let stats;
    if (inSession) {
      const startDate = parseDate(this._st("start"));
      const since = startDate
        ? "depuis " + new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(startDate)
        : "";
      stats = `<div class="grid g3">
        ${this._tile("sessionEnergy", "Énergie", fmt(energyKwh(this._st("sessionEnergy")), 1, lang), "kWh")}
        ${this._tile("sessionCost", "Coût", fmt(num(this._st("sessionCost")), 2, lang), currency(this._st("sessionCost")))}
        ${this._tile("duration", "Durée", fmtDuration(minutes(this._st("duration"))), "", since)}
      </div>`;
    } else {
      stats = `<div class="section"><div class="sub">Dernière charge</div><div class="grid g3">
        ${this._tile("lastEnergy", "Énergie", fmt(energyKwh(this._st("lastEnergy")), 1, lang), "kWh")}
        ${this._tile("lastCost", "Coût", fmt(num(this._st("lastCost")), 2, lang), currency(this._st("lastCost")))}
        ${this._tile("total", "Compteur", fmt(energyKwh(this._st("total")), 0, lang), "kWh")}
      </div></div>`;
    }

    let action = "";
    const hasControl = this._ids.control && this._hass.states[this._ids.control];
    if (hasControl && !offline) {
      if (["Charging", "SuspendedEV", "SuspendedEVSE"].includes(status)) {
        action = `<button class="action primary" data-service="turn_off"><ha-icon icon="mdi:stop"></ha-icon><span>Arrêter la charge</span></button>`;
      } else if (status === "Preparing") {
        action = `<button class="action primary" data-service="turn_on"><ha-icon icon="mdi:play"></ha-icon><span>Démarrer la charge</span></button>`;
      } else if (status === "Available") {
        action = `<button class="action" disabled>Branchez le câble pour démarrer</button>`;
      }
    }

    let picker = "";
    const vehSt = this._ids.vehicle ? this._hass.states[this._ids.vehicle] : undefined;
    if (vehSt && vehSt.state !== "unavailable" && Array.isArray(vehSt.attributes.options)) {
      // Pendant une session le serveur impose le véhicule de la session.
      const locked = offline || ["Charging", "SuspendedEV", "SuspendedEVSE"].includes(status);
      const opts = vehSt.attributes.options
        .map((o) => `<option value="${esc(o)}"${o === vehSt.state ? " selected" : ""}>${esc(o)}</option>`)
        .join("");
      picker = `<div class="section">
        <label class="sub" for="vehicle">${locked ? "Véhicule en charge" : "Véhicule pour la prochaine charge"}</label>
        <select id="vehicle"${locked ? " disabled" : ""}>${opts}</select>
      </div>`;
    }

    const foot = inSession
      ? `<div class="row foot muted"><span>Compteur : ${esc(fmt(energyKwh(this._st("total")), 0, lang))} kWh</span>
          <span>Précédente : ${esc(fmt(energyKwh(this._st("lastEnergy")), 1, lang))} kWh · ${esc(fmt(num(this._st("lastCost")), 2, lang))} ${esc(currency(this._st("lastCost")))}</span></div>`
      : "";

    const filter = meta.gray ? "grayscale(1) opacity(0.7)" : meta.hue ? `hue-rotate(${meta.hue}deg) saturate(1.2)` : "none";
    const missing = this._hass.states[this._ids.status] ? "" : `<div class="warn">Entité introuvable : ${esc(this._ids.status)}</div>`;

    this.shadowRoot.innerHTML = `<style>${BASE_STYLE}
      .hero { display: flex; gap: 20px; align-items: center; }
      .hero img { width: 104px; height: 152px; object-fit: contain; flex: none; }
      .hero .txt { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; min-width: 0; }
      .power { display: flex; align-items: baseline; gap: 6px; }
      .powerval { font-size: 52px; font-weight: 700; line-height: 1; }
      .powerunit { font-size: 20px; color: var(--secondary-text-color); }
      .state { font-size: 28px; font-weight: 700; line-height: 1.15; }
      .hint { font-size: 14px; color: var(--secondary-text-color); min-height: 1em; }
      .steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; font-size: 11px; text-align: center; color: var(--secondary-text-color); }
      .step { display: flex; flex-direction: column; gap: 6px; }
      .bar { height: 4px; border-radius: 2px; background: var(--divider-color); }
      .step.done .bar { background: var(--secondary-text-color); }
      .step.now { color: var(--primary-text-color); font-weight: 500; }
      .step.now .bar { background: var(--accent); }
      .action { height: 48px; border: 1px solid var(--divider-color); border-radius: 10px; background: var(--secondary-background-color);
                color: var(--secondary-text-color); font: inherit; font-size: 15px; font-weight: 500;
                display: flex; align-items: center; justify-content: center; gap: 8px; }
      .action.primary { border: 0; background: var(--accent); color: #fff; cursor: pointer; }
      select { height: 48px; border: 1px solid var(--divider-color); border-radius: 10px; padding: 0 12px;
               background: var(--secondary-background-color); color: var(--primary-text-color); font: inherit; font-size: 15px; }
      select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
      .online { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
    </style>
    <ha-card style="--accent: ${meta.color}">
      <div class="head">
        <div><div class="title">${esc(cfg.name || "Borne")}</div>${cfg.subtitle ? `<div class="sub">${esc(cfg.subtitle)}</div>` : ""}</div>
        ${onlineSt ? `<div class="online"><span class="dot" style="background: ${offline ? "#9e9e9e" : "#43a047"}"></span>${offline ? "Hors ligne" : "En ligne"}</div>` : ""}
      </div>
      ${missing}
      <div class="hero">
        <img src="${esc(cfg.image || CHARGER_IMG)}" alt="" style="filter: ${filter}">
        <div class="txt">
          <div class="chip"><span class="dot"></span>${esc(meta.label)}</div>
          ${figure}
        </div>
      </div>
      <div class="steps">${steps}</div>
      ${stats}
      ${picker}
      ${action}
      ${foot}
    </ha-card>`;

    this._bind();
    const sel = this.shadowRoot.querySelector("#vehicle");
    if (sel) {
      sel.addEventListener("change", () => {
        this._hass.callService("select", "select_option", { entity_id: this._ids.vehicle, option: sel.value });
      });
    }
    const btn = this.shadowRoot.querySelector("[data-service]");
    if (btn) {
      btn.addEventListener("click", () => {
        this._hass.callService("switch", btn.dataset.service, { entity_id: this._ids.control });
      });
    }
  }
}

/* ---------------------------------------------------------------- voiture */

class OcppVehicleCard extends OcppBaseCard {
  static getConfigForm() {
    const labels = { entity: "Capteur « En charge » du véhicule", name: "Nom affiché" };
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "binary_sensor" } } },
        { name: "name", selector: { text: {} } },
      ],
      computeLabel: (s) => labels[s.name] || s.name,
    };
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(
      (id) => /^binary_sensor\..+_en_charge$/.test(id) && hass.states[id.replace("binary_sensor.", "sensor.") + "_sur"]
    );
    return { entity: entity || "" };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("Indiquez `entity` : le capteur « En charge » du véhicule.");
    this._config = config;
    const ids = { charging: config.entity };
    const m = /^binary_sensor\.(.+)_en_charge$/.exec(config.entity);
    if (m) {
      const pre = `sensor.${m[1]}_`;
      Object.assign(ids, {
        chargingAt: pre + "en_charge_sur",
        sessionEnergy: pre + "energie_session",
        sessionCost: pre + "cout_session",
        duration: pre + "duree_de_charge",
        consumption: pre + "consommation_estimee",
        cost100: pre + "cout_aux_100_km",
        pct: pre + "derniere_charge_part_de_batterie",
        lastEnergy: pre + "derniere_charge_energie",
        lastCost: pre + "derniere_charge_cout",
        lastCharger: pre + "derniere_charge_borne",
        odometer: pre + "odometre_derniere_charge",
        kmSince: pre + "km_depuis_la_charge_precedente",
        capacity: pre + "capacite_batterie",
        monthCount: pre + "charges_du_mois",
        monthEnergy: pre + "energie_du_mois",
        monthCost: pre + "cout_du_mois",
        monthKm: pre + "distance_du_mois",
      });
    }
    this._ids = Object.assign(ids, config.entities || {});
    this._sig = null;
    if (this._hass) this.hass = this._hass;
  }

  _render() {
    const lang = this._lang();
    const chargingSt = this._hass.states[this._ids.charging];
    const charging = !!chargingSt && chargingSt.state === "on";
    const accent = charging ? STATUS.Charging.color : "#616161";

    let name = this._config.name;
    if (!name && chargingSt && chargingSt.attributes.friendly_name) {
      name = chargingSt.attributes.friendly_name.replace(/\s*En charge$/i, "");
    }

    const capacity = num(this._st("capacity"));
    const odometer = num(this._st("odometer"));
    const facts = [];
    if (capacity !== null) facts.push(`Batterie ${fmt(capacity, 0, lang)} kWh`);
    if (odometer !== null) facts.push(`${fmt(odometer, 0, lang)} km`);

    let session = "";
    if (charging) {
      const at = this._st("chargingAt");
      session = `<div class="section"><div class="sub">Charge en cours${at ? " · " + esc(at.state) : ""}</div><div class="grid g3">
        ${this._tile("sessionEnergy", "Énergie", fmt(energyKwh(this._st("sessionEnergy")), 1, lang), "kWh")}
        ${this._tile("sessionCost", "Coût", fmt(num(this._st("sessionCost")), 2, lang), currency(this._st("sessionCost")))}
        ${this._tile("duration", "Durée", fmtDuration(minutes(this._st("duration"))), "")}
      </div></div>`;
    }

    const lastEnergy = energyKwh(this._st("lastEnergy"));
    const lastCost = num(this._st("lastCost"));
    const pct = num(this._st("pct"));
    const lastCharger = this._st("lastCharger");
    const width = pct === null ? 0 : Math.max(0, Math.min(100, pct));
    const pctText =
      pct === null
        ? `${fmt(lastEnergy, 1, lang)} kWh`
        : `+${fmt(pct, 0, lang)} % de batterie (${fmt(lastEnergy, 1, lang)} kWh${capacity !== null ? ` sur ${fmt(capacity, 0, lang)}` : ""})`;

    let month = "";
    if (["monthCount", "monthEnergy", "monthCost", "monthKm"].some((k) => this._ids[k] && this._hass.states[this._ids[k]])) {
      const label = new Intl.DateTimeFormat(lang, { month: "long" }).format(new Date());
      const cell = (key, value, unit) =>
        `<button class="tile" data-more="${key}"><span class="value">${esc(value)}</span><span class="label">${esc(unit)}</span></button>`;
      month = `<div class="section"><div class="sub" style="text-transform: capitalize">${esc(label)}</div><div class="grid g4">
        ${cell("monthCount", fmt(num(this._st("monthCount")), 0, lang), "charges")}
        ${cell("monthEnergy", fmt(num(this._st("monthEnergy")), 1, lang), "kWh")}
        ${cell("monthCost", fmt(num(this._st("monthCost")), 2, lang), currency(this._st("monthCost")))}
        ${cell("monthKm", fmt(num(this._st("monthKm")), 0, lang), "km")}
      </div></div>`;
    }

    const missing = chargingSt ? "" : `<div class="warn">Entité introuvable : ${esc(this._ids.charging)}</div>`;

    this.shadowRoot.innerHTML = `<style>${BASE_STYLE}
      .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
      .who ha-icon { --mdc-icon-size: 32px; flex: none; }
      .track { height: 12px; border-radius: 6px; background: var(--divider-color); overflow: hidden; }
      .fill { height: 100%; background: #2e7d32; }
    </style>
    <ha-card style="--accent: ${accent}">
      <div class="head">
        <div class="who"><ha-icon icon="mdi:car-electric"></ha-icon>
          <div><div class="title">${esc(name || "Véhicule")}</div>${facts.length ? `<div class="sub">${esc(facts.join(" · "))}</div>` : ""}</div>
        </div>
        <div class="chip"><span class="dot"></span>${charging ? "En charge" : "Pas en charge"}</div>
      </div>
      ${missing}
      ${session}
      <div class="grid g2">
        ${this._tile("consumption", "Consommation estimée", fmt(num(this._st("consumption")), 1, lang), "kWh / 100 km", "", true)}
        ${this._tile("cost100", "Coût estimé", fmt(num(this._st("cost100")), 2, lang), "€ / 100 km", "", true)}
      </div>
      <div class="section">
        <div class="row"><span style="font-size: 13px">Dernière charge</span><span class="muted">${lastCharger ? esc(lastCharger.state) : ""}</span></div>
        <div class="track" role="img" aria-label="Part de batterie rechargée : ${pct === null ? "inconnue" : esc(fmt(pct, 0, lang)) + " %"}"><div class="fill" style="width: ${width}%"></div></div>
        <div class="row muted"><span>${esc(pctText)}</span><span>${esc(fmt(lastCost, 2, lang))} ${esc(currency(this._st("lastCost")))}</span></div>
      </div>
      <div class="grid g2">
        ${this._tile("kmSince", "Roulés avant la dernière charge", fmt(num(this._st("kmSince")), 0, lang), "km")}
        ${this._tile("odometer", "Odomètre (dernière charge)", fmt(odometer, 0, lang), "km")}
      </div>
      ${month}
    </ha-card>`;
    this._bind();
  }
}

if (!customElements.get("ocpp-charger-card")) customElements.define("ocpp-charger-card", OcppChargerCard);
if (!customElements.get("ocpp-vehicle-card")) customElements.define("ocpp-vehicle-card", OcppVehicleCard);

window.customCards = window.customCards || [];
window.customCards.push(
  { type: "ocpp-charger-card", name: "OCPP : borne", description: "Afficher et piloter un connecteur de borne (OCPP Backoffice Server).", preview: true },
  { type: "ocpp-vehicle-card", name: "OCPP : véhicule", description: "Données de charge d'un véhicule (OCPP Backoffice Server).", preview: true }
);
console.info(`%c OCPP-SERVER-CARDS %c ${VERSION} `, "color: #fff; background: #1565c0", "color: #1565c0; background: #fff");

/* Image par défaut : une borne murale générique, dessinée ici (aucune marque).
 * Son voyant est vert ; la card le recolore selon le statut. Pour une autre
 * image, utiliser l'option `image` avec un visuel à voyant vert lui aussi. */
const CHARGER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 176">
  <rect x="14" y="6" width="92" height="156" rx="20" fill="#f2f3f5" stroke="#b4b9c1" stroke-width="2"/>
  <rect x="25" y="17" width="70" height="134" rx="12" fill="#e2e5ea"/>
  <rect x="54" y="30" width="12" height="50" rx="6" fill="#34c759"/>
  <circle cx="60" cy="116" r="23" fill="#2b2f36" stroke="#34c759" stroke-width="4"/>
  <circle cx="51" cy="109" r="3.5" fill="#8a919c"/><circle cx="69" cy="109" r="3.5" fill="#8a919c"/>
  <circle cx="45" cy="119" r="3.5" fill="#8a919c"/><circle cx="60" cy="119" r="3.5" fill="#8a919c"/><circle cx="75" cy="119" r="3.5" fill="#8a919c"/>
  <circle cx="53" cy="129" r="3.5" fill="#8a919c"/><circle cx="67" cy="129" r="3.5" fill="#8a919c"/>
</svg>`;
const CHARGER_IMG = "data:image/svg+xml," + encodeURIComponent(CHARGER_SVG);
