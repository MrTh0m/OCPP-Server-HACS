/*
 * OCPP Server Cards
 * Deux cards Lovelace pour l'add-on Home Assistant « OCPP Backoffice Server » :
 *   - custom:ocpp-charger-card  : afficher et piloter un connecteur de borne
 *   - custom:ocpp-vehicle-card  : afficher les données d'un véhicule
 * Les entités sont celles que l'add-on publie par MQTT Discovery. Il suffit de
 * donner l'entité principale ; les autres sont retrouvées par leur nom, et
 * chacune peut être remplacée dans la clé `entities` de la configuration.
 */
const VERSION = "0.1.0";

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
      ${action}
      ${foot}
    </ha-card>`;

    this._bind();
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

/* Image par défaut de la borne (voyant vert), recolorée selon le statut. */
const CHARGER_IMG = "data:image/png;base64,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co/R5xKATj/9dJqamtixYwclJSVEIhGeffZZiouLOeuss05OF/oHP/gBN954I7Nnz6akpCTLde7s7KSzs5Ovfe1rXH755SSTyUFN91JKryTkDoouqFsU1kTFxS0tLfzpT3+is7OTc845h/r6enp7ezl69CjV1dUkEgk+8pGPsHXrVubPn093dzft7e1s3ryZM8888+QC8IEDB1i/fj2Kogwii3d1dXHw4EE+97nPcfPNN3v9vblUM9x2sAKhorAmWgXEtm1isRiPPfYYf/3rX7nxxhvx+XwkEglKSkrQNI3Dhw97ia358+fT1NTEokWL2Lx5syfgP+VdaCklN954I9u3b2fu3LlZMW8sFqOxsZHrrruO97///Vku9VhmBBUAXFjj5VK7feOLFy9GURS++93vUlNTw8yZMz2A67rOhg0bePHFFzl8+DCzZs3ipZdeoru7m4svvvjksMD3338/1157LQsWLPDIFUII4vE4jY2NXH/99fzbv/0bUkpCoZDXIZLLhc6nuFAAcGFNtLDeE088wZe//GVuvvlmVq9eTV9fH/F4nNLSUi+J5fP5KC4upqWlhSeeeIK1a9dObQDv37+fdevWoes61dXV3gWxLIvdu3dzwQUX8I1vfINUKkUqlSIYDHpDwTJd5WMlWRQAXFgcY0eTlJKnnnqKL37xi/y///f/mDVrFolEwtuzjz76KJ/4xCcoKioilUqxatUq/vrXvw47j3pSu9Cu6zx79uwsIL7yyivU1tZyxx13UFVV5elWZYp45xt+XQBwYZ2IpSgKc+bMobS0lK9+9asIIVi5cqUnQj9z5kzmzZvHX//6V4qKinjppZdYuHAhq1evnpoW+IEHHuCtb30rc+bMIRQKeTWypqYmampquPvuu5k9e7YX87rE8sz5OIUe3MKabMktIQS7du3iIx/5CBdeeCFXXnklsVgMy7IoKSnhV7/6FZ///Ofx+/3U1dXxt7/9jdra2qllgTs7O3nLW96CZVlUVVV5ySm3OP7d736XpUuXeo0JrkaRmxjInJlbAHBhTbZ6cV1dHeeffz533XUXPp+PBQsWeK72kiVLsG2bp59+mq6uLjo6Orj00ksndA+OOxPr9ttvZ+/evTQ0NHjxQ09PDz09PbzrXe9i9uzZxGKxLNfYncHrgvckmDleWCfpMgyDGTNm8IUvfIEf/ehHPP300x6p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/e9/z+zZsz2e85YtW2hoaGD9+vUFAOcxkZqmOQr8776Zhx5+iGWXrWbmqXMRAmzLdhLKw23WDITKXH6xOEGFUzHCgDlHf6abnLNtm1BlEeuuOwNtZoB33HADDz30ELquF0A8hEd38cUXs3nzZmpra6mrq/Pc6JwAFkJw8OBBXnjhBc466ywCgQCpVIo///nPvO1tb8Pv9xeSVzmWz+cjFovxrnfeyCPPbeKMm89h5qlznI2uks4ui5FnloeqIOXKcuUD+UhAKYb5W74AfLjickbpSdEUVJ8GUhIoC7LmH06l6owG3vHOd3DnnXfi9/kKICZ3Tfj0009HSklTUxMbN27kkUceGUSgUjID42effRYpJatXrwbgyJEjxONxNmzYkKX/XFh4nUMHDhzgxnfeyONbN7PmmlMpmVGGbTtk5BG7zBPpz44ExGIMvRhi+OKzyDyUVAVpObXuea9bxIILlvLFL32Rz3/u895YnsLKtsAlJSWsXbuWXbt2cfHFFxONRnnttdeyhBeUTKv62GOPUVpayvz587Esi5deeomFCxdSVlZWGFA2YKmqSjwe50Mf/BCbnn6MU284i5IZpdimlQavGB37YrxL0nKI2lO+bgIx/odJluFWFK8ZY/aZ81ly8Uq+9F9f4v6f/5xwOFzYVDms8GmnncaOHTtYsGABq1atYtu2bflj4Mcee4wVK1YQiTi0vmeffZYNGzYUZhzl6CJyYt73sPnvmzn17WcRqStB2hKhniBt7AHdSDl/J4+DByCG+FXaK5HplMDss+az+M0ruO3W23j00UezstOF5SSzli5dipSSgwcPsmTJEl544YXBABZCsGfPHhobG5k5c6bXtH/kyBFOP/30QvJqAHgB3ve+9/GHP/8fy9+8huKGMizTHh0QxAQDWYzSpT5eubC0dyIlSMumYc0sZIXKje+8kSc2P5G7TjyN3ehIJMK8efPYsWMHc+fO5emnn/a8Ya8OLITg6NGjxGIxZs2aRTQaZc+ePdTV1TF//vycnUfTOe79n//5H37729+ycOMyalc1INw81SgsrxgHjWOYugKTQnG0TbSAzsrL1mBFJO+68V00NTWNupuJk7zNcPHixezYsYPS0lJUVfWGKWS50H/605/w+/0sWrQI27bZtGkT55577ojI6NNlBYNBHn74YT71yU8x8/S5zH3dgoyOITGk4iU5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";
