const API_BASE = window.API_BASE || "http://localhost:3000";

export async function loadColors(category, selectId) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">ทั้งหมด</option>`;
  if (!category) return;

  try {
    const res = await fetch(`${API_BASE}/api/master/colors/${category}`);
    if (!res.ok) throw new Error("Failed to load colors");
    const colors = await res.json();
    if (!Array.isArray(colors)) throw new Error("Invalid colors data");

    colors.forEach(c => {
    select.innerHTML += `
      <option value="${c.COLOR_NO}">
        ${c.COLOR_NAME}
      </option>
    `;
    });
  } catch (err) {
    console.error("loadColors error:", err);
  }
}

export async function loadThickness(category, selectId) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">ทั้งหมด</option>`;
  if (!category) return;

  try {
    const res = await fetch(`${API_BASE}/api/master/thickness/${category}`);
    if (!res.ok) throw new Error("Failed to load thickness");
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error("Invalid thickness data");

    list.forEach(t => {
      select.innerHTML += `
        <option value="${t.THICKNESS_NO}">
          ${t.THICKNESS_NAME}
        </option>
      `;
    });
  } catch (err) {
    console.error("loadThickness error:", err);
  }
}