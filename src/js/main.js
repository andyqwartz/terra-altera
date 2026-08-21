/* TERRA ALTERA — engine.
   Morphing core adapted verbatim from @d3/projection-transitions
   (https://observablehq.com/@d3/projection-transitions, ISC).
   Globe unrolling: clipAngle choreography 90°→180°.
   South-up: rigid roll γ=180. */

"use strict";

const WIDTH = 1200;
const HEIGHT = 700;
const PAD = 30;
const DEG = Math.PI / 180;

const state = {
  alpha: 0,
  rotation: [0, -10],
  roll: 0,               // 180 = south up
  graticule: true,
  borders: true,
  autoRotate: true,
  speed: 1,
  animating: false,
  blending: false,
};

const RAW = {
  equalEarth:      () => d3.geoEqualEarthRaw,
  hoboDyer:        () => d3.geoCylindricalEqualAreaRaw(37.5 * DEG),
  gallPeters:      () => d3.geoCylindricalEqualAreaRaw(45 * DEG),
  equirectangular: () => d3.geoEquirectangularRaw,
  authaGraph:      () => d3.geoImagoRaw(0.68),
};

let currentProjKey = "equalEarth";
let currentRaw = RAW.equalEarth();

/* ---------- Proven core (@d3/projection-transitions) ---------- */
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

/* ---------- Data ---------- */
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
    toast("World data failed to load — check data/countries-110m.json");
  }
}

/* ---------- Render ---------- */
const svg = d3.select("#map");
const defs = svg.append("defs");
const oceanGrad = defs.append("radialGradient")
  .attr("id", "ocean").attr("cx", "50%").attr("cy", "42%").attr("r", "75%");
oceanGrad.append("stop").attr("offset", "0%").attr("class", "oc-a");
oceanGrad.append("stop").attr("offset", "100%").attr("class", "oc-b");

// Theme-aware ocean stops via CSS variables on the gradient stops.
function paintOceanStops() {
  const cs = getComputedStyle(document.documentElement);
  oceanGrad.select(".oc-a").attr("stop-color", cs.getPropertyValue("--ocean-a").trim());
  oceanGrad.select(".oc-b").attr("stop-color", cs.getPropertyValue("--ocean-b").trim());
}

const gMap = svg.append("g").attr("class", "map-root");

function buildProjection() {
  const proj = interpolateProjection(d3.geoOrthographicRaw, currentRaw)(state.alpha);
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
    .attr("class", (d) => "country" + (state.borders ? "" : " noborder"))
    .attr("d", (d) => safePath(path, d));

  const info = PROJECTION_INFO[currentProjKey];
  gMap.append("text")
    .attr("x", 18).attr("y", HEIGHT - 42)
    .attr("class", "hud-title")
    .text(info.label.toUpperCase());
  gMap.append("text")
    .attr("x", 18).attr("y", HEIGHT - 22)
    .attr("class", "hud-sub")
    .text(info.kind + (state.roll === 180 ? " · SOUTH↑" : ""));
}

function safePath(path, feature) {
  try {
    const s = path(feature);
    return s && !s.includes("NaN") && !s.includes("Infinity") ? s : "";
  } catch {
    return "";
  }
}

