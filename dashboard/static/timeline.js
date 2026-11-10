/* Swimlane timeline: one lane per agent, one segment per task. Requires global d3 v7. */
const LANE_H = 28;
const AXIS_H = 24;
const LABEL_W = 120;
const PAD_R = 12;

/** True when the user asks for reduced motion. */
function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Format a millisecond duration as a short string. */
function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

/** Return the end timestamp of a task (now if still running). */
function endOf(t, now) {
  return t.end == null || t.status === "running" ? now : t.end;
}

const WINDOWS = { "1h": 3600e3, "6h": 6 * 3600e3, all: Infinity };

/** Resolve the zoom mode: explicit choice, else 1h when the session exceeds 1h. */
function resolveMode(mode, tasks, now) {
  if (mode) return mode;
  return now - d3.min(tasks, (t) => t.start) > WINDOWS["1h"] ? "1h" : "all";
}

/** Build the time scale for [now - window, now]. */
function buildScale(tasks, now, width, mode) {
  const first = d3.min(tasks, (t) => t.start);
  const start = Math.min(WINDOWS[mode] === Infinity ? first : now - WINDOWS[mode], now - 1000);
  return d3.scaleTime().domain([start, now]).range([LABEL_W, Math.max(width - PAD_R, LABEL_W + 10)]);
}

/** Draw lane labels (colored dot + agent name). */
function drawLabels(svg, lanes, colorOf) {
  const g = svg.selectAll("g.lane-label").data(lanes, (d) => d).join((e) => {
    const n = e.append("g").attr("class", "lane-label");
    n.append("circle").attr("r", 5).attr("cx", 10);
    n.append("text").attr("x", 22).attr("dy", "0.32em");
    return n;
  });
  g.attr("transform", (d, i) => `translate(0,${i * LANE_H + LANE_H / 2})`);
  g.select("circle").attr("fill", colorOf);
  g.select("text").text((d) => d);
}

/** Draw the bottom time axis. */
function drawAxis(svg, x, height) {
  let ax = svg.select("g.axis");
  if (ax.empty()) ax = svg.append("g").attr("class", "axis");
  ax.attr("transform", `translate(0,${height - AXIS_H})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%H:%M")));
}

/** Draw the dashed vertical "now" line. */
function drawNow(svg, x, now, height) {
  let l = svg.select("line.now-line");
  if (l.empty()) l = svg.append("line").attr("class", "now-line").attr("stroke-dasharray", "4 3").attr("stroke", "currentColor");
  l.attr("x1", x(now)).attr("x2", x(now)).attr("y1", 0).attr("y2", height - AXIS_H);
}

/** Create segment rect + label group elements on enter. */
function enterSeg(enter, onSelect) {
  const g = enter.append("g").attr("class", "seg-group");
  g.append("rect").attr("class", "seg").attr("rx", 6).attr("opacity", 0.85).attr("tabindex", 0).attr("role", "button")
    .on("click", (ev, d) => onSelect(d.id))
    .on("keydown", (ev, d) => { if (ev.key === "Enter") onSelect(d.id); });
  g.select("rect").append("title");
  g.append("text").attr("class", "seg-label").attr("dy", "0.32em").attr("pointer-events", "none");
  return g;
}

/** Draw task segments, with transitions unless motion is reduced. */
function drawSegs(svg, tasks, lanes, x, now, colorOf, onSelect) {
  const g = svg.selectAll("g.seg-group").data(tasks, (d) => d.id).join((e) => enterSeg(e, onSelect));
  const w = (d) => Math.max(4, x(endOf(d, now)) - Math.max(LABEL_W, x(d.start)));
  const rect = g.select("rect").classed("running", (d) => d.status === "running").style("fill", (d) => (d.status === "running" ? null : colorOf(d.agent)))
    .attr("y", (d) => lanes.indexOf(d.agent) * LANE_H + 4).attr("height", LANE_H - 8);
  (reducedMotion() ? rect : rect.transition().duration(300)).attr("x", (d) => Math.max(LABEL_W, x(d.start))).attr("width", w);
  rect.select("title").text((d) => `${d.id}: ${d.title} (${fmtDuration(endOf(d, now) - d.start)})`);
  g.select("text").attr("x", (d) => Math.max(LABEL_W, x(d.start)) + 6).attr("y", (d) => lanes.indexOf(d.agent) * LANE_H + LANE_H / 2)
    .text((d) => (w(d) > d.id.length * 7 + 12 ? d.id : ""));
}

/** Define the diagonal stripe pattern used by running segments. */
function addStripes(svg) {
  const p = svg.append("defs").append("pattern").attr("id", "stripes").attr("width", 8).attr("height", 8)
    .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
  p.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#8b7cff");
  p.append("rect").attr("width", 4).attr("height", 8).attr("fill", "#b8aeff");
}

/** Build the 1h / 6h / All segmented control; calls pick(mode) on click. */
function buildZoom(root, pick) {
  const head = root.append("div").attr("class", "tl-header");
  const zoom = head.append("div").attr("class", "tl-zoom").attr("role", "group").attr("aria-label", "Timeline zoom");
  Object.keys(WINDOWS).forEach((m) => zoom.append("button").attr("type", "button").attr("data-mode", m)
    .text(m === "all" ? "All" : m).on("click", () => pick(m)));
  return zoom;
}

/** Create the timeline inside el; returns { update(state) }. */
export function createTimeline(el, { onSelect }) {
  const root = d3.select(el);
  let mode = null;
  const zoom = buildZoom(root, (m) => { mode = m; render(); });
  const svg = root.append("svg").attr("width", "100%");
  addStripes(svg);
  const empty = root.append("div").attr("class", "empty").text("No tasks yet");
  let state = null;
  let timer = null;
  /** Toggle zoom, empty message and svg by whether tasks exist. */
  function toggle(has) {
    zoom.style("display", has ? null : "none");
    empty.style("display", has ? "none" : null);
    svg.style("display", has ? null : "none");
  }
  /** Draw every layer for the visible tasks. */
  function draw(tasks, x, now) {
    const lanes = [...new Set(tasks.map((t) => t.agent))];
    const colorOf = (n) => (state.agents.get(n) || {}).color || "#888";
    const width = el.clientWidth || 600, height = lanes.length * LANE_H + AXIS_H;
    svg.attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    drawLabels(svg, lanes, colorOf);
    drawAxis(svg, x, height);
    drawSegs(svg, tasks, lanes, x, now, colorOf, onSelect);
    drawNow(svg, x, now, height);
  }
  /** Render the current state at the current time. */
  function render() {
    const all = state ? [...state.tasks.values()] : [];
    toggle(all.length > 0);
    if (!all.length) return;
    const now = Date.now(), m = resolveMode(mode, all, now);
    zoom.selectAll("button").classed("active", function () { return this.dataset.mode === m; });
    const x = buildScale(all, now, el.clientWidth || 600, m);
    const lo = x.domain()[0].getTime();
    draw(all.filter((t) => endOf(t, now) >= lo), x, now);
  }
  new ResizeObserver(() => requestAnimationFrame(render)).observe(el);
  return {
    /** Store new state, re-render, and tick every second while tasks run. */
    update(s) {
      state = s;
      render();
      const running = [...s.tasks.values()].some((t) => t.status === "running");
      if (timer) { timer.stop(); timer = null; }
      if (running) timer = d3.interval(render, 1000);
    },
  };
}
