// stretch helper injected before stretch-audit runs — defines __widestLandRun.
window.__widestLandRun = async function() {
  // Render current state, rasterize, find widest horizontal run of LAND pixels.
  const svgEl = document.getElementById("map");
  const xml = new XMLSerializer().serializeToString(svgEl);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("x")); img.src = url; });
  try { await img.decode(); } catch {}
  const W = 640, H = 373;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  // Land = brighter purple than ocean. Sample the palette: land fill over ocean
  // yields r≈g+10..40, b high; ocean is r<40,g<30,b<75 dark violet-blue.
  const isLand = (i) => {
    const r=d[i], g=d[i+1], b=d[i+2];
    return b > 60 && r > 45 && r > g + 6 && b >= g;
  };
  let widest = 0, widestY = -1;
  for (let y = 0; y < H; y++) {
    let run = 0, best = 0;
    for (let x = 0; x < W; x++) {
      if (isLand((y*W+x)*4)) { run++; if (run > best) best = run; }
      else run = 0;
    }
    if (best > widest) { widest = best; widestY = y; }
  }
  return { widest, widestY };
};
