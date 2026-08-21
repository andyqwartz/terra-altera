/* TERRA ALTERA — theme manager.
   Resolves data-theme BEFORE first paint (script in <head> would be ideal;
   this runs at boot before heavy render — acceptable for v1). */

"use strict";

const THEME_KEY = "terra-altera-theme";

function resolveTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(choice) {
  // choice: "dark" | "light" | "auto"
  localStorage.setItem(THEME_KEY, choice);
  const resolved = choice === "auto"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : choice;
  document.documentElement.setAttribute("data-theme", resolved);

  document.querySelectorAll(".seg-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.themeChoice === choice));

  if (typeof paintOceanStops === "function") paintOceanStops();
  if (typeof render === "function" && world) render();
}

document.querySelectorAll(".seg-btn").forEach((b) =>
  b.addEventListener("click", () => applyTheme(b.dataset.themeChoice)));

// Follow system live when in auto mode.
window.matchMedia("(prefers-color-scheme: light)")
  .addEventListener("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "auto") === "auto") applyTheme("auto");
  });

applyTheme(localStorage.getItem(THEME_KEY) || "auto");
