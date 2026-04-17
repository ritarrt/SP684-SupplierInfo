console.log("supplier-product-coverage.js loaded");

let selectedGroup = "";
let selectedSubGroup = "";

// ===================================================
// CONFIG
// ===================================================
//const API_BASE = "http://localhost:3000";

// ===================================================
// CONSTANT / STATE
// ===================================================
const CATEGORY_LABEL = {
  Glass: "กระจก",
  Aluminum: "อลูมิเนียม",
  Gypsum: "ยิปซัม",
  Sealant: "กาวยาแนว",
  "C-Line": "ซีลาย",
  Accessories: "อุปกรณ์",
};

let PRODUCT_ROW_SEQ = 1;

// ===================================================
// PUBLIC (expose to window for HTML onclick)
// ===================================================
window.loadProductCoverage = loadProductCoverage;
//window.saveProductCoverage = saveProductCoverage;
window.addProductRow = addProductRow;
window.removeProductRow = removeProductRow;
window.toggleCategoryDropdown = toggleCategoryDropdown;
window.toggleBrandDropdown = toggleBrandDropdown;
window.toggleGroupDropdown = toggleGroupDropdown;
window.toggleSubGroupDropdown = toggleSubGroupDropdown;
window.closeAllRowDropdowns = closeAllRowDropdowns;

// ===================================================
// BASIC HELPERS
// ===================================================
function getCoverageContainer() {
  return document.getElementById("productCoverageContainer");
}

function getAllRows() {
  const c = getCoverageContainer();
  return c ? Array.from(c.querySelectorAll(".product-row")) : [];
}

function resetRow(row) {
  if (!row) return;

  row.dataset.category = "";
  row.dataset.brand = "";
  row.dataset.group = "";

  const catText = row.querySelector(".category-display span");
  const brandText = row.querySelector(".brand-display span");
  const groupText = row.querySelector(".group-display span");

  if (catText) catText.textContent = "ทั้งหมด";
  if (brandText) brandText.textContent = "ทั้งหมด";
  if (groupText) groupText.textContent = "ทั้งหมด";

  // ===== RESET SUBGROUP DISPLAY =====
const subText = row.querySelector(".subgroup-display span");
if (subText) subText.textContent = "ทั้งหมด";
  // ===== RESET SUBGROUP =====
const subSel = row.querySelector(".subgroup-select");
if (subSel) {
  subSel.value = "";
  subSel.innerHTML = `<option value="">ทั้งหมด</option>`;
}

// ===== RESET SUBGROUP DROPDOWN =====
const subDD = row.querySelector(".subgroup-dropdown");
if (subDD) {
  subDD.innerHTML = "";
  subDD.classList.add("hidden");
}

// ===== RESET DATA =====
row.dataset.subGroup = "";

  const sku = row.querySelector(".sku-input");
  if (sku) sku.value = "";

  const catDD = row.querySelector(".category-dropdown");
  const brandDD = row.querySelector(".brand-dropdown");
  const groupDD = row.querySelector(".group-dropdown");

  if (catDD) catDD.innerHTML = "";
  if (brandDD) brandDD.innerHTML = "";
  if (groupDD) groupDD.innerHTML = "";
}

function setDisplayTextFromDropdown(
  row,
  dropdownSelector,
  textSelector,
  value,
  fallbackText
) {
  if (!row) return;

  const dropdown = row.querySelector(dropdownSelector);
  const textEl = row.querySelector(textSelector);

  if (!dropdown || !textEl) {
    if (textEl) textEl.textContent = fallbackText;
    return;
  }

  if (!value) {
    textEl.textContent = fallbackText;
    return;
  }

  // หา input radio ที่มี value ตรงกัน
  const input = dropdown.querySelector(
    `input[value="${CSS.escape(String(value))}"]`
  );

  if (!input) {
    textEl.textContent = fallbackText;
    return;
  }

  const labelText = input.parentElement.textContent.trim();
  textEl.textContent = labelText || fallbackText;
}


