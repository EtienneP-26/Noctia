/** Done work older than this (ms after its end) leaves the live views. */
let retireMs = 10 * 1000;
/** Share of the retire delay after which a done card starts to age. */
const AGING_FRACTION = 0.8;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ORDER = ['orchestrator', 'developer', 'designer', 'tester', 'reader', 'documenter', 'pentester', 'legal'];
const KEEP_DONE = 3;
const MAX_COLS = 4;
const ms = (t) => (t == null ? null : new Date(t).getTime());

/** Format a duration in ms as mm:ss. */
function fmt(d) {
  const s = Math.max(0, Math.floor(d / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Elapsed text of a task: live for running, total for done. */
function elapsed(t) {
  return fmt((ms(t.end) ?? Date.now()) - ms(t.start));
}

/** Agent type names present in tasks, in display order. */
function typeNames(tasks) {
  const names = new Set(tasks.map((t) => t.agent));
  const known = ORDER.filter((n) => names.has(n));
  const others = [...names].filter((n) => !ORDER.includes(n) && n !== 'chief').sort();
  return known.concat(others);
}

/** Visible tasks of a type: all running plus recent done (all if expanded). */
function visibleTasks(list, open) {
  const run = list.filter((t) => t.status === 'running');
  const done = list.filter((t) => t.status !== 'running').sort((a, b) => ms(b.end) - ms(a.end));
  return { shown: run.concat(open ? done : done.slice(0, KEEP_DONE)), extra: Math.max(0, done.length - KEEP_DONE) };
}

/** Set the retire delay (ms) for finished work. */
export function setRetireMs(delay) {
  retireMs = delay;
}

/** True when a task is running or ended less than the retire delay ago. */
export function isLive(t, now = Date.now()) {
  return t.status === 'running' || now - ms(t.end) < retireMs;
}

/** Collapse and fade an exiting card, then remove it. */
function leave(sel) {
  if (reduced()) return sel.remove();
  sel.style('overflow', 'hidden').style('height', function () { return `${this.offsetHeight}px`; })
    .transition().duration(200).style('opacity', 0).style('height', '0px')
    .style('padding-top', '0px').style('padding-bottom', '0px').style('margin-top', '0px').style('margin-bottom', '0px')
    .style('border-width', '0px').remove();
}

/** Build the static inner structure of a task card. */
function buildTask(sel) {
  sel.append('div').attr('class', 'tree-task-id');
  sel.append('div').attr('class', 'tree-task-title');
  const meta = sel.append('div').attr('class', 'tree-task-meta');
  meta.append('span').attr('class', 'tree-elapsed');
  meta.append('span').attr('class', 'tree-actions');
  meta.append('span').attr('class', 'tree-check');
  sel.append('div').attr('class', 'tree-last');
  sel.append('div').attr('class', 'tree-bar').append('div').attr('class', 'tree-bar-fill');
}

/** Fill a task card from its data. */
function fillTask(sel) {
  const aging = (t) => t.status !== 'running' && Date.now() - ms(t.end) > retireMs * AGING_FRACTION;
  sel.attr('class', (t) => `tree-task ${t.status === 'running' ? 'running' : 'done'}${aging(t) ? ' aging' : ''}`)
    .attr('aria-label', (t) => `Task ${t.id}: ${t.title}, ${t.status}`);
  sel.select('.tree-task-id').text((t) => t.id);
  sel.select('.tree-task-title').text((t) => t.summary || t.title);
  sel.select('.tree-elapsed').text(elapsed);
  sel.select('.tree-actions').text((t) => `${t.toolCalls || 0} actions`);
  sel.select('.tree-check').text((t) => (t.status === 'running' ? '' : '✓'));
  sel.select('.tree-last').text((t) => (t.status === 'running' ? t.lastAction || '' : ''));
  sel.select('.tree-bar').classed('indeterminate', (t) => t.status === 'running');
  sel.select('.tree-bar-fill').style('width', (t) => (t.status === 'running' ? null : '100%'));
}

/** Fill a type card from its group data. */
function fillType(sel, state) {
  const color = (d) => state.agents.get(d.name)?.color || '#6b7a70';
  sel.attr('class', (d) => `tree-type${d.running ? ' working' : ''}`).attr('aria-label', (d) => `Agent ${d.name}, ${d.done} of ${d.total} done`);
  sel.select('.tree-avatar').style('background', color);
  sel.select('.tree-type-name').text((d) => (d.total > 1 ? `${d.name} ×${d.total}` : d.name));
  sel.select('.tree-type-count').text((d) => `${d.done}/${d.total}`);
  sel.select('.tree-bar-fill').style('width', (d) => `${d.total ? (100 * d.done) / d.total : 0}%`).style('background', color);
}

/** Fade/slide-in transition for entering cards. */
function enterAnim(sel) {
  if (reduced()) return;
  sel.style('opacity', 0).style('transform', 'translateY(8px)')
    .transition().duration(250).style('opacity', 1).style('transform', 'none');
}

/** Orthogonal elbow path from the bottom-center of a to the top-center of b. */
function elbow(a, b) {
  const my = (a.y + b.y) / 2;
  return `M${a.x},${a.y} V${my} H${b.x} V${b.y}`;
}

/** Loop a particle along a path until interrupted. */
function loop(circle, path, reverse) {
  const len = path.getTotalLength();
  circle.transition().duration(2600).ease(d3.easeLinear)
    .attrTween('transform', () => (k) => {
      const p = path.getPointAtLength((reverse ? 1 - k : k) * len);
      return `translate(${p.x},${p.y})`;
    })
    .on('end', () => loop(circle, path, reverse));
}

export function createTree(el, { onSelectAgent, onSelectTask }) {
  const root = d3.select(el);
  const svg = root.append('svg').attr('class', 'tree-links');
  const linkLayer = svg.append('g');
  const partLayer = svg.append('g');
  const chief = root.append('div').attr('class', 'tree-chief').attr('tabindex', 0);
  chief.append('div').attr('class', 'tree-chief-name').text('chief');
  chief.append('div').attr('class', 'tree-chief-model');
  chief.append('div').attr('class', 'tree-pct');
  chief.append('div').attr('class', 'tree-active');
  const advBox = root.append('div').attr('class', 'tree-advisors');
  const typesBox = root.append('div').attr('class', 'tree-types');
  const expanded = new Set();
  let state = null;
  let relinkTimer = null;

  /** Activate a card on click or Enter. */
  const activate = (sel, fn) => sel.on('click', (e, d) => fn(d)).on('keydown', (e, d) => { if (e.key === 'Enter') fn(d); });

  /** Box anchor of a card, relative to el. */
  function anchor(node, bottom) {
    const r = node.getBoundingClientRect(), e = el.getBoundingClientRect();
    return { x: r.left - e.left + el.scrollLeft + r.width / 2, y: r.top - e.top + el.scrollTop + (bottom ? r.height : 0) };
  }

  /** Collect link descriptors from the current DOM. */
  function collectLinks() {
    const links = [], c = chief.node();
    typesBox.selectAll('.tree-group:not(.leaving)').each(function (g) {
      const type = d3.select(this).select('.tree-type').node();
      links.push({ key: g.name, type: g.name, from: c, to: type, running: g.running });
      const above = new Map();
      d3.select(this).selectAll('.tree-task:not(.leaving)').each(function (t) {
        const col = this.offsetLeft;
        links.push({ key: t.id, type: g.name, from: above.get(col) || type, to: this, running: t.status === 'running' });
        above.set(col, this);
      });
    });
    advBox.selectAll('.tree-advisor:not(.leaving)').each(function (a) {
      links.push({ key: 'adv:' + a.name, type: 'adv:' + a.name, from: c, to: this, advisor: true, running: false });
    });
    return links;
  }

  /** Straight path from the chief's right edge to an advisor's left edge. */
  function side(a, b) {
    const r = a.getBoundingClientRect(), t = b.getBoundingClientRect(), e = el.getBoundingClientRect();
    const x1 = r.right - e.left + el.scrollLeft, x2 = t.left - e.left + el.scrollLeft;
    return `M${x1},${r.top - e.top + el.scrollTop + r.height / 2} L${x2},${t.top - e.top + el.scrollTop + t.height / 2}`;
  }

  /** Redraw connectors and running-particle loops. */
  function relink() {
    svg.attr('width', el.scrollWidth).attr('height', el.scrollHeight);
    const links = collectLinks();
    linkLayer.selectAll('path').data(links, (d) => d.key).join('path')
      .attr('class', (d) => `tree-link${d.running ? ' active' : ''}${d.advisor ? ' advisor-link' : ''}`).attr('data-type', (d) => d.type)
      .attr('d', (d) => (d.advisor ? side(d.from, d.to) : elbow(anchor(d.from, true), anchor(d.to, false))))
      .style('stroke', (d) => (d.running ? state.agents.get(d.type)?.color : null));
    partLayer.selectAll('*').interrupt().remove();
    if (reduced()) return;
    linkLayer.selectAll('path.active').filter((d) => d.key !== d.type).each(function (d) {
      loop(partLayer.append('circle').attr('class', 'particle').attr('r', 3).attr('fill', state.agents.get(d.type)?.color), this, false);
    });
  }

  /** Update all columns of one type group. */
  function updateGroup(group) {
    const g = d3.select(group), d = g.datum();
    const { shown, extra } = visibleTasks(d.tasks, expanded.has(d.name));
    g.style('--ag', state.agents.get(d.name)?.color || null).style('--cols', Math.min(shown.length, MAX_COLS) || 1);
    fillType(g.select('.tree-type'), state);
    const col = g.select('.tree-col');
    col.selectAll('.tree-task:not(.leaving)').data(shown, (t) => t.id).join((en) => {
      const c = en.append('div').attr('tabindex', 0).call(buildTask);
      enterAnim(c);
      return c;
    }, (u) => u, (ex) => leave(ex.classed('leaving', true))).call(fillTask).order().call(activate, (t) => onSelectTask(t.id));
    const more = col.selectAll('.tree-more').data(extra ? [d.name] : []).join('button').attr('class', 'tree-more')
      .text(expanded.has(d.name) ? '−' : `+${extra}`);
    more.on('click', () => { expanded.has(d.name) ? expanded.delete(d.name) : expanded.add(d.name); updateGroup(group); relink(); });
    more.raise();
  }

  /** Build group data per type from the state. */
  function groups(s) {
    const all = [...s.tasks.values()].filter((t) => isLive(t));
    return typeNames(all).map((name) => {
      const tasks = all.filter((t) => t.agent === name);
      const done = tasks.filter((t) => t.status === 'done').length;
      return { name, tasks, done, total: tasks.length, running: tasks.some((t) => t.status === 'running') };
    });
  }

  /** Update the chief card. */
  function fillChief(s) {
    const a = s.agents.get('chief');
    chief.style('border-color', a?.color || null).attr('aria-label', `Chief, ${s.totals.percent}% done`);
    chief.select('.tree-chief-model').text(a?.model || '');
    chief.select('.tree-pct').text(`${s.totals.percent}%`);
    chief.select('.tree-active').text(`${s.totals.active} active`);
  }

  /** Advisor descriptors: called local backends plus configured idle ones. */
  function advisors(s) {
    const cfg = new Map((s.backends || []).map((b) => [b.name, b]));
    const names = new Set([...cfg.keys(), ...s.local.calls.keys()]);
    const now = Date.now();
    return [...names].map((name) => ({ name, type: cfg.get(name)?.type || '', call: s.local.calls.get(name) || null }))
      .filter((a) => !a.call || now - a.call.lastTs < retireMs);
  }

  /** Status line of a local AI advisor card. */
  function decisionText(a) {
    return a.call ? 'last answer received' : 'idle';
  }

  /** Render the advisor cards beside the chief. */
  function updateAdvisors(s) {
    const cards = advBox.selectAll('.tree-advisor:not(.leaving)').data(advisors(s), (d) => d.name).join((en) => {
      const c = en.append('div').attr('class', 'tree-advisor');
      const h = c.append('div').attr('class', 'adv-head');
      h.append('span').attr('class', 'adv-name');
      h.append('span').attr('class', 'adv-type');
      c.append('div').attr('class', 'adv-calls');
      c.append('div').attr('class', 'adv-decision');
      return c;
    }, (u) => u, (ex) => leave(ex.classed('leaving', true)));
    cards.classed('idle', (d) => !d.call).attr('aria-label', (d) => `Local AI ${d.name}`);
    cards.select('.adv-name').text((d) => d.name);
    cards.select('.adv-type').text((d) => d.type);
    cards.select('.adv-calls').text((d) => (d.call ? `${d.call.count} calls` : ''));
    cards.select('.adv-decision').text(decisionText);
  }

  /** Render the new state. */
  function update(s) {
    state = s;
    fillChief(s);
    updateAdvisors(s);
    const gs = groups(s);
    root.selectAll('.empty').data(gs.length ? [] : [1]).join('div').attr('class', 'empty')
      .text(`All quiet — finished work retires after ${retireMs / 1000} s`);
    typesBox.selectAll('.tree-group:not(.leaving)').data(gs, (d) => d.name).join((en) => {
      const g = en.append('div').attr('class', 'tree-group');
      const t = g.append('div').attr('class', 'tree-type').attr('tabindex', 0);
      t.append('span').attr('class', 'tree-avatar');
      t.append('span').attr('class', 'tree-type-name');
      t.append('span').attr('class', 'tree-type-count');
      t.append('div').attr('class', 'tree-bar').append('div').attr('class', 'tree-bar-fill');
      g.append('div').attr('class', 'tree-col');
      enterAnim(g);
      return g;
    }, (u) => u, (ex) => leave(ex.classed('leaving', true))).order().each(function () { updateGroup(this); });
    typesBox.selectAll('.tree-type').call(activate, (d) => onSelectAgent(d.name));
    relink();
    clearTimeout(relinkTimer);
    relinkTimer = setTimeout(relink, 450);
  }

  /** Send a particle along the chief-to-type connector. */
  function pulse(from, to, kind) {
    if (reduced() || !state) return;
    const type = from === 'chief' ? to : from;
    const path = linkLayer.select(`path[data-type="${CSS.escape(type)}"]`).filter((d) => d.key === type).node();
    if (!path) return;
    const color = kind === 'brief' ? state.agents.get(type)?.color : '#ffb800';
    if (kind === 'call') advBox.selectAll('.tree-advisor').filter((d) => 'adv:' + d.name === type).classed('ping', true)
      .transition().duration(700).on('end', function () { d3.select(this).classed('ping', false); });
    const c = partLayer.append('circle').attr('class', 'particle pulse').attr('r', 4).attr('fill', color);
    const len = path.getTotalLength(), rev = from !== 'chief';
    c.transition().duration(700).ease(d3.easeCubicInOut).attrTween('transform', () => (k) => {
      const p = path.getPointAtLength((rev ? 1 - k : k) * len);
      return `translate(${p.x},${p.y})`;
    }).remove();
  }

  d3.interval(() => state && update(state), 2000);
  d3.interval(() => root.selectAll('.tree-task.running .tree-elapsed').text(elapsed), 1000);
  const ro = new ResizeObserver(() => state && relink());
  ro.observe(el);
  ro.observe(typesBox.node());
  document.fonts?.ready.then(() => state && relink());
  return { update, pulse, relink };
}
