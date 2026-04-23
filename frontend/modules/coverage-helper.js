let COVERAGE_DATA = [];

export async function loadCoverageToForm(supplierNo, mapping) {

  const res = await fetch(`${API_BASE}/api/suppliers/${supplierNo}/coverage`);
  const data = await res.json();

  if (!Array.isArray(data)) return;

  COVERAGE_DATA = data;

  populateCategory(mapping.category, COVERAGE_DATA);

  // brand — ถ้า mapping ชี้ไปที่ checkbox dropdown ให้ใช้ renderCheckboxDropdown
  if (mapping.brand) {
    const brandItems = [];
    const seen = new Set();
    COVERAGE_DATA.forEach(d => {
      if (!d.brand_no || !d.brand_name) return;
      if (seen.has(d.brand_no)) return;
      seen.add(d.brand_no);
      brandItems.push({ value: d.brand_no, label: d.brand_name });
    });
    renderCheckboxDropdown(mapping.brand + "Dropdown", brandItems, mapping.brand + "Text");
  }

  // group
  if (mapping.group) {
    const groupItems = [];
    const seen = new Set();
    COVERAGE_DATA.forEach(d => {
      if (!d.group_code || !d.group_name) return;
      if (seen.has(d.group_code)) return;
      seen.add(d.group_code);
      groupItems.push({ value: d.group_code, label: d.group_name });
    });
    renderCheckboxDropdown(mapping.group + "Dropdown", groupItems, mapping.group + "Text");
  }

  // sub
  if (mapping.sub) {
    const subItems = [];
    const seen = new Set();
    COVERAGE_DATA.forEach(d => {
      if (!d.subGroup || !d.sub_group_name) return;
      if (seen.has(d.subGroup)) return;
      seen.add(d.subGroup);
      subItems.push({ value: d.subGroup, label: d.sub_group_name });
    });
    renderCheckboxDropdown(mapping.sub + "Dropdown", subItems, mapping.sub + "Text");
  }

  populateSku(mapping.sku, data);

  window.COVERAGE_DATA = data;
  window.renderContactDropdowns?.();
}

// ============================================================
// renderCheckboxDropdown — สร้าง checkbox list ใน dropdown container
// ============================================================
export function renderCheckboxDropdown(containerId, items, textId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = (items.length > 0 ? `
    <label class="block text-sm py-1 font-semibold border-b mb-1">
      <input type="checkbox" class="mr-2 select-all-checkbox" data-container="${containerId}" data-textid="${textId}" value="">
      ทั้งหมด
    </label>
  ` : '') + items.map(d => `
    <label class="block text-sm py-1">
      <input type="checkbox" value="${d.value}" class="mr-2 item-checkbox"
             data-container="${containerId}" data-textid="${textId}" data-label="${d.label}">
      ${d.label}
    </label>
  `).join("");

  // select-all handler
  const selectAllCb = el.querySelector('.select-all-checkbox');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', function () {
      el.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = this.checked);
      updateCheckboxText(containerId, textId);
    });
  }

  // item change handler
  el.querySelectorAll('.item-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const allItems = el.querySelectorAll('.item-checkbox');
      const allChecked = [...allItems].every(c => c.checked);
      if (selectAllCb) selectAllCb.checked = allChecked;
      updateCheckboxText(containerId, textId);
    });
  });
}

export function updateCheckboxText(containerId, textId) {
  const el = document.getElementById(containerId);
  const textEl = document.getElementById(textId);
  if (!el || !textEl) return;

  const labels = [...el.querySelectorAll('.item-checkbox:checked')]
    .map(cb => cb.dataset.label || cb.value);

  textEl.textContent = labels.length ? labels.join(", ") : "ทั้งหมด";
}

export function getCheckboxValues(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  return [...el.querySelectorAll('.item-checkbox:checked')].map(cb => cb.value);
}

function populate(selectId, dataArray, field) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">ทั้งหมด</option>`;

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

  select.innerHTML = `<option value="">ทั้งหมด</option>`;

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

  select.innerHTML = `<option value="">ทั้งหมด</option>`;

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

function populateBrandWithNo(selectId, dataArray) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">ทั้งหมด</option>`;

  const seen = new Set();

  dataArray.forEach(d => {
    const code = d.brand_no;   // ใช้ brand_no
    const name = d.brand_name;  // ใช้ brand_name

    if (!code || !name) return;
    if (seen.has(code)) return;

    seen.add(code);

    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;

    select.appendChild(opt);
  });
}

function populateGroupWithNo(selectId, dataArray, valueField, labelField) {
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">ทั้งหมด</option>`;

  const seen = new Set();

  dataArray.forEach(d => {
    const code = d.group_code;  // ใช้ group_code
    const name = d.group_name;  // ใช้ group_name

    if (!code || !name) return;
    if (seen.has(code)) return;

    seen.add(code);

    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;

    select.appendChild(opt);
  });
}

export function loadGroups(category, dropdownId) {
  const items = [];
  const seen = new Set();

  COVERAGE_DATA.filter(x => !category || x.category === category).forEach(d => {
    if (!d.group_code || !d.group_name) return;
    if (seen.has(d.group_code)) return;
    seen.add(d.group_code);
    items.push({ value: d.group_code, label: d.group_name });
  });

  const textId = dropdownId.replace("Dropdown", "Text");
  renderCheckboxDropdown(dropdownId, items, textId);
}

export function loadSubGroups(category, dropdownId) {
  const items = [];
  const seen = new Set();

  COVERAGE_DATA.filter(x => !category || x.category === category).forEach(d => {
    if (!d.subGroup || !d.sub_group_name) return;
    if (seen.has(d.subGroup)) return;
    seen.add(d.subGroup);
    items.push({ value: d.subGroup, label: d.sub_group_name });
  });

  const textId = dropdownId.replace("Dropdown", "Text");
  renderCheckboxDropdown(dropdownId, items, textId);
}