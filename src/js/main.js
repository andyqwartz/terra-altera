/* Decolonial Atlas — globe→projection morphing, rebuilt on proven code.
   Core interpolation adapted verbatim from @d3/projection-transitions
   (https://observablehq.com/@d3/projection-transitions, ISC).
   Globe unrolling adds clipAngle choreography 90°→180° (backface fix).
   South-up uses rotation roll γ=180 (rigid, no mirroring).
   Projections: d3-geo + d3-geo-projection + d3-geo-polygon.
   Data: world-atlas@2 (Natural Earth, public domain). */

"use strict";

const WIDTH = 1200;
const HEIGHT = 700;
const PAD = 30;
const DEG = Math.PI / 180;

const state = {
  alpha: 0,             // 0 = globe (orthographic), 1 = flat map
  rotation: [0, -10],   // [lambda, phi]
  roll: 0,              // gamma: 180 = south up
  graticule: true,
  animating: false,
  blending: false,      // crossfade between flat projections
};

// Raw projection factories (verified signatures against bundled libs).
const RAW = {
  equalEarth:      () => d3.geoEqualEarthRaw,
  hoboDyer:        () => d3.geoCylindricalEqualAreaRaw(37.5 * DEG),
  gallPeters:      () => d3.geoCylindricalEqualAreaRaw(45 * DEG),
  equirectangular: () => d3.geoEquirectangularRaw,
  authaGraph:      () => d3.geoImagoRaw(0.68),
};

const META = {
  equalEarth: {
    label: "Equal Earth",
    manifesto: "Areas are true. Africa is the size of Africa.",
  },
  hoboDyer: {
    label: "Hobo-Dyer",
    manifesto: "Equal-area cylinder, 37.5° standard parallel — the ODT south-up classic.",
  },
  gallPeters: {
    label: "Gall-Peters",
    manifesto: "The polemic equal-area rectangle. Size honesty, shape strain.",
  },
  equirectangular: {
    label: "Equirectangular",
    manifesto: "Plate carrée — the raw grid, distances true along parallels.",
  },
  authaGraph: {
    label: "AuthaGraph*",
    manifesto: "*Imago approximation (k=0.68) of Narukawa's foldable AuthaGraph.",
  },
};

let currentProjKey = "equalEarth";
let currentRaw = RAW.equalEarth(); // may be crossfaded toward another raw

// ---------- Proven helpers (@d3/projection-transitions) ----------
const lerp1 = (a, b, t) => a * (1 - t) + b * t;
const lerp2 = ([a0, b0], [a1, b1], t) => [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t];

function fitRaw(raw) {
  const p = d3.geoProjection(raw).fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "Sphere" }
  );
  return { scale: p.scale(), translate: p.translate() };
}

function interpolateProjection(raw0, raw1) {
  const f0 = fitRaw(raw0);
  const f1 = fitRaw(raw1);
  return (t) =>
    d3.geoProjection((x, y) => lerp2(raw0(x, y), raw1(x, y), t))
      .scale(lerp1(f0.scale, f1.scale, t))
      .translate(lerp2(f0.translate, f1.translate, t))
      .precision(0.2);
}

// ---------- Data ----------
let world = null;

async function loadWorld() {
  try {
    const res = await fetch("data/countries-110m.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const topo = await res.json();
    world = { countries: topojson.feature(topo, topo.objects.countries).features };
    render();
  } catch (err) {
    console.error("Failed to load world data:", err);
    document.querySelector(".tagline").textContent =
      "warning: data not loaded — check data/countries-110m.json";
  }
}

// ---------- Render ----------
const svg = d3.select("#map");
const defs = svg.append("defs");
const oceanGrad = defs.append("radialGradient")
  .attr("id", "ocean").attr("cx", "50%").attr("cy", "42%").attr("r", "75%");
oceanGrad.append("stop").attr("offset", "0%").attr("stop-color", "#241b45");
oceanGrad.append("stop").attr("offset", "100%").attr("stop-color", "#120f22");

const gMap = svg.append("g").attr("class", "map-root");

function buildProjection() {
  const proj = interpolateProjection(d3.geoOrthographicRaw, currentRaw)(state.alpha);

  // Backface choreography: globe clips to front hemisphere; flat sees all.
  if (state.alpha >= 0.999) proj.clipAngle(null);
  else proj.clipAngle(90 + 89.9 * state.alpha);

  const [lam, phi] = state.rotation;
  proj.rotate([lam, phi, state.roll]);
  return proj;
}

function render() {
  if (!world) return;
  const proj = buildProjection();
  const path = d3.geoPath(proj);

  gMap.selectAll("*").remove();

  gMap.append("path")
    .datum({ type: "Sphere" })
    .attr("class", "sphere")
    .attr("fill", "url(#ocean)")
    .attr("stroke", "#7e61d4")
    .attr("stroke-width", 1)
    .attr("d", path);

  if (state.graticule) {
    gMap.append("path")
      .datum(d3.geoGraticule10())
      .attr("class", "graticule")
      .attr("d", path);
  }

  gMap.append("g")
    .selectAll("path")
    .data(world.countries)
    .join("path")
    .attr("class", "country")
    .attr("d", (d) => safePath(path, d));

  const m = META[currentProjKey];
  gMap.append("text")
    .attr("x", 18).attr("y", HEIGHT - 40)
    .attr("class", "hud-title")
    .text(m.label.toUpperCase());
  gMap.append("text")
    .attr("x", 18).attr("y", HEIGHT - 22)
    .attr("class", "hud-sub")
    .text(`${m.manifesto}${state.roll === 180 ? " · SOUTH↑" : ""} · α=${state.alpha.toFixed(2)}`);
}

function safePath(path, feature) {
  try {
    const s = path(feature);
    return s && !s.includes("NaN") && !s.includes("Infinity") ? s : "";
  } catch {
    return "";
  }
}

// ---------- Animations ----------
const EASE = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t); // easeInOutQuad

