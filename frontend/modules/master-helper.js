export async function loadColors(category, selectId) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;
  if (!category) return;

  const res = await fetch(`${API_BASE}/api/master/colors/${category}`);
  const colors = await res.json();

  colors.forEach(c => {
    select.innerHTML += `
      <option value="${c.COLOR_NO}">
        ${c.COLOR_NAME}
      </option>
    `;
  });
}

export async function loadThickness(category, selectId) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;
  if (!category) return;

  const res = await fetch(`${API_BASE}/api/master/thickness/${category}`);
  const list = await res.json();

  list.forEach(t => {
    select.innerHTML += `
      <option value="${t.THICKNESS_NO}">
        ${t.THICKNESS_NAME}
      </option>
    `;
  });
}