/* ---------- Animations ---------- */
const EASE = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateMorph(targetAlpha) {
  if (state.animating) return;
  playBtn.disabled = true;
  const start = state.alpha;
  const delta = targetAlpha - start;

  if (reducedMotion()) {
    state.alpha = targetAlpha;
    slider.value = Math.round(state.alpha * 100);
    render();
    playBtn.disabled = false;
    syncURL();
    return;
  }

  state.animating = true;
  const duration = 2000 / state.speed;
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

function crossfadeTo(key) {
  if (key === currentProjKey || state.blending) return;
  const fromRaw = currentRaw;
  const toRaw = RAW[key]();
  const frames = reducedMotion() ? 1 : 45;
  let j = 0;
  state.blending = true;

  function step() {
    j += 1;
    const e = EASE(Math.min(j / frames, 1));
    currentRaw = (x, y) => {
      const [x0, y0] = fromRaw(x, y);
      const [x1, y1] = toRaw(x, y);
      return [x0 + (x1 - x0) * e, y0 + (y1 - y0) * e];
    };
    render();
    if (j < frames) requestAnimationFrame(step);
    else {
      currentRaw = toRaw;
      currentProjKey = key;
      state.blending = false;
      document.getElementById("proj-kind").textContent = PROJECTION_INFO[key].kind;
      syncURL();
    }
  }
  requestAnimationFrame(step);
}

/* Idle rotation */
let idleUntil = 0;
function kickIdle() { idleUntil = performance.now() + 4000; }
function autoRotate(ts) {
  if (state.autoRotate && !reducedMotion() &&
      performance.now() > idleUntil && !state.animating && !dragging && state.alpha < 0.4) {
    state.rotation[0] += 0.06;
    render();
  }
  requestAnimationFrame(autoRotate);
}
requestAnimationFrame(autoRotate);

/* ---------- Drag-rotate ---------- */
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

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------- Export ---------- */
function exportSVG() {
  paintOceanStops();
  const clone = svg.node().cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.insertBefore(clone.querySelector("defs"), clone.firstChild);
  // Inline theme colors for fills/strokes that come from CSS.
  const cs = getComputedStyle(document.documentElement);
  clone.querySelectorAll(".country").forEach((el) => {
    el.style.fill = cs.getPropertyValue("--land-fill").trim();
    el.style.stroke = state.borders ? cs.getPropertyValue("--land-stroke").trim() : "none";
  });
  clone.querySelectorAll(".graticule").forEach((el) => {
    el.style.stroke = cs.getPropertyValue("--graticule").trim();
  });
  clone.querySelector(".sphere").style.stroke = cs.getPropertyValue("--accent").trim();
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  downloadBlob(blob, exportName("svg"));
  toast("SVG exported");
}

async function exportPNG(scale) {
  paintOceanStops();
  const cs = getComputedStyle(document.documentElement);
  const clone = svg.node().cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", WIDTH * scale);
  clone.setAttribute("height", HEIGHT * scale);
  clone.insertBefore(clone.querySelector("defs"), clone.firstChild);
  clone.querySelectorAll(".country").forEach((el) => {
    el.style.fill = cs.getPropertyValue("--land-fill").trim();
    el.style.stroke = state.borders ? cs.getPropertyValue("--land-stroke").trim() : "none";
  });
  clone.querySelectorAll(".graticule").forEach((el) => {
    el.style.stroke = cs.getPropertyValue("--graticule").trim();
  });
  clone.querySelector(".sphere").style.stroke = cs.getPropertyValue("--accent").trim();
  // Opaque background in theme color (PNG for sharing/print).
  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("width", "100%"); bgRect.setAttribute("height", "100%");
  bgRect.style.fill = cs.getPropertyValue("--bg").trim();
  clone.insertBefore(bgRect, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  canvas.toBlob((blob) => {
    downloadBlob(blob, exportName("png"));
    toast(`PNG exported at ${scale}×`);
  }, "image/png");
}

function exportName(ext) {
  return `terra-altera-${currentProjKey}${state.roll === 180 ? "-south" : ""}-a${Math.round(state.alpha * 100)}.${ext}`;
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Info modal ---------- */
const backdrop = document.getElementById("modal-backdrop");

function openInfo() {
  const info = PROJECTION_INFO[currentProjKey];
  document.getElementById("modal-title").textContent = info.label;
  document.getElementById("modal-author").textContent = info.author;
  document.getElementById("modal-kind").textContent = info.kind;
  document.getElementById("modal-shows").textContent = info.shows;
  document.getElementById("modal-hides").textContent = info.hides;
  document.getElementById("modal-impl").textContent = info.impl;
  document.getElementById("modal-src").textContent = info.src;
  backdrop.hidden = false;
  document.getElementById("modal-close").focus();
}
function closeInfo() { backdrop.hidden = true; }

document.getElementById("btn-info").addEventListener("click", openInfo);
document.getElementById("modal-close").addEventListener("click", closeInfo);
backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeInfo(); });

/* ---------- Controls wiring ---------- */
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

document.getElementById("proj-select").addEventListener("change", (ev) => crossfadeTo(ev.target.value));

function setSouth(on) {
  state.roll = on ? 180 : 0;
  document.getElementById("sw-south").checked = on;
  const b = document.getElementById("btn-southup");
  b.classList.toggle("active", on);
  b.setAttribute("aria-pressed", String(on));
  render();
  syncURL();
}
document.getElementById("btn-southup").addEventListener("click", () => setSouth(state.roll !== 180));
document.getElementById("sw-south").addEventListener("change", (e) => setSouth(e.target.checked));

function setGraticule(on) {
  state.graticule = on;
  document.getElementById("sw-graticule").checked = on;
  const b = document.getElementById("btn-graticule");
  b.classList.toggle("active", on);
  b.setAttribute("aria-pressed", String(on));
  render();
}
document.getElementById("btn-graticule").addEventListener("click", () => setGraticule(!state.graticule));
document.getElementById("sw-graticule").addEventListener("change", (e) => setGraticule(e.target.checked));

document.getElementById("sw-borders").addEventListener("change", (e) => {
  state.borders = e.target.checked;
  render();
  syncURL();
});

document.getElementById("sw-autorotate").addEventListener("change", (e) => {
  state.autoRotate = e.target.checked;
});

document.getElementById("rng-speed").addEventListener("input", (e) => {
  state.speed = +e.target.value;
  document.getElementById("speed-val").textContent = `${state.speed}×`;
});

document.getElementById("btn-export-svg").addEventListener("click", exportSVG);
document.getElementById("btn-export-png").addEventListener("click", () => exportPNG(2));
document.querySelectorAll(".exp-btn").forEach((b) =>
  b.addEventListener("click", () => exportPNG(+b.dataset.png)));

/* Mobile panel toggle */
document.getElementById("btn-panel").addEventListener("click", () => {
  const p = document.getElementById("panel");
  const open = p.style.display !== "none";
  p.style.display = open ? "none" : "flex";
  document.getElementById("btn-panel").setAttribute("aria-expanded", String(!open));
});

/* Keyboard */
d3.select(window).on("keydown", (ev) => {
  if (ev.target.tagName === "SELECT" || ev.target.tagName === "INPUT") return;
  if (backdrop.hidden === false) { if (ev.key === "Escape") closeInfo(); return; }
  switch (ev.key.toLowerCase()) {
    case " ": ev.preventDefault(); animateMorph(state.alpha < 0.5 ? 1 : 0); break;
    case "s": setSouth(state.roll !== 180); break;
    case "g": setGraticule(!state.graticule); break;
    case "i": openInfo(); break;
    case "e": exportSVG(); break;
    case "p": exportPNG(2); break;
  }
});

/* ---------- Shareable state ---------- */
function syncURL() {
  const p = new URLSearchParams({
    proj: currentProjKey,
    alpha: state.alpha.toFixed(2),
    south: state.roll === 180 ? "1" : "0",
    borders: state.borders ? "1" : "0",
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
  if (p.get("south") === "1") setSouth(true);
  if (p.get("borders") === "0") {
    state.borders = false;
    document.getElementById("sw-borders").checked = false;
  }
  document.getElementById("proj-kind").textContent = PROJECTION_INFO[currentProjKey].kind;
  slider.value = Math.round(state.alpha * 100);
}

/* ---------- Boot ---------- */
restoreURL();
loadWorld();
