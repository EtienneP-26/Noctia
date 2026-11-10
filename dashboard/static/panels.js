// Panels: KPI tiles, wave/task list, detail drawer. Uses the global d3 (v7).
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;
let lastFocus = null;

/** True when the user prefers reduced motion. */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Format a token count as 12.3k / 1.2M. */
export function fmtTokens(n) {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  return n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
}

/** Format milliseconds as "5 h 39" from one hour, else mm:ss. */
export function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const p = (x) => String(x).padStart(2, '0');
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${p(Math.floor((s % 3600) / 60))}`;
  return `${p(Math.floor(s / 60))}:${p(s % 60)}`;
}

/** Tween a text node from its previous number to value, formatted by fmt. */
function tweenText(sel, value, fmt) {
  const node = sel.node();
  const from = +node.__v || 0;
  node.__v = value;
  if (reduced()) return sel.text(fmt(value));
  sel.transition().duration(400)
    .textTween(() => (t) => fmt(d3.interpolateNumber(from, value)(t)));
}

/** Format a duration in seconds as "2 h 14" or "14 min". */
function fmtIn(s) {
  const m = Math.max(0, Math.floor(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
}

/** Format an epoch-seconds reset as "Thu 14:05". */
const fmtReset = (ts) => new Date(ts * 1000).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Build one usage-limit tile definition (win may be null). */
function usageDef(key, label, win, week, updated) {
  const now = Date.now() / 1000, pct = win ? Math.min(100, Math.max(0, win.used_percentage)) : 0;
  const age = updated ? Math.max(0, Math.floor((now - updated) / 60)) : null;
  return { key, label, num: pct, ring: true, empty: !win,
    level: pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : '',
    fmt: win ? (v) => Math.round(v) + '%' : () => '\u2014',
    sub: win ? 'resets ' + (week ? fmtReset(win.resets_at) : 'in ' + fmtIn(win.resets_at - now)) : 'no data yet',
    sub2: age === null ? '' : `updated ${age < 1 ? 'just now' : age + ' min ago'}`, stale: age !== null && age > 30 };
}

/** Build the seven tile definitions from state. */
function tileDefs(state) {
  const u = state.usage || {};
  const t = state.totals;
  const elapsed = t.startTs ? Date.now() - t.startTs : 0;
  return [
    usageDef('usage5h', '5h limit', u.five_hour, false, u.updated_at),
    usageDef('usage7d', 'Week', u.seven_day, true, u.updated_at),
    { key: 'progress', label: 'Progress', num: t.percent, fmt: (v) => Math.round(v) + '%', ring: true },
    { key: 'tasks', label: 'Tasks', num: t.done, fmt: (v) => `${Math.round(v)} / ${t.total}` },
    { key: 'active', label: 'Active agents', num: t.active, fmt: (v) => String(Math.round(v)) },
    { key: 'tokens', label: 'Tokens', num: t.tokensIn + t.tokensOut, fmt: fmtTokens,
      sub: `${fmtTokens(t.tokensIn)} in / ${fmtTokens(t.tokensOut)} out` },
    { key: 'elapsed', label: 'Elapsed', num: elapsed, fmt: fmtElapsed },
  ];
}

/** Create the static skeleton of one tile. */
function buildTile(sel) {
  sel.append('div').attr('class', 'tile-label');
  const ring = sel.filter((d) => d.ring).append('svg').attr('class', 'ring').attr('viewBox', '0 0 100 100');
  ring.append('circle').attr('class', 'ring-bg').attr('cx', 50).attr('cy', 50).attr('r', RING_R);
  ring.append('circle').attr('class', 'ring-fg').attr('cx', 50).attr('cy', 50).attr('r', RING_R)
    .attr('stroke-dasharray', RING_C).attr('stroke-dashoffset', RING_C)
    .attr('transform', 'rotate(-90 50 50)');
  sel.append('div').attr('class', 'tile-value');
  sel.append('div').attr('class', 'tile-sub');
  const s2 = sel.filter((d) => d.key.startsWith('usage')).append('div').attr('class', 'tile-sub2');
  s2.append('span').attr('class', 'tile-upd');
  s2.append('span').attr('class', 'stale-badge').text('stale');
}

/** Render the KPI tiles in place (keyed by tile key). */
export function renderTiles(el, state) {
  const root = d3.select(el);
  const tiles = root.selectAll('.tile').data(tileDefs(state), (d) => d.key)
    .join((enter) => { const e = enter.append('div').attr('class', (d) => 'tile tile-' + d.key); buildTile(e); return e; });
  tiles.select('.tile-label').text((d) => d.label);
  tiles.select('.tile-sub').text((d) => d.sub || '');
  tiles.classed('is-empty', (d) => !!d.empty).classed('lvl-warn', (d) => d.level === 'warn').classed('lvl-danger', (d) => d.level === 'danger');
  tiles.select('.tile-upd').text((d) => d.sub2 || '');
  tiles.select('.stale-badge').attr('hidden', (d) => (d.stale ? null : ''));
  tiles.each(function (d) {
    const s = d3.select(this);
    tweenText(s.select('.tile-value'), d.num, d.fmt);
    if (d.ring) s.select('.ring-fg').transition().duration(reduced() ? 0 : 400)
      .attr('stroke-dashoffset', RING_C * (1 - d.num / 100));
  });
}

/** Group tasks by wave, newest wave first, with per-wave percentage. */
function groupWaves(state) {
  const by = d3.group([...state.tasks.values()], (t) => t.wave);
  return [...by].map(([wave, tasks]) => {
    const done = tasks.filter((t) => t.status === 'done').length;
    return { wave, tasks, pct: Math.round((100 * done) / tasks.length) };
  }).sort((a, b) => d3.descending(+a.wave || 0, +b.wave || 0));
}

/** Fill one task row's children. */
function fillTask(row, state, onSelect) {
  row.attr('class', (t) => 'task ' + t.status).attr('tabindex', 0).attr('role', 'button')
    .on('click', (e, t) => onSelect(t.id))
    .on('keydown', (e, t) => { if (e.key === 'Enter') onSelect(t.id); });
  row.select('.task-id').text((t) => t.id);
  row.select('.task-title').text((t) => t.title);
  row.select('.task-agent').text((t) => t.agent).select('.dot')
    .style('background', (t) => state.agents.get(t.agent)?.color || 'currentColor');
}

/** Create the children of a new task row. */
function buildTask(enter) {
  const row = enter.append('li');
  row.append('span').attr('class', 'task-id');
  row.append('span').attr('class', 'task-title');
  row.append('span').attr('class', 'task-agent').append('span').attr('class', 'dot');
  return row;
}

/** Create a new wave block skeleton. */
function buildWave(enter) {
  const w = enter.append('section').attr('class', 'wave');
  const head = w.append('div').attr('class', 'wave-head');
  head.append('span').attr('class', 'wave-title');
  head.append('span').attr('class', 'wave-pct');
  w.append('div').attr('class', 'bar').append('div').attr('class', 'bar-fill');
  w.append('ul').attr('class', 'tasks');
  return w;
}

/** Render waves and their tasks (keyed joins). */
export function renderWaves(el, state, onSelect) {
  const root = d3.select(el);
  const data = groupWaves(state);
  root.selectAll('.empty').data(data.length ? [] : [0]).join('div').attr('class', 'empty').text('No tasks yet');
  const waves = root.selectAll('.wave').data(data, (d) => d.wave).join(buildWave).order();
  waves.select('.wave-title').text((d) => 'Wave ' + d.wave);
  waves.select('.wave-pct').text((d) => d.pct + '%');
  waves.select('.bar-fill').transition().duration(reduced() ? 0 : 400).style('width', (d) => d.pct + '%');
  waves.each(function (w) {
    const rows = d3.select(this).select('.tasks').selectAll('li').data(w.tasks, (t) => t.id).join(buildTask).order();
    fillTask(rows, state, onSelect);
    rows.classed('shimmer', (t) => t.status === 'running');
  });
}

/** Duration text for a task. */
function durationOf(t) {
  if (!t.start) return '-';
  return fmtElapsed((t.end || Date.now()) - t.start);
}

/** Key/value rows for a task. */
function taskKv(t) {
  const tok = t.tokens ? `${fmtTokens(t.tokens.in)} in / ${fmtTokens(t.tokens.out)} out` : '-';
  return [['Agent', t.agent], ['Model', t.model || '-'], ['Status', t.status], ['Duration', durationOf(t)], ['Tokens', tok]];
}

/** Key/value rows for an agent. */
function agentKv(a, tasks) {
  return [['Agent', a.name], ['Status', a.status || '-'], ['Task', a.task || '-'], ['Tasks', String(tasks.length)],
    ['Tokens', `${fmtTokens(a.tokensIn)} in / ${fmtTokens(a.tokensOut)} out`]];
}

/** Append a titled text section to the drawer body. */
function addSection(body, title, text, pre) {
  const s = body.append('div').attr('class', 'drawer-section');
  s.append('div').attr('class', 'drawer-title').text(title);
  if (pre) s.append('pre').attr('class', 'drawer-text').text(text || '-');
  return s;
}

/** Append a kv grid section. */
function addKv(body, rows) {
  const s = addSection(body, 'Details', '', false).append('div').attr('class', 'kv');
  rows.forEach(([k, v]) => { s.append('span').attr('class', 'kv-key').text(k); s.append('span').attr('class', 'kv-val').text(v); });
}

/** Fill the drawer body for an item. */
function fillDrawer(body, item) {
  body.selectAll('*').remove();
  if (item.kind === 'task') {
    const t = item.task;
    addSection(body, `${t.id} - ${t.title}`, '', false);
    addKv(body, taskKv(t));
    addSection(body, 'Brief', t.brief, true);
    addSection(body, 'Report', t.report, true);
  } else {
    addSection(body, item.agent.name, '', false);
    addKv(body, agentKv(item.agent, item.tasks));
    addSection(body, 'Tasks', item.tasks.map((t) => `${t.id} ${t.title} (${t.status})`).join('\n'), true);
  }
}

/** Open the drawer with item and move focus inside. */
export function openDrawer(drawer, item) {
  lastFocus = document.activeElement;
  fillDrawer(d3.select(drawer).select('#drawer-body'), item);
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  if (!drawer.hasAttribute('tabindex')) drawer.setAttribute('tabindex', '-1');
  const btn = drawer.querySelector('#drawer-close');
  (btn || drawer).focus();
  drawer.__bound = drawer.__bound || bindClose(drawer);
}

/** Close the drawer and restore focus. */
export function closeDrawer(drawer) {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  lastFocus = null;
}

/** Bind Escape and the close button once. */
function bindClose(drawer) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(drawer);
  });
  drawer.querySelector('#drawer-close')?.addEventListener('click', () => closeDrawer(drawer));
  return true;
}
