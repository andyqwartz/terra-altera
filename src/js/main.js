/* TERRA ALTERA — engine v1.1.
   Morphing core adapted verbatim from @d3/projection-transitions (ISC).
   Anti-oscillation: the morph re-fits scale/translate EVERY frame to the
   interpolated raw, so the map stays composed at every t (no drift/swing).
   Export: standalone SVG document built from scratch (no DOM cloning). */

"use strict";

const WIDTH = 1200;
const HEIGHT = 700;
const PAD = 30;
const DEG = Math.PI / 180;

const state = {
  alpha: 0,
  rotation: [0, -10],
  roll: 0,
  graticule: true,
  borders: true,
  autoRotate: true,
  speed: 1,
  animating: false,
  blending: false,
  focus: false,
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

/* ---------- Proven core + per-frame fit ---------- */
const lerp1 = (a, b, t) => a * (1 - t) + b * t;
const lerp2 = ([a0, b0], [a1, b1], t) => [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t];

function fitRaw(raw) {
  const p = d3.geoProjection(raw).fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "Sphere" }
  );
  return { scale: p.scale(), translate: p.translate() };
}

// Composite raw for a given morph t.
function morphedRaw(raw0, raw1, t) {
  return (x, y) => {
    const [x0, y0] = raw0(x, y);
    const [x1, y1] = raw1(x, y);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
}

// Re-fits the CURRENT composite shape every call → no oscillation.
function projectionAtT(raw0, raw1, t) {
  const fitted = fitRaw(morphedRaw(raw0, raw1, t));
  return d3.geoProjection(morphedRaw(raw0, raw1, t))
    .scale(fitted.scale)
    .translate(fitted.translate)
    .precision(0.2);
}

function currentCompositeRaw() {
  // During crossfade, currentRaw is already a composite closure; otherwise identity.
  return currentRaw;
}

// Clip choreography: the veil opens linearly across the WHOLE morph (v0.3 feel),
// but caps at 179.999° so we never jump clip->null (that jump flashed a sliver
// of antimeridian geometry at the end). Sub-pixel loss, invisible.
function clipForAlpha(a) {
  return Math.min(179.999, 90 + 90 * a);
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
    toast("World data failed to load");
  }
}

/* ---------- Render ---------- */
const svg = d3.select("#map");
const defs = svg.append("defs");
const oceanGrad = defs.append("radialGradient")
  .attr("id", "ocean").attr("cx", "50%").attr("cy", "42%").attr("r", "75%");
oceanGrad.append("stop").attr("offset", "0%").attr("class", "oc-a");
oceanGrad.append("stop").attr("offset", "100%").attr("class", "oc-b");

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const get = (n) => cs.getPropertyValue(n).trim();
  return {
    bg: get("--bg"), oceanA: get("--ocean-a"), oceanB: get("--ocean-b"),
    landFill: get("--land-fill"), landStroke: get("--land-stroke"),
    accent: get("--accent"), ink: get("--ink"), inkDim: get("--ink-dim"),
    graticule: get("--graticule"),
  };
}

function paintOceanStops() {
  const c = themeColors();
  oceanGrad.select(".oc-a").attr("stop-color", c.oceanA);
  oceanGrad.select(".oc-b").attr("stop-color", c.oceanB);
}

const gMap = svg.append("g").attr("class", "map-root");

function buildProjection() {
  // Globe unroll: interpolate orthographic → current flat raw, refit per frame.
  if (state.alpha < 0.999) {
    const proj = projectionAtT(d3.geoOrthographicRaw, currentCompositeRaw(), state.alpha);
    proj.clipAngle(clipForAlpha(state.alpha));
    const [lam, phi] = state.rotation;
    proj.rotate([lam, phi, state.roll]);
    return proj;
  }
  // Flat: plain projection of the current raw, freshly fitted.
  const fitted = fitRaw(currentCompositeRaw());
  const proj = d3.geoProjection(currentCompositeRaw())
    .scale(fitted.scale).translate(fitted.translate).precision(0.2);
  const [lam, phi] = state.rotation;
  proj.rotate([lam, phi, state.roll]);
  return proj;
}

function render() {
  if (!world) return;
  const c = themeColors();
  paintOceanStops();
  const proj = buildProjection();
  const path = d3.geoPath(proj);

  gMap.selectAll("*").remove();

  gMap.append("path")
    .datum({ type: "Sphere" })
    .attr("class", "sphere")
    .attr("fill", "url(#ocean)")
    .attr("stroke", c.accent)
    .attr("stroke-width", 1)
    .attr("d", path);

  if (state.graticule) {
    gMap.append("path")
      .datum(d3.geoGraticule10())
      .attr("class", "graticule")
      .attr("stroke", c.graticule)
      .attr("fill", "none")
      .attr("stroke-width", 0.5)
      .attr("d", path);
  }

  gMap.append("g")
    .selectAll("path")
    .data(world.countries)
    .join("path")
    .attr("fill", c.landFill)
    .attr("stroke", state.borders ? c.landStroke : "none")
    .attr("stroke-width", 0.6)
    .attr("d", (d) => safePath(path, d));

  const info = PROJECTION_INFO[currentProjKey];
  gMap.append("text")
    .attr("x", 18).attr("y", HEIGHT - 42)
    .attr("class", "hud-title")
    .attr("fill", c.ink)
    .text(info.label.toUpperCase());
  gMap.append("text")
    .attr("x", 18).attr("y", HEIGHT - 22)
    .attr("class", "hud-sub")
    .attr("fill", c.inkDim)
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
    render(); // buildProjection re-fits every frame
    if (t < 1) requestAnimationFrame(frame);
    else { state.animating = false; playBtn.disabled = false; syncURL(); }
  }
  requestAnimationFrame(frame);
}

