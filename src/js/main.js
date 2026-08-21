/* SERENDIPPO · Atlas Décolonial — main.js v0
   Morphing globe → projection adapté de Somesh2228/globe-to-map-transform (MIT)
   Projections : d3-geo (core) + d3-geo-projection + d3-geo-polygon
   Données : world-atlas@2 countries-110m (Natural Earth, domaine public) */

"use strict";

const WIDTH = 1200;
const HEIGHT = 700;

// ---------- État ----------
const state = {
  alpha: 0,            // 0 = globe (orthographique), 1 = carte plate
  rotation: [0, -15],  // [lambda, phi] — départ légèrement incliné
  southUp: false,
  graticule: true,
  animating: false,
};

// ---------- Projections alternatives ----------
// Chaque entrée : { raw: fonction brute (x,y)->[x',y'], opts: options }
const PROJECTIONS = {
  equalEarth:      { label: "Equal Earth",       make: () => d3.geoEqualEarth() },
  hoboDyer:        { label: "Hobo-Dyer",          make: () => d3.geoCylindricalEqualArea().parallel(37.5) },
  gallPeters:      { label: "Gall-Peters",        make: () => d3.geoCylindricalEqualArea().parallel(45) },
  equirectangular: { label: "Équirectangulaire",  make: () => d3.geoEquirectangular() },
  authaGraph:      { label: "AuthaGraph* (Imago)",make: () => d3.geoImago().k(0.68) },
};

let currentProjKey = "equalEarth";

// ---------- Morphing (brique importée — NE PAS RÉÉCRIRE) ----------
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

// ---------- Données ----------
let world = null; // { countries: [...], land: ... }

async function loadWorld() {
  try {
    const res = await fetch("data/countries-110m.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const topo = await res.json();
    world = {
      countries: topojson.feature(topo, topo.objects.countries).features,
      borders: topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b),
      outline: topojson.feature(topo, topo.objects.land),
    };
    render();
  } catch (err) {
    console.error("Chargement world-atlas échoué:", err);
    document.querySelector(".tagline").textContent =
      "⚠ données non chargées — vérifier data/countries-110m.json";
  }
}

// ---------- Rendu ----------
const svg = d3.select("#map");
const gMap = svg.append("g").attr("class", "map-root");

function buildProjection() {
  // Interpolation orthographique (globe) → projection cible
  const targetRaw = getTargetRaw();
  const proj = interpolateProjection(d3.geoOrthographicRaw, targetRaw);

  // Échelle interpolée : globe compact → carte étalée
  const scale = d3.scaleLinear().domain([0, 1]).range([WIDTH * 0.42, WIDTH * 0.30]);
  proj.scale(scale(state.alpha));
  proj.translate([WIDTH / 2, HEIGHT / 2]);

  // Rotation : lambda inversé si Sud-en-haut ; phi bascule vers +90 au fil du dépliage
  const [lam, phi] = state.rotation;
  const flip = state.southUp ? 180 : 0;
  const tilt = d3.interpolateNumber(phi, state.southUp ? 90 : -15)(state.alpha);
  proj.rotate([lam + flip, -tilt]);
  proj.precision(0.3);
  return proj;
}

// Extrait la "raw function" de la projection cible choisie.
// Les projections D3 exposent leur transformée via .raw quand dispo ;
// sinon on passe par un clone projeté sur un point test pour récupérer raw.
function getTargetRaw() {
  const p = PROJECTIONS[currentProjKey];
  const inst = p.make();
  // d3 stocke la fonction brute sous projection.raw pour les projections standard
  if (inst.raw) return inst.raw;
  // Fallback générique : équirectangulaire
  return d3.geoEquirectangularRaw;
}

function render() {
  if (!world) return;
  const proj = buildProjection();
  const path = d3.geoPath(proj);

  gMap.selectAll("*").remove();

  // Sphère / cadre
  gMap.append("path")
    .datum({ type: "Sphere" })
    .attr("class", "sphere")
    .attr("d", path);

  // Graticule
  if (state.graticule) {
    gMap.append("path")
      .datum(d3.geoGraticule10())
      .attr("class", "graticule")
      .attr("d", path);
  }

  // Pays
  gMap.append("g")
    .selectAll("path")
    .data(world.countries)
    .join("path")
    .attr("class", "country")
    .attr("d", (d) => safePath(path, d));

  // Titre discret de la projection courante
  gMap.append("text")
    .attr("x", 16)
    .attr("y", HEIGHT - 14)
    .text(`${PROJECTIONS[currentProjKey].label} · α=${state.alpha.toFixed(2)}${state.southUp ? " · SUD↑" : ""}`);
}

function safePath(path, feature) {
  try {
    const s = path(feature);
    return s && !s.includes("NaN") && !s.includes("Infinity") ? s : "";
  } catch {
    return "";
  }
}

// ---------- Animation morphing ----------
function animateMorph(targetAlpha) {
  if (state.animating) return;
  state.animating = true;
  const start = state.alpha;
  const delta = targetAlpha - start;
  const duration = 1800;
  const t0 = performance.now();

  function frame(now) {
    const t = Math.min((now - t0) / duration, 1);
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad (pattern importé)
    state.alpha = start + delta * eased;
    slider.value = Math.round(state.alpha * 100);
    render();
    if (t < 1) requestAnimationFrame(frame);
    else { state.animating = false; playBtn.disabled = false; }
  }
  playBtn.disabled = true;
  requestAnimationFrame(frame);
}

// ---------- Drag-rotate ----------
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
  const k = state.alpha < 0.5 ? 0.28 : 0.12; // plus sensible sur le globe
  state.rotation[0] += dx * k;
  state.rotation[1] = Math.max(-89, Math.min(89, state.rotation[1] - dy * k));
  render();
});

// ---------- Contrôles UI ----------
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

// ---------- Export SVG vectoriel ----------
document.getElementById("btn-export").addEventListener("click", () => {
  const clone = svg.node().cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const blob = new Blob([new XMLSerializer().serializeToString(clone)],
                        { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `atlas-${currentProjKey}${state.southUp ? "-sud" : ""}-a${Math.round(state.alpha * 100)}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Boot ----------
loadWorld();