function closeAllRowDropdowns() {
  getAllRows().forEach((row) => {
    const catDD = row.querySelector(".category-dropdown");
const brandDD = row.querySelector(".brand-dropdown");
const groupDD = row.querySelector(".group-dropdown");

if (catDD) catDD.innerHTML = "";
if (brandDD) brandDD.innerHTML = "";
if (groupDD) groupDD.innerHTML = "";

  });
}

// ===================================================
// ADD / REMOVE ROW
// ===================================================
function addProductRow() {
  const container = getCoverageContainer();
  if (!container) return;

  const firstRow = container.querySelector(".product-row");
  if (!firstRow) return;

  const newRow = firstRow.cloneNode(true);
  PRODUCT_ROW_SEQ++;

  // =========================
  // reset dataset
  // =========================
  newRow.dataset.category = "";
  newRow.dataset.brand = "";
  newRow.dataset.group = "";
  newRow.dataset.rowSeq = String(PRODUCT_ROW_SEQ);

  // =========================
  // reset display text
  // =========================
  const catText = newRow.querySelector(".category-display span");
  if (catText) catText.textContent = "ทั้งหมด";

  const brandText = newRow.querySelector(".brand-display span");
  if (brandText) brandText.textContent = "ทั้งหมด";

  const groupText = newRow.querySelector(".group-display span");
  if (groupText) groupText.textContent = "ทั้งหมด";

  // ===== RESET SUBGROUP DISPLAY =====
const subText = newRow.querySelector(".subgroup-display span");
if (subText) subText.textContent = "ทั้งหมด";

  // =========================
  // reset dropdown content
  // =========================
  const catDD = newRow.querySelector(".category-dropdown");
  if (catDD) {
    catDD.innerHTML = "";
    catDD.classList.add("hidden");
  }

  const brandDD = newRow.querySelector(".brand-dropdown");
  if (brandDD) {
    brandDD.innerHTML = "";
    brandDD.classList.add("hidden");
  }

  const groupDD = newRow.querySelector(".group-dropdown");
  if (groupDD) {
    groupDD.innerHTML = "";
    groupDD.classList.add("hidden");
  }

// ===== RESET SUBGROUP =====
const subSel = newRow.querySelector(".subgroup-select");
if (subSel) {
  subSel.value = "";
  subSel.innerHTML = `<option value="">ทั้งหมด</option>`;
}

// ===== RESET SUBGROUP DROPDOWN =====
const subDD = newRow.querySelector(".subgroup-dropdown");
if (subDD) {
  subDD.innerHTML = "";
  subDD.classList.add("hidden");
}

// ===== RESET DATA =====
newRow.dataset.subGroup = "";

  const skuIn = newRow.querySelector(".sku-input");
if (skuIn) {
  skuIn.value = "";
  attachSkuAutocomplete(skuIn);   // 👈 ใส่ตรงนี้
}

  // =========================
  // append at top ( newest first )
  // =========================
  container.prepend(newRow);
}


function removeProductRow(btn) {
  const rows = getAllRows();
  if (rows.length <= 1) {
    alert("ต้องมีอย่างน้อย 1 รายการ");
    return;
  }
  btn.closest(".product-row")?.remove();
}

