// Live D3 agent graph. `d3` v7 is a global.
import { RETIRE_MS } from './tree.js';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const widthScale = d3.scaleSqrt().domain([1, 50]).range([1, 6]).clamp(true);

/** True when an agent has tasks, none running, and all ended over RETIRE_MS ago. */
function isRetired(a, tasks) {
  if (a.name === 'chief') return false;
  const mine = [...tasks.values()].filter((t) => t.agent === a.name);
  if (!mine.length || mine.some((t) => t.status === 'running')) return false;
  return Date.now() - Math.max(...mine.map((t) => t.end || 0)) > RETIRE_MS;
}

/** Build the SVG defs (blur filter) once. */
function initDefs(svg) {
  const defs = svg.append('defs');
  defs.append('filter').attr('id', 'halo-blur').attr('x', '-100%').attr('y', '-100%')
    .attr('width', '300%').attr('height', '300%')
    .append('feGaussianBlur').attr('stdDeviation', 8);
  return defs;
}

/** Create or refresh the radial gradient of one agent. */
function ensureGradient(defs, a) {
  const id = `grad-${CSS.escape(a.name)}`;
  let g = defs.select(`[id="${id}"]`);
  if (g.empty()) {
    g = defs.append('radialGradient').attr('id', id);
    g.append('stop').attr('class', 's0').attr('offset', '0%').attr('stop-color', '#fff').attr('stop-opacity', 0.9);
    g.append('stop').attr('class', 's1').attr('offset', '100%');
  }
  g.select('.s1').attr('stop-color', a.color);
  return `url(#${id})`;
}

/** Node radius, set by the layout. */
const radiusOf = (d) => d.r;
/** Clamp v between lo and hi. */
const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));
/** Arc generator for a node's progress ring. */
const ringArc = (r) => d3.arc().innerRadius(r + 6).outerRadius(r + 9).startAngle(0);

/** Quadratic curved path between two points. */
function linkPath(s, t) {
  const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
  const cx = mx - (t.y - s.y) * 0.12, cy = my + (t.x - s.x) * 0.12;
  return `M${s.x},${s.y}Q${cx},${cy} ${t.x},${t.y}`;
}

/** Node sizes and ring radius from the svg size and agent count. */
function metrics(w, h, n) {
  const m = Math.min(w, h);
  let r = clamp(14, m * 0.065, 30);
  const chiefR = clamp(18, m * 0.085, 38), ring = Math.max(m / 2 - (r + 22) - 8, 0);
  if (n > 1) r = Math.min(r, (2 * Math.PI * ring) / n / 2.4);
  return { r, chiefR, ring, font: clamp(11, m * 0.03, 13) };
}

/** Fixed layout: chief at the center, agents evenly on a ring. */
function placeNodes(data, w, h) {
  const others = data.filter((d) => d.name !== 'chief');
  const k = metrics(w, h, others.length);
  data.forEach((d) => { if (d.name === 'chief') Object.assign(d, { x: w / 2, y: h / 2, r: k.chiefR, font: k.font }); });
  others.forEach((d, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / others.length;
    Object.assign(d, { r: k.r, font: k.font, x: w / 2 + k.ring * Math.cos(ang), y: h / 2 + k.ring * Math.sin(ang) });
  });
}

/** Enter selection: build the DOM of new nodes. */
function buildNode(sel, onSelect) {
  const g = sel.append('g').attr('class', 'node').attr('tabindex', 0).attr('role', 'button')
    .attr('opacity', 0).on('click', (e, d) => onSelect(d.name))
    .on('keydown', (e, d) => { if (e.key === 'Enter') onSelect(d.name); });
  g.attr('transform', (d) => `translate(${d.x},${d.y})`);
  g.append('circle').attr('class', 'node-halo').attr('r', (d) => radiusOf(d) + 4).attr('filter', 'url(#halo-blur)');
  g.append('circle').attr('class', 'node-core').attr('r', radiusOf);
  g.append('path').attr('class', 'node-ring-bg').attr('d', (d) => ringArc(radiusOf(d)).endAngle(Math.PI * 2)());
  g.append('path').attr('class', 'node-ring');
  g.append('text').attr('class', 'node-label').attr('y', (d) => radiusOf(d) + 24).attr('text-anchor', 'middle');
  g.append('text').attr('class', 'node-task').attr('y', (d) => radiusOf(d) + 38).attr('text-anchor', 'middle');
  g.transition().duration(reduced() ? 0 : 500).attr('opacity', 1);
  return g;
}

/** Animate a node's progress ring to its task percentage. */
function paintRing(el, d) {
  const from = el.__pct || 0, to = d.taskPct || 0, arc = ringArc(radiusOf(d));
  el.__pct = to;
  d3.select(el).style('fill', d.color).transition().duration(reduced() ? 0 : 400)
    .attrTween('d', () => (t) => arc.endAngle(Math.PI * 2 * d3.interpolateNumber(from, to)(t))());
}

/** Resize circles, rings and labels to the current layout. */
function paintGeometry(nodes) {
  nodes.select('.node-halo').attr('r', (d) => d.r + 4);
  nodes.select('.node-core').attr('r', (d) => d.r);
  nodes.select('.node-ring-bg').attr('d', (d) => ringArc(d.r).endAngle(Math.PI * 2)());
  nodes.select('.node-label').attr('y', (d) => d.r + 22).style('font-size', (d) => `${d.font}px`);
  nodes.select('.node-task').attr('y', (d) => d.r + 34).style('font-size', (d) => `${d.font - 2}px`);
}

