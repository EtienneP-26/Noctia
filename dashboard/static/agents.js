"use strict";
const MODELS = ["haiku", "sonnet", "opus", "fable", "inherit"];
const KNOWN = ["chief", "orchestrator", "developer", "tester", "reader", "documenter", "pentester", "designer", "legal"];

/** Create an element with a class and optional text. */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/** Show a state message on a card; kind is "", "ok" or "err". */
function setState(card, kind, msg) {
  const s = card.querySelector(".ag-state");
  s.className = "ag-state " + kind;
  s.textContent = msg;
}

/** POST JSON to an absolute URL; resolve with the updated agent or throw. */
async function post(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
  return data;
}

/** Add a revert button to the card's state line. */
function addRevert(card, undo) {
  const b = el("button", "ag-revert", "Revert");
  b.type = "button";
  b.addEventListener("click", () => { undo(); setState(card, "", ""); });
  card.querySelector(".ag-state").appendChild(b);
}

/** Save one field; show saving, saved (fading) or error with revert. */
async function save(card, path, body, undo) {
  setState(card, "", "saving…");
  try {
    await post(path, body);
    setState(card, "ok", "saved ✓");
  } catch (e) {
    undo();
    setState(card, "err", "error: " + e.message + " ");
    addRevert(card, undo);
  }
}

/** Reflect the model on the badge and the radio buttons. */
function showModel(card, model) {
  card.querySelector(".ag-badge").textContent = model;
  card.querySelectorAll(".ag-seg [role=radio]").forEach((b) => {
    const on = b.dataset.model === model;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

/** Build the segmented model control (radio-group semantics). */
function segmented(a) {
  const g = el("div", "ag-seg");
  g.setAttribute("role", "radiogroup");
  g.setAttribute("aria-label", "Model for " + a.name);
  MODELS.forEach((m) => {
    const b = el("button", "", m);
    b.type = "button";
    b.dataset.model = m;
    b.setAttribute("role", "radio");
    g.appendChild(b);
  });
  g.addEventListener("keydown", (e) => arrowKeys(g, e));
  return g;
}

/** Move selection with arrow keys inside the segmented control. */
function arrowKeys(g, e) {
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!d) return;
  e.preventDefault();
  const bs = [...g.children];
  const i = bs.indexOf(document.activeElement);
  const next = bs[(i + d + bs.length) % bs.length];
  next.focus();
  next.click();
}

/** Build the labelled on/off switch. */
function toggle(a) {
  const l = el("label", "ag-switch");
  const box = el("input");
  box.type = "checkbox";
  box.setAttribute("role", "switch");
  box.setAttribute("aria-label", "Enabled for " + a.name);
  const track = el("span", "ag-track");
  track.setAttribute("aria-hidden", "true");
  l.append(box, track);
  if (a.name === "chief") { box.disabled = true; l.title = "chief is always on"; }
  return l;
}

/** Wire the model and enabled handlers for a card. */
function wire(card, a) {
  const base = "/api/agents/" + encodeURIComponent(a.name);
  const box = card.querySelector("input");
  let model = card.dataset.model;
  card.querySelector(".ag-seg").addEventListener("click", (e) => {
    const m = e.target.dataset && e.target.dataset.model;
    if (!m || m === model) return;
    const prev = model; model = m; showModel(card, m);
    save(card, base + "/model", { model: m }, () => { model = prev; showModel(card, prev); });
  });
  box.addEventListener("change", () => {
    const prev = !box.checked;
    card.classList.toggle("off", !box.checked);
    save(card, base + "/enabled", { enabled: box.checked }, () => {
      box.checked = prev; card.classList.toggle("off", !prev);
    });
  });
}

/** Build the card head: avatar, name, model badge. */
function head(a) {
  const h = el("div", "ag-head");
  const av = el("span", "ag-avatar", (a.name[0] || "?").toUpperCase());
  av.setAttribute("aria-hidden", "true");
  const id = el("div", "ag-id");
  id.append(el("h2", "ag-name", a.name), el("span", "ag-badge"));
  h.append(av, id, toggle(a));
  return h;
}

/** Build the tool chips row. */
function chips(a) {
  const c = el("div", "ag-chips");
  const t = Array.isArray(a.tools) ? a.tools : String(a.tools || "").split(",");
  t.map((x) => x.trim()).filter(Boolean).forEach((x) => c.appendChild(el("span", "ag-chip", x)));
  return c;
}

/** Build one agent card. */
function buildCard(a) {
  const card = el("li", "ag-card");
  const known = KNOWN.includes(a.name);
  card.style.setProperty("--ag", known ? "var(--c-" + a.name + ")" : "var(--muted)");
  card.dataset.model = MODELS.includes(a.model) ? a.model : "inherit";
  const st = el("div", "ag-state");
  st.setAttribute("role", "status");
  card.append(head(a), el("p", "ag-desc", a.description || ""), chips(a), segmented(a), st);
  const on = a.name === "chief" || !!a.enabled;
  card.querySelector("input").checked = on;
  card.classList.toggle("off", !on);
  showModel(card, card.dataset.model);
  wire(card, a);
  return card;
}

/** Load agents and render the grid. */
async function load() {
  const list = document.getElementById("list");
  try {
    const r = await fetch("/api/agents");
    if (!r.ok) throw new Error("HTTP " + r.status);
    (await r.json()).forEach((a) => list.appendChild(buildCard(a)));
  } catch (e) {
    list.appendChild(el("li", "ag-note", "Could not load agents: " + e.message));
  }
}

load();