// ===================================================
// DROPDOWN: CATEGORY / BRAND / GROUP
// ===================================================
function toggleCategoryDropdown(el) {
  const row = el.closest(".product-row");
  if (!row) return;

  closeAllRowDropdowns();

  if (!row.dataset.rowSeq) row.dataset.rowSeq = String(PRODUCT_ROW_SEQ++);
  const seq = row.dataset.rowSeq;

  const dropdown = row.querySelector(".category-dropdown");

  dropdown.innerHTML = `
    ${renderRadio("cat", seq, "Glass", CATEGORY_LABEL.Glass, row.dataset.category === "Glass")}
    ${renderRadio("cat", seq, "Aluminum", CATEGORY_LABEL.Aluminum, row.dataset.category === "Aluminum")}
    ${renderRadio("cat", seq, "Gypsum", CATEGORY_LABEL.Gypsum, row.dataset.category === "Gypsum")}
    ${renderRadio("cat", seq, "Accessories", CATEGORY_LABEL.Accessories, row.dataset.category === "Accessories")}
    ${renderRadio("cat", seq, "C-Line", CATEGORY_LABEL["C-Line"], row.dataset.category === "C-Line")}
    ${renderRadio("cat", seq, "Sealant", CATEGORY_LABEL.Sealant, row.dataset.category === "Sealant")}
  `;

  dropdown.querySelectorAll("input").forEach((r) =>
    r.addEventListener("change", () => onCategoryChange(r))
  );

  dropdown.classList.toggle("hidden");
}

function toggleBrandDropdown(el) {
  const row = el.closest(".product-row");
  if (!row?.dataset.category) return;
  closeAllRowDropdowns();
  loadBrandsForRow(row);
  row.querySelector(".brand-dropdown").classList.toggle("hidden");
}

function toggleGroupDropdown(el) {
  const row = el.closest(".product-row");
  if (!row?.dataset.category) return;
  closeAllRowDropdowns();
  loadGroupsForRow(row);
  row.querySelector(".group-dropdown").classList.toggle("hidden");
}

function toggleSubGroupDropdown(el) {
  const row = el.closest(".product-row");
  if (!row?.dataset.category) return;

  closeAllRowDropdowns();
  loadSubGroupsForRow(row);
  row.querySelector(".subgroup-dropdown").classList.toggle("hidden");
}

// ===================================================
// RENDER / ESCAPE
// ===================================================
function renderRadio(prefix, seq, value, label, checked) {
  return `
    <label class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100">
      <input type="radio" name="${prefix}_${seq}" value="${value}" ${checked ? "checked" : ""}>
      ${label}
    </label>
  `;
}

// ===================================================
// CHANGE HANDLER
// ===================================================
function onCategoryChange(radio) {
  const row = radio.closest(".product-row");
  const cat = radio.value;

  row.dataset.category = cat;
  row.dataset.brand = "";
  row.dataset.group = "";

  row.querySelector(".category-display span").textContent = CATEGORY_LABEL[cat];
  row.querySelector(".brand-display span").textContent = "ทั้งหมด";
  row.querySelector(".group-display span").textContent = "ทั้งหมด";

  loadBrandsForRow(row);
  loadGroupsForRow(row);
  loadSubGroupsForRow(row);

  row.querySelector(".category-dropdown").classList.add("hidden");
}

// ===================================================
// LOAD BRAND / GROUP FROM API
// ===================================================
async function loadBrandsForRow(row) {
  const dd = row.querySelector(".brand-dropdown");
  dd.innerHTML = `
    <div class="flex items-center justify-center gap-2 py-4">
      <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-gray-500 text-sm">กำลังโหลด...</span>
    </div>
  `;

  const res = await fetch(`${window.API_BASE}/api/suppliers/brands?categories=${row.dataset.category}`);
  //await fetch(`${API_BASE}/api/suppliers/brands?categories=${row.dataset.category}`);
  const brands = await res.json();

  const seq = row.dataset.rowSeq;
  dd.innerHTML = brands.map(b => `
    <label class="flex gap-2 px-3 py-2 text-sm hover:bg-gray-100">
      <input type="radio" name="brand_${seq}" value="${b.BRAND_ID}">
      ${b.BRAND_NAME}
    </label>
  `).join("");

  dd.querySelectorAll("input").forEach(r =>
    r.addEventListener("change", () => {
      row.dataset.brand = r.value;
      row.querySelector(".brand-display span").textContent = r.parentElement.textContent.trim();
      dd.classList.add("hidden");
    })
  );
}

