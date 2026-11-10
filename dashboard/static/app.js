import { createGraph } from './graph.js';
import { createTree } from './tree.js';
import { createTimeline } from './timeline.js';
import { renderTiles, renderWaves, openDrawer, closeDrawer } from './panels.js';

const COLORS = {
  chief: '#fcd34d', orchestrator: '#e879f9', developer: '#86efac', tester: '#67e8f9',
  reader: '#93c5fd', documenter: '#e2e8f0', pentester: '#fca5a5', designer: '#fdba74', legal: '#a3e635',
};
const $ = (id) => document.getElementById(id);
let state, es, queued = false, synth = 0, seen, backends = [];

/** Strip a "plugin:" prefix from an agent type. */
const short = (a) => String(a || 'chief').split(':').pop();
/** GET JSON from a relative URL. */
const getJSON = (url) => fetch(url).then((r) => r.json());

/** Select a task by id and show it in the drawer. */
const selectTask = (id) => select({ kind: 'task', task: state.tasks.get(id) }, id);
/** Select an agent by name and show it in the drawer. */
const selectAgent = (name) => select({ kind: 'agent', agent: state.agents.get(name), tasks: [...state.tasks.values()].filter((t) => t.agent === name) }, name);
const graph = createGraph($('graph'), { onSelect: selectAgent });
const tree = createTree($('tree'), { onSelectAgent: selectAgent, onSelectTask: selectTask });
let view = 'tree';
const timeline = createTimeline($('timeline'), { onSelect: selectTask });

