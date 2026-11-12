/* Settings page: load, bind controls, POST partial changes. */
const status = document.getElementById("st-status");
let current = {};

/** Show a short inline message; err marks it as an error. */
function say(msg, err) {
  status.textContent = msg;
  status.classList.toggle("err", !!err);
}

/** POST a partial settings object; return the full settings or throw. */
async function post(body) {
  const r = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
  return data;
}

/** Set one control's displayed value. */
function paint(ctl, value) {
  if (ctl.classList.contains("st-switch")) ctl.setAttribute("aria-checked", String(value));
  else if (ctl.classList.contains("st-seg")) {
    for (const b of ctl.children) b.setAttribute("aria-checked", String(b.dataset.value === value));
  } else ctl.value = String(value);
}

/** Paint every control from a full settings object. */
function paintAll(s) {
  current = s;
  for (const ctl of document.querySelectorAll("[data-section]")) {
    const v = s[ctl.dataset.section]?.[ctl.dataset.key];
    if (v !== undefined) paint(ctl, v);
  }
}

/** Save one value; on failure revert the control and show the error. */
async function change(ctl, value) {
  const { section, key } = ctl.dataset;
  try {
    paintAll(await post({ [section]: { [key]: value } }));
    say("enregistré");
  } catch (e) {
    paint(ctl, current[section]?.[key]);
    say("erreur : " + e.message, true);
  }
}

/** Wire events for all controls. */
function bind() {
  for (const ctl of document.querySelectorAll("[data-section]")) {
    if (ctl.classList.contains("st-switch")) {
      ctl.addEventListener("click", () => change(ctl, ctl.getAttribute("aria-checked") !== "true"));
    } else if (ctl.classList.contains("st-seg")) {
      ctl.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (b) change(ctl, b.dataset.value);
      });
    } else {
      ctl.addEventListener("change", () => change(ctl, ctl.type === "number" || ctl.dataset.type === "int" ? Number(ctl.value) : ctl.value));
    }
  }
}

/** Load settings then bind. */
async function init() {
  try {
    const r = await fetch("/api/settings");
    if (!r.ok) throw new Error("HTTP " + r.status);
    paintAll(await r.json());
  } catch (e) {
    say("erreur : " + e.message, true);
  }
  bind();
}
init();