async function loadGroupsForRow(row) {
  const dd = row.querySelector(".group-dropdown");
  dd.innerHTML = `
    <div class="flex items-center justify-center gap-2 py-4">
      <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-gray-500 text-sm">กำลังโหลด...</span>
    </div>
  `;

  const res = await fetch(`${window.API_BASE}/api/suppliers/groups?categories=${row.dataset.category}`);
  //await fetch(`${API_BASE}/api/suppliers/groups?categories=${row.dataset.category}`);
  const groups = await res.json();

  const seq = row.dataset.rowSeq;
  dd.innerHTML = groups.map(g => `
    <label class="flex gap-2 px-3 py-2 text-sm hover:bg-gray-100">
      <input type="radio" name="group_${seq}" value="${g.Group_ID}">
      ${g.GroupName}
    </label>
  `).join("");

  dd.querySelectorAll("input").forEach(r =>
    r.addEventListener("change", () => {
      row.dataset.group = r.value;
      row.querySelector(".group-display span").textContent = r.parentElement.textContent.trim();
      dd.classList.add("hidden");
    })
  );
}


// ===================================================
// LOAD / SAVE COVERAGE
// ===================================================
async function loadProductCoverage(supplierNo) {
  const container = getCoverageContainer();
  if (!container) return;
  
  // Show loading indicator
  showLoadingIndicator("productCoverageContainer", "กำลังโหลดข้อมูลสินค้าที่บริษัทดูแล...");
  
  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/product-coverage`
  );

  const data = await res.json();
  
  // Clear loading indicator
  hideLoadingIndicator("productCoverageContainer");

  const firstRow = container.querySelector(".product-row");
  container.innerHTML = "";
  container.appendChild(firstRow);

  // ============================
  // ✅ CASE 1: backend ส่งมาเป็น ARRAY (แบบใหม่)
  // ============================
  if (Array.isArray(data)) {
    if (data.length === 0) {
      resetRow(firstRow);
      return;
    }

    data.forEach((item, i) => {
      if (i > 0) addProductRow();

      const row = getAllRows()[i];
      applyCoverageToRow(row, item);
    });

    return;
  }

  // ============================
  // ✅ CASE 2: backend ส่งมาเป็น OBJECT (legacy)
  // ============================
  resetRow(firstRow);

  const row = getAllRows()[0];

  const cat = Array.isArray(data.categories) ? data.categories[0] : data.category;
  const brand = Array.isArray(data.brands) ? data.brands[0] : data.brand;
  const group = Array.isArray(data.groups) ? data.groups[0] : data.group;
  const sku = Array.isArray(data.skus) ? data.skus.join(", ") : data.sku;

  if (cat) {
    row.dataset.category = cat;
    row.querySelector(".category-display span").textContent =
      CATEGORY_LABEL[cat] || cat;

    await loadBrandsForRow(row);
    await loadGroupsForRow(row);

    if (brand) {
      row.dataset.brand = brand;
      setDisplayTextFromDropdown(
        row,
        ".brand-dropdown",
        ".brand-display span",
        brand,
        "ทั้งหมด"
      );
    }

    if (group) {
      row.dataset.group = group;
      setDisplayTextFromDropdown(
        row,
        ".group-dropdown",
        ".group-display span",
        group,
        "ทั้งหมด"
      );
    }
  }

  const skuInput = row.querySelector(".sku-input");
if (skuInput) {
  skuInput.value = sku || "";
  attachSkuAutocomplete(skuInput);   // 👈 ต้องใส่เพิ่ม
}
}


// async function saveProductCoverage() {
//   const supplierNo = getSupplierNoFromURL();

//   const payload = {
//     supplierNo,
//     items: collectProductCoverage()
//   };

//   const res = await fetch(
//     `${API_BASE}/api/suppliers/${supplierNo}/product-coverage/history`,
//     {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload)
//     }
//   );

//   if (!res.ok) {
//     alert("บันทึกไม่สำเร็จ");
//     return;
//   }

//   // ✅ reload history ด้านล่าง
//   loadProductHistory(supplierNo);
// }



// ===================================================
// COLLECT DATA
// ===================================================
function collectProductCoverage() {
  return getAllRows().map(row => ({
    category: row.dataset.category || null,
    category_name:
      row.querySelector(".category-display span")?.textContent || null,

    brand: row.dataset.brand || null,
    brand_name:
      row.querySelector(".brand-display span")?.textContent || null,

    group: row.dataset.group || null,
    group_name:
      row.querySelector(".group-display span")?.textContent || null,

    subGroup: row.dataset.subGroup || null,
SUBGROUP_NAME:
  row.querySelector(".subgroup-display span")?.textContent || null,
    sku: row.querySelector(".sku-input")?.value || null
  }));
}


// expose
window.collectProductCoverage = collectProductCoverage;


async function saveProductCoverageOnly() {
  const supplierNo = new URLSearchParams(location.search).get("id");

  const payload = {
    items: collectProductCoverage(),
  };

  console.log("💾 SAVE PRODUCT COVERAGE HISTORY", payload);

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/product-coverage/history`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    alert("บันทึกไม่สำเร็จ");
    return;
  }

  showSaveMessage("บันทึกสินค้าที่บริษัทดูแลเรียบร้อยแล้ว");

  sessionStorage.setItem("activeTab", "pills-basic");
  location.reload();
}


