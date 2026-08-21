/* TERRA ALTERA — theme toggle (single discreet button).
   Cycles dark ↔ light; persists. */

"use strict";

const THEME_KEY = "terra-altera-theme";

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("btn-theme");
  if (btn) btn.textContent = theme === "dark" ? "\u25D0" : "\u25D1";
  if (typeof paintOceanStops === "function") paintOceanStops();
  if (typeof render === "function" && world) render();
}

function toggleTheme() {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
}

document.getElementById("btn-theme").addEventListener("click", toggleTheme);

applyTheme(localStorage.getItem(THEME_KEY) || systemTheme());
