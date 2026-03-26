let COVERAGE_DATA = [];

export async function loadCoverageToForm(supplierNo, mapping) {

  const res = await fetch(`${API_BASE}/api/suppliers/${supplierNo}/coverage`);
  const data = await res.json();

  console.log("🔥 COVERAGE DATA:", data);   // 👈 ใส่ตรงนี้
  console.log("🔥 SAMPLE ROW:", data?.[0]); // 👈 และอันนี้

  if (!Array.isArray(data)) return;

  COVERAGE_DATA = data;

  populateCategory(mapping.category, COVERAGE_DATA);
  populatePair(mapping.brand, COVERAGE_DATA, "brand", "brand_name");

  populatePair(mapping.sub, data, "subGroup", "sub_group_name");
  populate(mapping.color, data, "color_name");
  populate(mapping.thickness, data, "thickness_name");
  populateSku(mapping.sku, data);

  // 🔥 ADD THIS
  window.COVERAGE_DATA = data;
  window.renderContactDropdowns?.();
}

function populate(selectId, dataArray, field) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;

  const unique = [...new Set(dataArray.map(d => d[field]).filter(Boolean))];

  unique.forEach(value => {
    select.innerHTML += `
      <option value="${value}">
        ${value}
      </option>
    `;
  });
}

function populateCategory(selectId, dataArray) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;

  // unique by category (English)
  const unique = [];
  const seen = new Set();

  dataArray.forEach(d => {
    if (!d.category) return;

    if (!seen.has(d.category)) {
      seen.add(d.category);
      unique.push({
        value: d.category,          // 👈 English (Glass)
        label: d.category_name      // 👈 Thai (กระจก)
      });
    }
  });

  unique.forEach(item => {
    select.innerHTML += `
      <option value="${item.value}">
        ${item.label}
      </option>
    `;
  });
}

function populateSku(inputId, dataArray) {

  const datalist = document.getElementById("skuList");
  if (!datalist) return;

  datalist.innerHTML = "";

  const unique = [...new Set(
    dataArray.map(d => d.sku).filter(Boolean)
  )];

  unique.forEach(value => {
    datalist.innerHTML += `<option value="${value}"></option>`;
  });
}

function populatePair(selectId, dataArray, valueField, labelField) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;

  const seen = new Set();

  dataArray.forEach(d => {
    const code = d[valueField];
    const name = d[labelField];

    if (!code || !name) return;
    if (seen.has(code)) return;

    seen.add(code);

    const opt = document.createElement("option");

    // value = code
    opt.value = code;

    // text = name
    opt.textContent = name;

    select.appendChild(opt);
  });
}

export function loadGroups(category, brand, selectId) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;

  const filtered = COVERAGE_DATA.filter(x =>
    (!category || x.category === category) &&
    (!brand || x.brand === brand)
  );

  const seen = new Set();

  filtered.forEach(d => {

    if (!d.group || !d.group_name) return;
    if (seen.has(d.group)) return;

    seen.add(d.group);

    const opt = document.createElement("option");

    opt.value = d.group;
    opt.textContent = d.group_name;

    select.appendChild(opt);
  });
}

export function loadSubGroups(category, brand, group, selectId) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;

  const filtered = COVERAGE_DATA.filter(x =>
    (!category || x.category === category) &&
    (!brand || x.brand === brand) &&
    (!group || x.group === group)
  );

  const seen = new Set();

  filtered.forEach(d => {

    if (!d.subGroup || !d.sub_group_name) return;
    if (seen.has(d.subGroup)) return;

    seen.add(d.subGroup);

    const opt = document.createElement("option");

    opt.value = d.subGroup;              // code
    opt.textContent = d.sub_group_name;  // name

    select.appendChild(opt);
  });
}