/** Record the selection and open the drawer. */
function select(payload, key) {
  state.selected = key;
  openDrawer($('drawer'), payload);
}
/** Build a fresh empty state with the chief node. */
function freshState() {
  synth = 0;
  seen = new Set();
  const s = { agents: new Map(), links: new Map(), tasks: new Map(), selected: null,
    totals: { done: 0, total: 0, percent: 0, tokensIn: 0, tokensOut: 0, startTs: null, active: 0 },
    local: { calls: new Map(), pending: [] }, backends };
  state = s;
  ensureAgent('chief');
}
/** Get or create an agent node. */
function ensureAgent(name) {
  if (!state.agents.has(name)) {
    state.agents.set(name, { name, color: COLORS[name] || '#8b93a7', status: 'idle', task: null, taskPct: 0, briefs: 0, tokensIn: 0, tokensOut: 0 });
  }
  return state.agents.get(name);
}
/** Name of the agent that owns an event; sub-agent labels like "W1·T2 title" map to their task's agent. */
function ownerOf(e) {
  if (e.target) return short(e.target);
  const name = short(e.agent);
  if (name === 'chief' || state.agents.has(name)) return name;
  const t = [...state.tasks.values()].find((x) => !x.id.startsWith('#') && String(e.agent).startsWith(x.id));
  return t ? t.agent : 'chief';
}
/** Add event tokens to totals and to the owning agent. */
function addTokens(e) {
  if (!e.tokens) return;
  const a = ensureAgent(ownerOf(e)), i = e.tokens.in || 0, o = e.tokens.out || 0;
  state.totals.tokensIn += i; state.totals.tokensOut += o;
  a.tokensIn += i; a.tokensOut += o;
}
/** Strip a leading "[plugin:agent] " and "W<n>·T<n> " id from a title. */
function cleanTitle(line, id) {
  const t = line.replace(/^\s*\[[^\]]*\]\s*/, '').replace(/^W\d+·T\d+\s*/, '');
  return (t || id).slice(0, 80);
}
/** Unique task key: a reused "W1·T1" gets a " #n" suffix so tasks never merge. */
function uniqueId(base) {
  let id = base, n = 1;
  while (state.tasks.has(id)) id = `${base} #${++n}`;
  return id;
}
/** Task launched by the given Agent tool_use id, if any. */
const byCall = (call) => call && [...state.tasks.values()].find((t) => t.call === call);
/** Apply a brief event: create a running task and mark the agent working. */
function onBrief(e, live) {
  const name = short(e.target), a = ensureAgent(name), text = e.text || '';
  const id = uniqueId(e.task || '#' + (++synth)), link = state.links.get(name) || { count: 0, lastTs: 0 };
  link.count++; link.lastTs = Date.parse(e.ts);
  state.links.set(name, link);
  const wave = e.task ? parseInt(e.task.split('·')[0].replace(/\D/g, ''), 10) || 0 : 0;
  state.tasks.set(id, { id, call: e.call || null, num: e.task || null, wave, agent: name, title: cleanTitle(text.split('\n')[0], id), status: 'running',
    start: Date.parse(e.ts), end: null, toolCalls: 0, lastAction: null, model: e.model || null, tokens: e.tokens || null, brief: text, report: null });
  Object.assign(a, { status: 'working', task: id, taskPct: 0.5 });
  a.briefs++;
  if (live) pulse('chief', name, 'brief');
}
/** Find the running task a report answers. */
function findRunning(name, e) {
  const direct = byCall(e.call);
  if (direct) return direct;
  const mine = [...state.tasks.values()].filter((t) => t.agent === name && t.status === 'running');
  return mine.find((t) => t.num === e.task) || mine[0];
}
/** Apply a report event: close the task and update the agent. */
function onReport(e, live) {
  const name = short(e.target), a = ensureAgent(name), t = findRunning(name, e);
  if (t) Object.assign(t, { status: 'done', end: Date.parse(e.ts), report: e.text || '', status_detail: e.status || 'completed' });
  const next = [...state.tasks.values()].find((x) => x.agent === name && x.status === 'running');
  Object.assign(a, next ? { task: next.id, taskPct: 0.5 } : { status: 'idle', task: null, taskPct: t ? 1 : 0 });
  if (live) pulse(name, 'chief', 'report');
}
/** Attach a hand-back text to the latest task of the target (no state change). */
function onReportText(e) {
  const mine = [...state.tasks.values()].filter((t) => t.agent === short(e.target) && (e.call ? t.call === e.call : !e.task || t.num === e.task));
  const t = mine[mine.length - 1];
  if (t) t.report = e.text || t.report;
}
/** Short single-line target of a tool call: file basename or first 40 chars. */
function shortTarget(text) {
  const m = /"(?:file_path|path|notebook_path)"\s*:\s*"([^"]+)"/.exec(text || '');
  const raw = m ? m[1].split('/').pop() : String(text || '');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40);
}
/** Count a sub-agent tool call on the task named in its label. */
function onToolCall(e) {
  const num = (/W\d+·T\d+/.exec(String(e.agent)) || [])[0];
  const t = byCall(e.call) || (num && [...state.tasks.values()].find((x) => x.status === 'running' && x.num === num));
  if (!t) return;
  t.toolCalls++;
  t.lastAction = `${e.tool || 'tool'} · ${shortTarget(e.text)}`;
}
/** Backend name from an ask_local input text (JSON, or a clipped one); null if absent. */
function backendOf(text) {
  const m = /"backend"\s*:\s*"([^"]+)"/.exec(text || '');
  return m ? m[1] : null;
}
/** Parse a Laya answer into a decision, or null when it is not one. */
function parseDecision(text) {
  try {
    const j = JSON.parse(text), a = j.agent || {}, m = j.model || {};
    if (!a.choice && !m.choice) return null;
    return { agent: a.choice || '?', agentConf: a.confidence, model: m.choice || '?', modelConf: m.confidence };
  } catch (_) { return null; }
}
/** Record an ask_local call for its backend; wait for the matching result. */
function onLocalCall(e, live) {
  const name = backendOf(e.text) || 'unknown';
  const c = state.local.calls.get(name) || { name, count: 0, lastAnswer: null, lastDecision: null, lastTs: 0 };
  c.count++; c.lastTs = Date.parse(e.ts);
  state.local.calls.set(name, c);
  state.local.pending.push({ name, agent: e.agent });
  if (live) pulse('chief', 'adv:' + name, 'call');
}
/** Pair a tool_result with the oldest pending ask_local call of the same agent. */
function onLocalResult(e) {
  const i = state.local.pending.findIndex((p) => p.agent === e.agent);
  if (i < 0) return;
  const [p] = state.local.pending.splice(i, 1), c = state.local.calls.get(p.name);
  c.lastAnswer = e.text || '';
  if (p.name === 'laya') c.lastDecision = parseDecision(e.text) || c.lastDecision;
}
/** Pulse on the visible view. */
function pulse(from, to, kind) {
  (view === 'tree' ? tree : graph).pulse(from, to, kind);
}
/** Show one view, update its toggle and remember the choice. */
function setView(v, save) {
  view = v === 'radial' ? 'radial' : 'tree';
  $('tree').hidden = view !== 'tree';
  $('graph').hidden = view !== 'radial';
  document.querySelector('main').classList.toggle('view-tree', view === 'tree');
  document.querySelectorAll('.view-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  if (save) try { localStorage.setItem('noctia-view', view); } catch (_) { /* ignore */ }
  if (state) (view === 'tree' ? tree : graph).update(state);
  if (view === 'tree') requestAnimationFrame(() => tree.relink?.());
}
/** Recompute the task totals. */
function recount() {
  const all = [...state.tasks.values()], t = state.totals;
  t.total = all.length;
  t.done = all.filter((x) => x.status === 'done').length;
  t.percent = t.total ? Math.round((100 * t.done) / t.total) : 0;
  t.active = [...state.agents.values()].filter((a) => a.status === 'working').length;
}
/** Merge one event into state, skipping duplicates. */
function ingest(e, live) {
  const key = [e.ts, e.kind, e.agent, e.task, (e.text || '').slice(0, 80)].join('|');
  if (seen.has(key)) return;
  seen.add(key);
  if (state.totals.startTs === null) state.totals.startTs = Date.parse(e.ts);
  addTokens(e);
  if (e.kind === 'brief' && e.target) onBrief(e, live);
  if (e.kind === 'report' && e.target) onReport(e, live);
  if (e.kind === 'report_text' && e.target) onReportText(e);
  if (e.kind === 'tool_call') {
    if (/ask_local$/.test(e.tool || '')) onLocalCall(e, live); else onToolCall(e);
  }
  if (e.kind === 'tool_result') onLocalResult(e);
  recount();
}
/** Fetch plan-usage limits into state; errors are ignored. */
async function loadUsage() {
  try { state.usage = await getJSON('api/usage'); scheduleRender(); } catch (_) { /* keep last */ }
}
/** Fetch configured local AIs into state; errors keep the last list. */
async function loadLocalAi() {
  try { backends = (await getJSON('api/localai')).backends || []; state.backends = backends; scheduleRender(); } catch (_) { /* keep last */ }
}
/** Build one row of the Local AIs card. */
function localRow(b, calls) {
  const li = document.createElement('li'), dot = document.createElement('span'), nm = document.createElement('span'), md = document.createElement('span'), n = document.createElement('span');
  dot.className = 'la-dot ' + (b.status === 'up' || b.status === 'ready' ? 'ok' : 'bad');
  dot.title = b.status || '';
  nm.className = 'la-name'; nm.textContent = b.name;
  md.className = 'la-model'; md.textContent = b.model || b.type || '';
  n.className = 'la-calls'; n.textContent = `${calls.get(b.name)?.count || 0} calls`;
  li.append(dot, nm, md, n);
  return li;
}
/** Render the Local AIs card at the top of the waves column. */
function renderLocalAi() {
  let el = $('localai');
  if (!el) {
    el = Object.assign(document.createElement('section'), { id: 'localai', className: 'localai' });
    $('waves').prepend(el);
  }
  const title = Object.assign(document.createElement('h3'), { textContent: 'Local AIs' });
  const ul = document.createElement('ul');
  ul.append(...state.backends.map((b) => localRow(b, state.local.calls)));
  const none = Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No local AI configured' });
  el.replaceChildren(title, state.backends.length ? ul : none);
}
/** Schedule at most one render per frame. */
function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderTiles($('tiles'), state);
    renderWaves($('waves'), state, selectTask);
    renderLocalAi();
    (view === 'tree' ? tree : graph).update(state);
    timeline.update(state);
  });
}
/** Reset state, open the stream (buffering), fetch history, then apply the buffer. */
async function openSession(id) {
  if (es) es.close();
  freshState();
  closeDrawer($('drawer'));
  const q = encodeURIComponent(id), buffer = [];
  let ready = false;
  es = new EventSource('api/stream?session=' + q);
  es.onopen = () => setLive(true);
  es.onerror = () => setLive(false);
  es.onmessage = (m) => {
    try {
      const e = JSON.parse(m.data);
      if (!ready) buffer.push(e); else { ingest(e, true); scheduleRender(); }
    } catch (_) { /* skip bad frame */ }
  };
  (await getJSON('api/events?session=' + q)).forEach((e) => ingest(e, false));
  buffer.forEach((e) => ingest(e, false));
  ready = true;
  scheduleRender();
}
/** Show the live/offline indicator. */
function setLive(on) {
  const d = $('live');
  d.classList.toggle('on', on);
  d.classList.toggle('off', !on);
  d.textContent = on ? 'live' : 'offline';
}
/** Load session list and open the newest. */
async function loadSessions() {
  const list = await getJSON('api/sessions'), sel = $('session');
  list.sort((a, b) => b.mtime - a.mtime);
  sel.replaceChildren(...list.map((s) => Object.assign(document.createElement('option'), { value: s.id, textContent: s.title || s.id })));
  if (list.length) openSession(list[0].id);
}
$('session').onchange = (ev) => openSession(ev.target.value);
$('drawer-close').onclick = () => { if (state) state.selected = null; closeDrawer($('drawer')); };
document.querySelectorAll('.view-toggle button').forEach((b) => { b.onclick = () => setView(b.dataset.view, true); });
freshState();
try { setView(localStorage.getItem('noctia-view'), false); } catch (_) { setView('tree', false); }
loadSessions();
loadUsage();
loadLocalAi();
setInterval(loadUsage, 60000);
setInterval(loadLocalAi, 60000);
setInterval(() => { if (state) scheduleRender(); }, 30000);
