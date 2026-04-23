const API_BASE = window.API_BASE || "http://localhost:3000";

import { renderCheckboxDropdown } from "./coverage-helper.js";

export async function loadColors(category, dropdownId) {
  const textId = dropdownId.replace("Dropdown", "Text");
  const el = document.getElementById(dropdownId);
  if (!el) return;

  // clear while loading
  renderCheckboxDropdown(dropdownId, [], textId);

  if (!category) return;

  try {
    const res = await fetch(`${API_BASE}/api/master/colors/${category}`);
    if (!res.ok) throw new Error("Failed to load colors");
    const colors = await res.json();
    if (!Array.isArray(colors)) throw new Error("Invalid colors data");

    const items = colors.map(c => ({ value: String(c.COLOR_NO), label: c.COLOR_NAME }));
    renderCheckboxDropdown(dropdownId, items, textId);
  } catch (err) {
    console.error("loadColors error:", err);
  }
}

export async function loadThickness(category, dropdownId) {
  const textId = dropdownId.replace("Dropdown", "Text");
  const el = document.getElementById(dropdownId);
  if (!el) return;

  renderCheckboxDropdown(dropdownId, [], textId);

  if (!category) return;

  try {
    const res = await fetch(`${API_BASE}/api/master/thickness/${category}`);
    if (!res.ok) throw new Error("Failed to load thickness");
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error("Invalid thickness data");

    const items = list.map(t => ({
      value: String(t.THICKNESS_NO).padStart(2, "0"),
      label: t.THICKNESS_NAME
    }));
    renderCheckboxDropdown(dropdownId, items, textId);
  } catch (err) {
    console.error("loadThickness error:", err);
  }
}