function crossfadeTo(key) {
  if (key === currentProjKey || state.blending) return;
  const fromRaw = currentCompositeRaw();
  const toRaw = RAW[key]();
  const frames = reducedMotion() ? 1 : 45;
  let j = 0;
  state.blending = true;

  function step() {
    j += 1;
    const e = EASE(Math.min(j / frames, 1));
    currentRaw = morphedRaw(fromRaw, toRaw, e);
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
function autoRotate() {
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

/* ================================================================
   EXPORT — standalone SVG document built from scratch.
   No cloning of the live DOM: fresh geometry, inline styles only.
   ================================================================ */

function buildStandaloneSVG(scale = 1) {
  const c = themeColors();
  const W = WIDTH * scale, H = HEIGHT * scale;

  // Fresh projection fitted to export dimensions.
  let proj;
  if (state.alpha < 0.999) {
    proj = projectionAtT(d3.geoOrthographicRaw, currentCompositeRaw(), state.alpha);
    proj.clipAngle(clipForAlpha(state.alpha));
  } else {
    const f = fitRaw(currentCompositeRaw());
    proj = d3.geoProjection(currentCompositeRaw())
      .scale(f.scale).translate(f.translate).precision(0.2);
  }
  const [lam, phi] = state.rotation;
  proj.rotate([lam, phi, state.roll]);

  // Scale translate for export size (fit was computed at base size).
  const tr = proj.translate();
  proj.translate([tr[0] * scale, tr[1] * scale]);
  proj.scale(proj.scale() * scale);

  const path = d3.geoPath(proj);
  const parts = [];

  parts.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><radialGradient id="ocean" cx="50%" cy="42%" r="75%">`,
    `<stop offset="0%" stop-color="${c.oceanA}"/>`,
    `<stop offset="100%" stop-color="${c.oceanB}"/>`,
    `</radialGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="${c.bg}"/>`
  );

  parts.push(`<path fill="url(#ocean)" stroke="${c.accent}" stroke-width="${1 * scale}" d="${path({ type: "Sphere" }) || ""}"/>`);

  if (state.graticule) {
    parts.push(`<path fill="none" stroke="${c.graticule}" stroke-width="${0.5 * scale}" d="${path(d3.geoGraticule10()) || ""}"/>`);
  }

  for (const country of world.countries) {
    const d = safePath(path, country);
    if (d) parts.push(`<path fill="${c.landFill}" stroke="${state.borders ? c.landStroke : "none"}" stroke-width="${0.6 * scale}" d="${d}"/>`);
  }

  const info = PROJECTION_INFO[currentProjKey];
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  parts.push(
    `<text x="${18 * scale}" y="${(HEIGHT - 42) * scale}" font-family="Syne, sans-serif" font-weight="800" font-size="${21 * scale}" letter-spacing="${0.18 * 21 * scale}" fill="${c.ink}">${esc(info.label.toUpperCase())}</text>`,
    `<text x="${18 * scale}" y="${(HEIGHT - 22) * scale}" font-family="Georgia, serif" font-style="italic" font-size="${12.5 * scale}" fill="${c.inkDim}">${esc(info.kind + (state.roll === 180 ? " · SOUTH\u2191" : ""))}</text>`,
    `</svg>`
  );

  return parts.join("\n");
}

function exportSVG() {
  const xml = buildStandaloneSVG(1);
  downloadBlob(new Blob([xml], { type: "image/svg+xml" }), exportName("svg"));
  toast("SVG exported");
}

async function exportPNG(scale) {
  try {
    const xml = buildStandaloneSVG(scale);
    const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("SVG rasterization failed"));
      img.src = url;
    });
    // Use intrinsic size when available (Firefox needs explicit canvas dims).
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH * scale;
    canvas.height = HEIGHT * scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) { toast("PNG export failed"); return; }
      downloadBlob(blob, exportName("png"));
      toast(`PNG exported at ${scale}\u00D7`);
    }, "image/png");
  } catch (err) {
    console.error(err);
    toast("PNG export failed");
  }
}

function exportName(ext) {
  return `terra-altera-${currentProjKey}${state.roll === 180 ? "-south" : ""}-a${Math.round(state.alpha * 100)}.${ext}`;
}

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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

/* ---------- Controls ---------- */
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
  render();
  syncURL();
}
document.getElementById("sw-south").addEventListener("change", (e) => setSouth(e.target.checked));

function setGraticule(on) {
  state.graticule = on;
  document.getElementById("sw-graticule").checked = on;
  render();
}
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
  document.getElementById("speed-val").textContent = `${state.speed}\u00D7`;
});

document.getElementById("btn-export-svg").addEventListener("click", exportSVG);
// PNG scale buttons ONLY (class exp-btn with data-png). The SVG button is .wide, no data-png.
document.querySelectorAll(".exp-btn[data-png]").forEach((b) =>
  b.addEventListener("click", () => exportPNG(+b.dataset.png)));

/* Focus mode */
document.getElementById("btn-focus").addEventListener("click", toggleFocus);
function toggleFocus() {
  state.focus = !state.focus;
  document.body.classList.toggle("focus", state.focus);
  document.getElementById("btn-focus").classList.toggle("active", state.focus);
}

/* Mobile panel */
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
    case "f": toggleFocus(); break;
    case "t": document.getElementById("btn-theme").click(); break;
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
  if (p.get("south") === "1") {
    state.roll = 180;
    document.getElementById("sw-south").checked = true;
  }
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