function animateMorph(targetAlpha) {
  if (state.animating) return;
  state.animating = true;
  playBtn.disabled = true;
  const start = state.alpha;
  const delta = targetAlpha - start;
  const duration = 2000;
  const t0 = performance.now();

  function frame(now) {
    const t = Math.min((now - t0) / duration, 1);
    state.alpha = start + delta * EASE(t);
    slider.value = Math.round(state.alpha * 100);
    render();
    if (t < 1) requestAnimationFrame(frame);
    else { state.animating = false; playBtn.disabled = false; syncURL(); }
  }
  requestAnimationFrame(frame);
}

// Crossfade between flat projections (notebook behavior, 45-frame cadence).
function crossfadeTo(key) {
  if (key === currentProjKey || state.blending) return;
  const fromRaw = currentRaw;
  const toRaw = RAW[key]();
  const frames = 45;
  let j = 0;
  state.blending = true;

  function step() {
    j += 1;
    const t = Math.min(j / frames, 1);
    const e = EASE(t);
    currentRaw = (x, y) => {
      const [x0, y0] = fromRaw(x, y);
      const [x1, y1] = toRaw(x, y);
      return [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e];
    };
    render();
    if (t < 1) requestAnimationFrame(step);
    else {
      currentRaw = toRaw;
      currentProjKey = key;
      state.blending = false;
      syncURL();
    }
  }
  requestAnimationFrame(step);
}

// Idle auto-rotation (globe only, pauses on interaction).
let idleTimer = null;
function kickIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { idleTimer = null; }, 4000);
}
function autoRotate(ts) {
  if (!idleTimer && !state.animating && !dragging && state.alpha < 0.4) {
    state.rotation[0] += 0.06;
    render();
  }
  requestAnimationFrame(autoRotate);
}
requestAnimationFrame(autoRotate);

// ---------- Drag-rotate ----------
let dragging = false, lastXY = [0, 0];
svg.on("mousedown", (ev) => {
  dragging = true;
  kickIdle();
  lastXY = [ev.clientX, ev.clientY];
  svg.classed("dragging", true);
});
d3.select(window).on("mouseup.drag", () => {
  dragging = false;
  svg.classed("dragging", false);
});
svg.on("mousemove", (ev) => {
  if (!dragging) return;
  kickIdle();
  const dx = ev.clientX - lastXY[0];
  const dy = ev.clientY - lastXY[1];
  lastXY = [ev.clientX, ev.clientY];
  const k = state.alpha < 0.5 ? 0.28 : 0.12;
  state.rotation[0] += dx * k;
  state.rotation[1] = Math.max(-89, Math.min(89, state.rotation[1] - dy * k));
  render();
});

// ---------- Controls ----------
const slider = document.getElementById("morph-slider");
const playBtn = document.getElementById("btn-play");

slider.addEventListener("input", () => {
  if (!state.animating) {
    kickIdle();
    state.alpha = +slider.value / 100;
    render();
  }
});

playBtn.addEventListener("click", () => animateMorph(state.alpha < 0.5 ? 1 : 0));

document.getElementById("proj-select").addEventListener("change", (ev) => {
  crossfadeTo(ev.target.value);
});

const btnSouth = document.getElementById("btn-southup");
btnSouth.addEventListener("click", toggleSouth);
function toggleSouth() {
  state.roll = state.roll === 180 ? 0 : 180;
  btnSouth.classList.toggle("active", state.roll === 180);
  btnSouth.setAttribute("aria-pressed", String(state.roll === 180));
  render();
  syncURL();
}

const btnGrat = document.getElementById("btn-graticule");
btnGrat.addEventListener("click", toggleGraticule);
function toggleGraticule() {
  state.graticule = !state.graticule;
  btnGrat.classList.toggle("active", state.graticule);
  btnGrat.setAttribute("aria-pressed", String(state.graticule));
  render();
}

document.getElementById("btn-export").addEventListener("click", exportSVG);
function exportSVG() {
  const clone = svg.node().cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.insertBefore(clone.querySelector("defs"), clone.firstChild);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)],
                        { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `atlas-${currentProjKey}${state.roll === 180 ? "-south" : ""}-a${Math.round(state.alpha * 100)}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Keyboard shortcuts.
d3.select(window).on("keydown", (ev) => {
  if (ev.target.tagName === "SELECT") return;
  if (ev.code === "Space") { ev.preventDefault(); animateMorph(state.alpha < 0.5 ? 1 : 0); }
  else if (ev.key === "s") toggleSouth();
  else if (ev.key === "g") toggleGraticule();
  else if (ev.key === "e") exportSVG();
});

// ---------- Shareable state ----------
function syncURL() {
  const p = new URLSearchParams({
    proj: currentProjKey,
    alpha: state.alpha.toFixed(2),
    south: state.roll === 180 ? "1" : "0",
  });
  history.replaceState(null, "", `?${p}`);
}

function restoreURL() {
  const p = new URLSearchParams(location.search);
  const proj = p.get("proj");
  if (proj && RAW[proj]) {
    currentProjKey = proj;
    currentRaw = RAW[proj]();
    document.getElementById("proj-select").value = proj;
  }
  if (p.get("alpha")) state.alpha = Math.min(1, Math.max(0, +p.get("alpha")));
  if (p.get("south") === "1") {
    state.roll = 180;
    btnSouth.classList.add("active");
    btnSouth.setAttribute("aria-pressed", "true");
  }
  slider.value = Math.round(state.alpha * 100);
}

restoreURL();
loadWorld();