async function applyCoverageToRow(row, item) {
  if (!row || !item) return;

  // reset ก่อน
  resetRow(row);

  // =========================
  // CATEGORY
  // =========================
  if (item.category) {
    row.dataset.category = item.category;
    row.querySelector(".category-display span").textContent =
      CATEGORY_LABEL[item.category] || item.category;

    // โหลด brand / group ก่อน
    await loadBrandsForRow(row);
    await loadGroupsForRow(row);
    await loadSubGroupsForRow(row);
  }

  // =========================
  // BRAND
  // =========================
  if (item.brand) {
    row.dataset.brand = item.brand;
    setDisplayTextFromDropdown(
      row,
      ".brand-dropdown",
      ".brand-display span",
      item.brand,
      "ทั้งหมด"
    );
  }

  // =========================
  // GROUP
  // =========================
  if (item.group) {
    row.dataset.group = item.group;
    setDisplayTextFromDropdown(
      row,
      ".group-dropdown",
      ".group-display span",
      item.group,
      "ทั้งหมด"
    );
  }

  
  // =========================
// SUB GROUP
// =========================
if (item.subGroup) {
  row.dataset.subGroup = item.subGroup;

  await loadSubGroupsForRow(row);

  const dd = row.querySelector(".subgroup-dropdown");
  const input = dd.querySelector(`input[value="${item.subGroup}"]`);

  if (input) {
    row.querySelector(".subgroup-display span").textContent =
      input.parentElement.textContent.trim();
  } else if (item.subGroup_name) {
    // ⭐ fallback
    row.querySelector(".subgroup-display span").textContent =
      item.subGroup_name;
  }
}
  // =========================
  // SKU
  // =========================
  if (item.sku) {
    const sku = row.querySelector(".sku-input");
    if (sku) sku.value = item.sku;
  }
}

