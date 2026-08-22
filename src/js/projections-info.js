/* TERRA ALTERA — per-projection documentation.
   Facts sourced from research/P01_d3_geo_projections.md and P11_data_sources.md
   (d3-geo docs, Wikipedia, equal-earth.com, ODT). */

"use strict";

const PROJECTION_INFO = {
  equalEarth: {
    label: "Equal Earth",
    author: "Šavrič, Patterson & Jenny — 2018",
    kind: "Pseudocylindrical · equal-area",
    shows: "Every country at its true size. Africa swallows Greenland whole — because it does.",
    hides: "Shapes stretch near the poles; distances and directions are not preserved anywhere.",
    impl: "Native d3-geo core (geoEqualEarthRaw). The reference projection for a fair-area world view.",
    src: "d3/d3-geo (ISC) · original paper: International Journal of Geographical Information Science",
  },
  hoboDyer: {
    label: "Hobo-Dyer",
    author: "Mick Dyer — 2002, ODT Inc.",
    kind: "Cylindrical · equal-area · standard parallel 37.5°",
    shows: "The south-up classic: printed flipped since day one to challenge north-first habits.",
    hides: "Extreme horizontal stretch near the poles; shape fidelity traded entirely for area honesty.",
    impl: "d3.geoCylindricalEqualAreaRaw(37.5°) from d3-geo-projection.",
    src: "d3/d3-geo-projection (ISC) · odtmaps.com",
  },
  gallPeters: {
    label: "Gall-Peters",
    author: "James Gall — 1885 · Arno Peters — 1973",
    kind: "Cylindrical · equal-area · standard parallel 45°",
    shows: "The polemic rectangle. Peters re-presented Gall's century-old projection as the 'fair map' for development geography.",
    hides: "Vertical stretch is severe (Africa looks like a stretched ribbon); the debate it fueled was as much political as cartographic.",
    impl: "d3.geoCylindricalEqualAreaRaw(45°) from d3-geo-projection.",
    src: "d3/d3-geo-projection (ISC)",
  },
  equirectangular: {
    label: "Equirectangular",
    author: "Marinus of Tyre — c. 100 AD",
    kind: "Cylindrical · neither equal-area nor conformal · equidistant along parallels",
    shows: "The raw plate carrée grid: every degree is a square. The computer's native flat Earth.",
    hides: "Nothing about area or shape is true except along the equator — it simply refuses to editorialize.",
    impl: "d3.geoEquirectangularRaw, d3-geo core. Also the morph target of the globe unrolling.",
    src: "d3/d3-geo (ISC)",
  },
  hammer: {
    label: "Hammer",
    author: "Ernst Hammer — 1892",
    kind: "Elliptical · equal-area",
    shows: "The whole world in one graceful ellipse, every area kept true. The quiet classic behind many 20th-century atlases.",
    hides: "Shapes compress near the ellipse's edge; directions are not preserved.",
    impl: "d3.geoHammerRaw from d3-geo-projection.",
    src: "d3/d3-geo-projection (ISC)",
  },
  sinusoidal: {
    label: "Sinusoidal",
    author: "Jean Cossin de Bonneval · Nicolas Sanson · William Flamsteed — 1570/1650/1729",
    kind: "Pseudocylindrical · equal-area · the oldest equal-area projection still in use",
    shows: "The equator and every meridian at true length — a world drawn with sines, three centuries before statistics.",
    hides: "Everything bends away from the central meridian; the far continents shear like taffy.",
    impl: "d3.geoSinusoidalRaw, d3-geo-projection (Sanson–Flamsteed).",
    src: "d3/d3-geo-projection (ISC)",
  },
  bertin1953: {
    label: "Bertin 1953",
    author: "Jacques Bertin — 1953 · revisited by B. Jenny & P. Rivière, 2018",
    kind: "Modified Briesemeister (Hammer-based) · equal-area · unrotated form",
    shows: "Bertin's 'projection of peace': an oval tuned so no continent towers over another — Europe pushed aside, the tropics given their weight.",
    hides: "It is fixed to one framing (the official factory bakes in its rotation); ocean space swallows the edges.",
    impl: "bertin1953Raw ported verbatim from d3-geo-projection's bertin.js so the morph engine can drive it as a plain raw.",
    src: "d3/d3-geo-projection (ISC) · bl.ocks.org/Fil/5b9ee9636dfb6ffa53443c9006beb642",
  },
  authaGraph: {
    label: "AuthaGraph* (Imago)",
    author: "*Imago: Justin Kunimune — 2017 · AuthaGraph inspiration: Hajime Narukawa — 1999",
    kind: "Approximation of a tetrahedral equal-area foldable projection",
    shows: "Narukawa's AuthaGraph can tile the sphere infinitely and keeps relative areas within ~1%. This Imago variant (k=0.68) is its closest open-source approximation.",
    hides: "It is NOT the patented original — graticule kinks differ slightly; the true AuthaGraph has no public implementation.",
    impl: "d3.geoImagoRaw(0.68) from d3-geo-polygon, ported by Philippe Rivière from Kunimune's equations.",
    src: "d3/d3-geo-polygon (ISC) · kunimune.blog · authagraph.com",
  },
};
