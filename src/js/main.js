/* Decolonial Atlas — globe→projection morphing.
   Morph adapted from Somesh2228/globe-to-map-transform (MIT).
   Projections: d3-geo + d3-geo-projection + d3-geo-polygon.
   Data: world-atlas@2 (Natural Earth, public domain). */

"use strict";

const WIDTH = 1200;
const HEIGHT = 700;

const state = {
  alpha: 0,            // 0 = globe (orthographic), 1 = flat map
  rotation: [0, -15],  // [lambda, phi]
  southUp: false,
  graticule: true,
  animating: false,
};

// Raw projection functions for morph interpolation.
const DEG = Math.PI / 180;
const RAW = {
  equalEarth:      () => d3.geoEqualEarthRaw,
  hoboDyer:        () => d3.geoCylindricalEqualAreaRaw(37.5 * DEG),
  gallPeters:      () => d3.geoCylindricalEqualAreaRaw(45 * DEG),
  equirectangular: () => d3.geoEquirectangularRaw,
  authaGraph:      () => d3.geoImagoRaw(0.68),
};

const LABELS = {
  equalEarth: "Equal Earth",
  hoboDyer: "Hobo-Dyer",
  gallPeters: "Gall-Peters",
  equirectangular: "Equirectangular",
  authaGraph: "AuthaGraph* (Imago)",
};

let currentProjKey = "equalEarth";

function interpolateProjection(raw0, raw1) {
  const mutate = d3.geoProjectionMutator(
    (t) => (x, y) => {
      const [x0, y0] = raw0(x, y);
      const [x1, y1] = raw1(x, y);
      return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
    }
  );
  let t = 0;
  return Object.assign(mutate(t), {
    alpha(_) {
      return arguments.length ? mutate((t = +_)) : t;
    },
  });
}

let world = null;

async function loadWorld() {
  try {
    const res = await fetch("data/countries-110m.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const topo = await res.json();
    world = {
      countries: topojson.feature(topo, topo.objects.countries).features,
    };
    render();
  } catch (err) {
    console.error("Failed to load world data:", err);
    document.querySelector(".tagline").textContent =
      "warning: data not loaded — check data/countries-110m.json";
  }
}

const svg = d3.select("#map");
const gMap = svg.append("g").attr("class", "map-root");

function buildProjection() {
  const proj = interpolateProjection(d3.geoOrthographicRaw, RAW[currentProjKey]());
  const scale = d3.scaleLinear().domain([0, 1]).range([WIDTH * 0.42, WIDTH * 0.30]);
  proj.scale(scale(state.alpha));
  proj.translate([WIDTH / 2, HEIGHT / 2]);

  const [lam, phi] = state.rotation;
  const flip = state.southUp ? 180 : 0;
  const tilt = d3.interpolateNumber(phi, state.southUp ? 90 : -15)(state.alpha);
  proj.rotate([lam + flip, -tilt]);
  proj.precision(0.3);
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

  gMap.append("text")
    .attr("x", 16)
    .attr("y", HEIGHT - 14)
    .text(`${LABELS[currentProjKey]} · α=${state.alpha.toFixed(2)}${state.southUp ? " · SOUTH↑" : ""}`);
}

function safePath(path, feature) {
  try {
    const s = path(feature);
    return s && !s.includes("NaN") && !s.includes("Infinity") ? s : "";
  } catch {
    return "";
  }
}

function animateMorph(targetAlpha) {
  if (state.animating) return;
  state.animating = true;
  const start = state.alpha;
  const delta = targetAlpha - start;
  const duration = 1800;
  const t0 = performance.now();

  function frame(now) {
    const t = Math.min((now - t0) / duration, 1);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    state.alpha = start + delta * eased;
    slider.value = Math.round(state.alpha * 100);
    render();
    if (t < 1) requestAnimationFrame(frame);
    else { state.animating = false; playBtn.disabled = false; }
  }
  playBtn.disabled = true;
  requestAnimationFrame(frame);
}

let dragging = false, lastXY = [0, 0];
svg.on("mousedown", (ev) => {
  dragging = true;
  lastXY = [ev.clientX, ev.clientY];
  svg.classed("dragging", true);
});
d3.select(window).on("mouseup.drag", () => {
  dragging = false;
  svg.classed("dragging", false);
});
svg.on("mousemove", (ev) => {
  if (!dragging) return;
  const dx = ev.clientX - lastXY[0];
  const dy = ev.clientY - lastXY[1];
  lastXY = [ev.clientX, ev.clientY];
  const k = state.alpha < 0.5 ? 0.28 : 0.12;
  state.rotation[0] += dx * k;
  state.rotation[1] = Math.max(-89, Math.min(89, state.rotation[1] - dy * k));
  render();
});

const slider = document.getElementById("morph-slider");
const playBtn = document.getElementById("btn-play");

slider.addEventListener("input", () => {
  if (!state.animating) {
    state.alpha = +slider.value / 100;
    render();
  }
});

playBtn.addEventListener("click", () => animateMorph(state.alpha < 0.5 ? 1 : 0));

document.getElementById("proj-select").addEventListener("change", (ev) => {
  currentProjKey = ev.target.value;
  render();
});

const btnSouth = document.getElementById("btn-southup");
btnSouth.addEventListener("click", () => {
  state.southUp = !state.southUp;
  btnSouth.classList.toggle("active", state.southUp);
  btnSouth.setAttribute("aria-pressed", String(state.southUp));
  render();
});

const btnGrat = document.getElementById("btn-graticule");
btnGrat.addEventListener("click", () => {
  state.graticule = !state.graticule;
  btnGrat.classList.toggle("active", state.graticule);
  btnGrat.setAttribute("aria-pressed", String(state.graticule));
  render();
});

document.getElementById("btn-export").addEventListener("click", () => {
  const clone = svg.node().cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)],
                        { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `atlas-${currentProjKey}${state.southUp ? "-south" : ""}-a${Math.round(state.alpha * 100)}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

loadWorld();
