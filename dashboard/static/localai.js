"use strict";
(function () {
  const NAME_RE = /^[a-z0-9_-]{1,32}$/;
  const ENV_RE = /^NOCTIA_LOCALAI_[A-Z0-9_]{1,48}$/;
  const root = document.getElementById("localai");
  if (!root) return;
  const box = el("div");
  const formBox = el("div");
  const callers = el("div");
  root.append(el("h2", "", "IA locales"), box, formBox, el("h2", "", "Qui peut les appeler"), callers);

  /** Create an element with a class and optional text. */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /** POST JSON; resolve with the parsed body or throw the server message. */
  async function post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
    return data;
  }

  /** GET JSON from a path or throw. */
  async function getJson(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  /** Build a button of type button. */
  function button(label, onClick) {
    const b = el("button", "", label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  /** One-line summary of a backend. */
  function summary(b) {
    if (b.type === "openai") return (b.base_url || "") + " · " + (b.model || "");
    return "commande locale";
  }

  /** Run the test for a backend and show the result in a span. */
  async function runTest(name, out) {
    out.className = "ag-state";
    out.textContent = "test…";
    try {
      const r = await post("/api/localai/" + encodeURIComponent(name) + "/test");
      out.className = "ag-state " + (r.ok ? "ok" : "err");
      out.textContent = r.ok ? "✓ " + r.ms + " ms" : "✗ " + (r.error || "échec");
    } catch (e) {
      out.className = "ag-state err";
      out.textContent = "✗ " + e.message;
    }
  }

  /** Delete a backend after confirmation, then refresh. */
  async function remove(name, out) {
    if (!confirm("Supprimer l'IA locale « " + name + " » ?")) return;
    try {
      await post("/api/localai/" + encodeURIComponent(name) + "/delete");
      refresh();
    } catch (e) {
      out.className = "ag-state err";
      out.textContent = "✗ " + e.message;
    }
  }

  /** Build the list row of one backend. */
  function row(b) {
    const li = el("li");
    li.style.cssText = "display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.3rem 0";
    const out = el("span", "ag-state");
    li.append(el("strong", "", b.name), el("span", "", b.type), el("span", "", summary(b)),
      el("span", "", b.status || ""));
    if (b.type === "openai") {
      li.append(button("Tester", () => runTest(b.name, out)), button("Modifier", () => editBackend(b, out)));
    } else {
      li.append(el("span", "ag-state", "modifiable dans localai.json"));
    }
    li.append(button("Supprimer", () => remove(b.name, out)), out);
    return li;
  }

  /** Render the backend list. */
  function renderList(data) {
    box.textContent = "";
    if (data.error) box.appendChild(el("p", "ag-state err", "Configuration invalide : " + data.error));
    if (!data.backends.length) box.appendChild(el("p", "ag-state", "Aucune IA locale configurée."));
    const ul = el("ul");
    ul.style.cssText = "list-style:none;padding:0;margin:0";
    data.backends.forEach((b) => ul.appendChild(row(b)));
    box.append(ul, button("Ajouter", () => showForm(null)));
  }

  /** Build a labelled input; returns {label, input}. */
  function field(text, value, placeholder, multiline) {
    const label = el("label", "", text + " ");
    label.style.display = "block";
    const input = el(multiline ? "textarea" : "input");
    if (!multiline) input.type = "text";
    input.value = value == null ? "" : value;
    if (placeholder) input.placeholder = placeholder;
    label.appendChild(input);
    return { label, input };
  }

  /** Turn a free name ("Qwen 2.5 Coder") into a valid id ("qwen-2-5-coder"). */
  function slug(raw) {
    return raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  }

  /** Return an error message for an invalid spec, or "". */
  function validate(name, spec, editing) {
    if (!editing && !NAME_RE.test(name)) return "Nom requis (lettres ou chiffres).";
    if (!Number.isInteger(spec.timeout) || spec.timeout < 1 || spec.timeout > 600) {
      return "Délai : entier entre 1 et 600.";
    }
    if (spec.type === "command") return spec.argv.length ? "" : "Au moins un argument requis.";
    if (!/^https?:\/\/[^\s/@]+/i.test(spec.base_url)) return "URL http(s) valide requise, sans identifiants.";
    if (!spec.model) return "Modèle requis.";
    if (spec.api_key_env && !ENV_RE.test(spec.api_key_env)) return "Variable : NOCTIA_LOCALAI_ suivi de A-Z, 0-9, _.";
    return "";
  }

  /** Read the form fields into a spec. */
  function readSpec(type, f) {
    const timeout = Number(f.timeout.input.value.trim());
    if (type === "command") {
      const argv = f.argv.input.value.split("\n").map((s) => s.trim()).filter(Boolean);
      return { type, argv, timeout };
    }
    const spec = { type, base_url: f.base_url.input.value.trim(), model: f.model.input.value.trim(), timeout };
    const env = f.api_key_env.input.value.trim();
    if (env) spec.api_key_env = env;
    return spec;
  }

  /** Submit the form: validate, save, refresh. */
  async function submit(sel, f, nameIn, editing, msg) {
    const name = editing ? nameIn.value.trim() : slug(nameIn.value);
    if (!editing) nameIn.value = name;
    const spec = readSpec(sel.value, f);
    const bad = validate(name, spec, editing);
    msg.className = "ag-state err";
    if (bad) { msg.textContent = bad; return; }
    try {
      await post("/api/localai/" + encodeURIComponent(name), spec);
      formBox.textContent = "";
      refresh();
    } catch (e) {
      msg.textContent = e.message;
    }
  }

  /** Show only the fields that match the selected type. */
  function syncType(sel, f) {
    const cmd = sel.value === "command";
    ["base_url", "model", "api_key_env"].forEach((k) => { f[k].label.hidden = cmd; });
    f.argv.label.hidden = !cmd;
  }

  /** Load the full spec of a backend, then show the edit form. */
  async function editBackend(b, out) {
    try {
      showForm(await getJson("/api/localai/" + encodeURIComponent(b.name)));
    } catch (e) {
      out.textContent = e.message;
    }
  }

  /** Show the add (b null) or edit form. */
  function showForm(b) {
    formBox.textContent = "";
    const editing = !!b;
    const nameF = field("Nom", b && b.name);
    nameF.input.disabled = editing;
    const sel = el("select");
    [["openai", "openai (vLLM, Ollama, compatible)"]].forEach(([v, t]) => {
      const o = el("option", "", t);
      o.value = v;
      sel.appendChild(o);
    });
    sel.value = "openai";
    const f = {
      base_url: field("URL de base", b && b.base_url, "http://localhost:11434/v1"),
      model: field("Modèle", b && b.model),
      api_key_env: field("Variable de la clé", b && b.api_key_env, "NOCTIA_LOCALAI_…"),
      argv: field("Arguments (un par ligne)", b && b.argv ? b.argv.join("\n") : "", "/chemin/script\n--option", true),
      timeout: field("Délai (s)", b ? b.timeout : 60),
    };
    sel.addEventListener("change", () => syncType(sel, f));
    syncType(sel, f);
    const msg = el("p", "ag-state");
    const typeL = el("label", "", "Type ");
    typeL.appendChild(sel);
    formBox.append(el("h3", "", editing ? "Modifier " + b.name : "Ajouter une IA locale"), nameF.label, typeL,
      f.base_url.label, f.model.label, f.api_key_env.label, f.argv.label, f.timeout.label,
      button("Enregistrer", () => submit(sel, f, nameF.input, editing, msg)),
      button("Annuler", () => { formBox.textContent = ""; }), msg);
  }

  /** Build the access switch row of one agent. */
  function agentRow(a) {
    const li = el("li");
    li.style.cssText = "display:flex;gap:.6rem;align-items:center;padding:.2rem 0";
    const l = el("label", "ag-switch");
    const input = el("input");
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.setAttribute("aria-label", "IA locales pour " + a.name);
    l.append(input, el("span", "ag-track"));
    const state = el("span", "ag-state");
    li.append(l, el("span", "", a.name), state);
    if (a.localai === null || a.localai === undefined) {
      input.checked = true;
      input.disabled = true;
      l.title = "hérite de tous les outils";
      state.textContent = "toujours";
      return li;
    }
    input.checked = a.localai === true;
    input.addEventListener("change", () => toggleAgent(a.name, input, state));
    return li;
  }

  /** Save the localai flag of an agent; revert the switch on error. */
  async function toggleAgent(name, input, state) {
    const want = input.checked;
    state.className = "ag-state";
    state.textContent = "…";
    try {
      await post("/api/agents/" + encodeURIComponent(name) + "/localai", { enabled: want });
      state.className = "ag-state ok";
      state.textContent = "✓";
    } catch (e) {
      input.checked = !want;
      state.className = "ag-state err";
      state.textContent = e.message;
    }
  }

  /** Load backends and agents, then render. */
  async function refresh() {
    try {
      renderList(await getJson("/api/localai"));
    } catch (e) {
      box.textContent = "Chargement impossible : " + e.message;
    }
    try {
      const ul = el("ul");
      ul.style.cssText = "list-style:none;padding:0;margin:0";
      (await getJson("/api/agents")).forEach((a) => ul.appendChild(agentRow(a)));
      callers.textContent = "";
      callers.appendChild(ul);
    } catch (e) {
      callers.textContent = "Chargement impossible : " + e.message;
    }
  }

  refresh();
})();