/** Apply agent data to the merged node selection. */
function paintNodes(nodes, defs, selected) {
  nodes.style('color', (d) => d.color).attr('class', (d) => `node${d.status === 'working' ? ' working' : ''}${d.name === selected ? ' selected' : ''}`)
    .attr('aria-label', (d) => `${d.name}: ${d.status}`);
  nodes.transition('move').duration(reduced() ? 0 : 400).attr('transform', (d) => `translate(${d.x},${d.y})`);
  nodes.select('.node-core').style('fill', (d) => ensureGradient(defs, d));
  paintGeometry(nodes);
  nodes.select('.node-label').text((d) => d.name);
  nodes.select('.node-task').text((d) => d.task || '');
  nodes.select('.node-ring').each(function (d) { paintRing(this, d); });
}

/** Per-agent link gradient from the chief color to the agent color. */
function linkGradient(defs, chief, d) {
  const id = `lg-${CSS.escape(d.name)}`;
  let g = defs.select(`[id="${id}"]`);
  if (g.empty()) {
    g = defs.append('linearGradient').attr('id', id).attr('gradientUnits', 'userSpaceOnUse');
    g.append('stop').attr('class', 's0').attr('offset', '0%');
    g.append('stop').attr('class', 's1').attr('offset', '100%');
  }
  g.attr('x1', chief.x).attr('y1', chief.y).attr('x2', d.x).attr('y2', d.y);
  g.select('.s0').attr('stop-color', chief.color);
  g.select('.s1').attr('stop-color', d.color);
  return `url(#${id})`;
}

/** Animate three staggered particles along a path. */
function runParticles(layer, path, color, reverse) {
  const len = path.getTotalLength();
  for (let i = 0; i < 3; i++) {
    layer.append('circle').attr('class', 'particle').attr('r', 3.5).attr('fill', color).attr('opacity', 0)
      .transition().delay(i * 130).duration(900).ease(d3.easeCubicInOut)
      .attr('opacity', 1)
      .attrTween('transform', () => (t) => {
        const p = path.getPointAtLength((reverse ? 1 - t : t) * len);
        return `translate(${p.x},${p.y})`;
      }).remove();
  }
}

/** Create the graph inside the given svg element. */
export function createGraph(svg, { onSelect }) {
  const root = d3.select(svg);
  const defs = initDefs(root);
  const layers = ['links', 'particles', 'nodes'].map((c) => root.append('g').attr('class', c));
  const [linkLayer, partLayer, nodeLayer] = layers;
  const empty = root.append('text').attr('class', 'graph-empty').attr('text-anchor', 'middle').attr('fill', '#9ba3c2').attr('font-size', 14).text('Waiting for agents…');
  let size = { w: 600, h: 400 }, last = null;

  /** Measure the svg and keep the viewBox 1:1 with pixels. */
  function measure() {
    const r = svg.getBoundingClientRect();
    size = { w: r.width || 600, h: r.height || 400 };
    root.attr('viewBox', `0 0 ${size.w} ${size.h}`);
    empty.attr('x', size.w / 2).attr('y', size.h / 2 + 90);
  }

  d3.interval(() => { if (last) update(last); }, 15000);
  new ResizeObserver(() => { if (last) update(last); }).observe(svg);

  /** Render a new state snapshot. */
  function update(state) {
    last = state;
    measure();
    const data = [...state.agents.values()].filter((a) => !isRetired(a, state.tasks));
    placeNodes(data, size.w, size.h);
    const others = data.filter((d) => d.name !== 'chief');
    empty.attr('display', others.length ? 'none' : null);
    const sel = nodeLayer.selectAll('.node').data(data, (d) => d.name);
    sel.exit().transition().duration(300).attr('opacity', 0).remove();
    paintNodes(buildNode(sel.enter(), onSelect).merge(sel), defs, state.selected);
    drawLinks(others, state, data.find((d) => d.name === 'chief'));
  }

  /** Join the chief→agent link paths. */
  function drawLinks(others, state, chief) {
    const l = linkLayer.selectAll('.link').data(others, (d) => d.name);
    l.exit().remove();
    l.enter().append('path').attr('class', 'link').attr('fill', 'none').merge(l)
      .classed('active', (d) => d.status === 'working')
      .style('--link-glow', (d) => d.color)
      .attr('stroke', (d) => linkGradient(defs, chief, d))
      .attr('d', (d) => linkPath(chief, d))
      .attr('stroke-width', (d) => widthScale((state.links.get(d.name) || { count: 1 }).count) + 0.5);
  }

  /** Fire particles along the link between chief and an agent. */
  function pulse(from, to, kind) {
    if (reduced() || !last) return;
    const name = kind === 'brief' ? to : from;
    const node = linkLayer.selectAll('.link').filter((d) => d.name === name).node();
    const a = last.agents.get(name);
    if (!node || !a) return;
    runParticles(partLayer, node, kind === 'brief' ? a.color : '#ffffff', kind !== 'brief');
  }

  return { update, pulse };
}