async function loadLatestCoverageFromHistory(supplierNo) {
  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/product-coverage/history?limit=1`
  );

  if (!res.ok) return;

  const history = await res.json();
  if (!history.length) return;

  const latest = history[0];
  const items = Array.isArray(latest.items) ? latest.items : [];

  if (!items.length) return;

  // ล้างฟอร์มเดิม
  const container = getCoverageContainer();
  const firstRow = container.querySelector(".product-row");
  container.innerHTML = "";
  container.appendChild(firstRow);

  // ใส่ข้อมูลจาก snapshot
  items.forEach((item, idx) => {
    if (idx > 0) addProductRow();
    const row = getAllRows()[idx];
    applyCoverageToRow(row, item);
  });
}

async function loadProductCoverageFromHistoryById(historyId) {
  const supplierNo = new URLSearchParams(window.location.search).get("id");
  if (!supplierNo) return;

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/product-coverage/history/${historyId}`
  );

  if (!res.ok) return;

  const history = await res.json();
  const items = Array.isArray(history.items) ? history.items : [];

  if (!items.length) return;

  // ล้างฟอร์มเดิม
  const container = getCoverageContainer();
  const firstRow = container.querySelector(".product-row");
  container.innerHTML = "";
  container.appendChild(firstRow);

  // ใส่ข้อมูลจาก snapshot
  items.forEach((item, idx) => {
    if (idx > 0) addProductRow();
    const row = getAllRows()[idx];
    applyCoverageToRow(row, item);
  });
}

window.loadProductCoverageFromHistoryById = loadProductCoverageFromHistoryById;

async function loadSubGroupsForRow(row) {
  const dd = row.querySelector(".subgroup-dropdown");
  if (!dd) return;

  const category = row.dataset.category;
  if (!category) return;

  dd.innerHTML = `
    <div class="flex items-center justify-center gap-2 py-4">
      <svg class="animate-spin h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-gray-500 text-sm">กำลังโหลด...</span>
    </div>
  `;

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/subgroups?category=${encodeURIComponent(category)}`
  );

  const subs = await res.json();
  const seq = row.dataset.rowSeq;

  dd.innerHTML = subs.map(s => `
    <label class="flex gap-2 px-3 py-2 text-sm hover:bg-gray-100">
      <input type="radio" name="sub_${seq}" value="${s.SUBGROUP_ID}">
      ${s.SUBGROUP_NAME}
    </label>
  `).join("");

  dd.querySelectorAll("input").forEach(r =>
    r.addEventListener("change", () => {
      row.dataset.subGroup = r.value;
      row.querySelector(".subgroup-display span").textContent =
        r.parentElement.textContent.trim();
      dd.classList.add("hidden");
    })
  );
}


function attachSkuAutocomplete(input) {
  let dropdown;

  input.addEventListener("input", async () => {
    const keyword = input.value.split(",").pop().trim();

    if (keyword.length < 2) return;

    const res = await fetch(
      `${window.API_BASE}/api/suppliers/sku/search?q=${encodeURIComponent(keyword)}`
    );

    const items = await res.json();

    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.className =
  "absolute left-0 top-full mt-1 bg-white border rounded-md w-full shadow-lg z-50 max-h-60 overflow-y-auto";
      input.parentElement.appendChild(dropdown);
    }

    dropdown.innerHTML = items.map(i => `
      <div class="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
           data-sku="${i.Item_No}">
        <strong>${i.Item_No}</strong> - ${i.Description}
      </div>
    `).join("");

    dropdown.querySelectorAll("div").forEach(el => {
      el.addEventListener("click", () => {
        const selected = el.dataset.sku;

        const parts = input.value.split(",");
        parts.pop();
        parts.push(" " + selected);

        input.value = parts.join(",").replace(/^,/, "").trim() + ", ";

        dropdown.remove();
        dropdown = null;
      });
    });
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const firstSkuInput = document.querySelector(".sku-input");
  if (firstSkuInput) {
    attachSkuAutocomplete(firstSkuInput);
  }
});

/* ===============================
   🔥 LOADING INDICATOR HELPER
================================ */
function showLoadingIndicator(containerId, message = "กำลังโหลด...") {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Store original content
  if (!container.dataset.originalContent) {
    container.dataset.originalContent = container.innerHTML;
  }
  
  container.innerHTML = `
    <div class="flex items-center justify-center gap-2 py-4">
      <svg class="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="text-gray-500">${message}</span>
    </div>
  `;
}

function hideLoadingIndicator(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Restore original content if stored
  if (container.dataset.originalContent) {
    delete container.dataset.originalContent;
  }
}