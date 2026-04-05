import { loadCoverageToForm } from "./coverage-helper.js";
import { loadColors, loadThickness } from "./master-helper.js";
import { loadGroups, loadSubGroups } from "./coverage-helper.js";

console.log("supplier-moq.js loaded");

let moqData = [];
let currentCancelMoqId = null;
let currentFilter = "ACTIVE"; // ค่าเริ่มต้น

function setMoqFilter(status) {
  console.log("🔥 filter:", status);

  currentFilter = status;

  renderMoqTable(); // 👈 สำคัญมาก ต้องเรียก render ใหม่
}

function loadBrands(category, selectId) {

  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;

  const data = window.COVERAGE_DATA || [];

  const seen = new Set();

  data
    .filter(x => !category || x.category === category)
    .forEach(d => {

      if (!d.brand || !d.brand_name) return;
      if (seen.has(d.brand)) return;

      seen.add(d.brand);

      const opt = document.createElement("option");
      opt.value = d.brand;
      opt.textContent = d.brand_name;

      select.appendChild(opt);
    });
}

function renderMoqRegionDropdown() {

  const el = document.getElementById("moqRegionDropdown");

  if (!window.branchData) {
    console.warn("❌ branchData ยังไม่มา");
    return;
  }

  const regions = [...new Set(window.branchData.map(b => b.region))];

  el.innerHTML = `
    <label class="flex items-center gap-2 font-semibold border-b mb-1 pb-1">
      <input type="checkbox" class="moq-select-all" data-target="moqRegionDropdown">
      เลือกทั้งหมด
    </label>
  ` + regions.map(r => `
    <label class="flex items-center gap-2">
      <input type="checkbox" value="${r}" class="moq-item-checkbox" onchange="onMoqRegionChange()">
      ${r}
    </label>
  `).join("");

  // Add select-all event listener
  el.querySelector('.moq-select-all')?.addEventListener('change', function() {
    const checkboxes = el.querySelectorAll('.moq-item-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
    onMoqRegionChange();
  });

  console.log("✅ MOQ region loaded:", regions);
}

function renderMoqBranchDropdown() {

  const el = document.getElementById("moqBranchDropdown");

  const selectedRegions = getCheckedValues("moqRegionDropdown");

  const filtered = (window.branchData || []).filter(b =>
  selectedRegions.length === 0 ||
  selectedRegions.includes((b.region || "").trim())
);

  console.log("selectedRegions:", selectedRegions);
  console.log("branchData:", window.branchData);

  el.innerHTML = `
    <label class="flex items-center gap-2 font-semibold border-b mb-1 pb-1">
      <input type="checkbox" class="moq-select-all" data-target="moqBranchDropdown">
      เลือกทั้งหมด
    </label>
  ` + filtered.map(b => `
    <label class="flex items-center gap-2">
      <input type="checkbox" value="${b.branchCode}" class="moq-item-checkbox" onchange="handleMoqBranchChange()">
      ${b.branchCode} - ${b.branchName}
    </label>
  `).join("");

  // Add select-all event listener
  el.querySelector('.moq-select-all')?.addEventListener('change', function() {
    const checkboxes = el.querySelectorAll('.moq-item-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
    handleMoqBranchChange();
  });
}

function getCheckedValues(dropdownId) {
  return Array.from(
    document.querySelectorAll(`#${dropdownId} input:checked`)
  ).map(el => el.value).filter(v => v);
}

function onMoqRegionChange() {
  renderMoqBranchDropdown();
  updateText("moqRegionDropdown", "moqRegionText");
  
  // Update select-all checkbox state
  const selectAll = document.querySelector('#moqRegionDropdown .moq-select-all');
  const items = document.querySelectorAll('#moqRegionDropdown .moq-item-checkbox');
  if (selectAll && items.length > 0) {
    selectAll.checked = items.length > 0 && [...items].every(cb => cb.checked);
  }
}

function updateText(dropdownId, textId) {
  const values = getCheckedValues(dropdownId);

  const el = document.getElementById(textId);

  if (values.length === 0) {
    el.innerText = "- เลือก -";
    return;
  }

  if (values.length <= 2) {
    el.innerText = values.join(", ");
    return;
  }

  el.innerText = `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

/* ===============================
   🔥 SHARED PRODUCT FILTER
================================ */
function initProductFilter(prefix, supplierNo) {

  loadCoverageToForm(supplierNo, {
    category: `${prefix}Cat`,
    brand: `${prefix}Brand`,
    group: `${prefix}Group`,
    sub: `${prefix}Sub`,
    color: `${prefix}Color`,
    thickness: `${prefix}Thick`,
    sku: `${prefix}Sku`
  });

  const catEl = document.getElementById(`${prefix}Cat`);
  const brandEl = document.getElementById(`${prefix}Brand`);
  const groupEl = document.getElementById(`${prefix}Group`);

// 🔥 1. category → brand
catEl?.addEventListener("change", () => {
  loadBrands(catEl.value, `${prefix}Brand`);

  groupEl.innerHTML = `<option value="">- เลือก -</option>`;
  document.getElementById(`${prefix}Sub`).innerHTML = `<option value="">- เลือก -</option>`;
});

// 🔥 2. brand → group
brandEl?.addEventListener("change", () => {
  loadGroups(catEl.value, brandEl.value, `${prefix}Group`);

  document.getElementById(`${prefix}Sub`).innerHTML = `<option value="">- เลือก -</option>`;
});

// 🔥 3. group → sub
groupEl?.addEventListener("change", () => {
  loadSubGroups(catEl.value, brandEl.value, groupEl.value, `${prefix}Sub`);
});

  // 🔥 ของเดิม (ถูกแล้ว)
  catEl?.addEventListener("change", (e) => {
    loadColors(e.target.value, `${prefix}Color`);
    loadThickness(e.target.value, `${prefix}Thick`);
  });
}


function handleMoqBranchChange() {
  updateText("moqBranchDropdown", "moqBranchText");
  
  const selectAll = document.querySelector('#moqBranchDropdown .moq-select-all');
  const items = document.querySelectorAll('#moqBranchDropdown .moq-item-checkbox');
  if (selectAll && items.length > 0) {
    selectAll.checked = items.length > 0 && [...items].every(cb => cb.checked);
  }
}

window.handleMoqBranchChange = handleMoqBranchChange;

/* ===============================
   🔥 MULTI SELECT HELPER
================================ */
function getMulti(id) {
  const el = document.getElementById(id);
  if (!el) return "";
  return Array.from(el.selectedOptions).map(o => o.value).join(",");
}

/* ===============================
   INIT
================================ */
document.addEventListener("DOMContentLoaded", async () => {
  const supplierNo = new URLSearchParams(window.location.search).get("id");

  if (!supplierNo) return;

  console.log("🔥 MOQ supplierNo =", supplierNo);

  // 🔥 ใช้ shared logic
  initProductFilter("moq", supplierNo);

  setTimeout(() => {
  document.getElementById("moqCat")?.dispatchEvent(new Event("change"));
}, 100);


  loadMoqList(supplierNo);
await loadBranchData();

renderMoqRegionDropdown();
renderMoqBranchDropdown();

  const btn = document.getElementById("submitMoqBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {

    const moqNameInput = document.getElementById("moqName");
const moqNameError = document.getElementById("moqNameError");

const moqName = moqNameInput.value.trim();

if (!moqName) {
  moqNameInput.classList.add("border-red-500");
  moqNameError.classList.remove("hidden");
  moqNameInput.focus();
  return;
} else {
  moqNameInput.classList.remove("border-red-500");
  moqNameError.classList.add("hidden");
}

    const payload = {
      moq_name: moqName,

      // 🔥 FIX multi-select
      region: getCheckedValues("moqRegionDropdown").join(","),
branch: getCheckedValues("moqBranchDropdown").join(","),

      category: document.getElementById("moqCat")?.value,

      // 🔥 FIX normalize
      brand: document.getElementById("moqBrand")?.selectedOptions[0]?.text,
      brand_code: document.getElementById("moqBrand")?.value,

      product_group: document.getElementById("moqGroup")?.selectedOptions[0]?.text,
      product_group_code: document.getElementById("moqGroup")?.value,

      sub_group: document.getElementById("moqSub")?.selectedOptions[0]?.text,
      sub_group_code: document.getElementById("moqSub")?.value,

      color: document.getElementById("moqColor")?.value,
      mold: document.getElementById("moqMold")?.value,
      thickness: document.getElementById("moqThick")?.value,

      sku: document.getElementById("moqSku")?.value,

      moq_type: document.getElementById("moqType")?.value,
      vehicle_type: document.getElementById("moqVehicle")?.value,
      measure_type: document.getElementById("moqMeasure")?.value,

      moq_qty: Number(document.getElementById("moqQty")?.value || 0),
      moq_unit: document.getElementById("moqUnit")?.value,
    };

    try {
      const res = await fetch(
        `${API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/moq`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error(await res.text());

      showSaveMessage("บันทึก MOQ สำเร็จ");

      setTimeout(() => window.location.reload(), 800);

    } catch (err) {
      console.error("❌ MOQ save error", err);
      showSaveMessage("บันทึก MOQ ไม่สำเร็จ", true);
    }
  });

  setupModalEvents();
});

/* ===============================
   MODAL
================================ */
function setupModalEvents() {
  const modal = document.getElementById("cancelMoqModal");
  const btnNo = document.getElementById("cancelMoqNoBtn");
  const btnYes = document.getElementById("cancelMoqYesBtn");

  btnNo?.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    currentCancelMoqId = null;
  });

  btnYes?.addEventListener("click", async () => {
    const supplierNo = new URLSearchParams(window.location.search).get("id");

    try {
      const res = await fetch(
        `${API_BASE}/api/suppliers/${supplierNo}/moq/${currentCancelMoqId}/toggle`,
        { method: "PUT" }
      );

      if (!res.ok) throw new Error(await res.text());

      showSaveMessage("เปลี่ยนสถานะ MOQ สำเร็จ");

      modal.classList.add("hidden");
      modal.classList.remove("flex");

      loadMoqList(supplierNo);

    } catch (err) {
      console.error(err);
      showSaveMessage("ไม่สามารถยกเลิกได้", true);
    }
  });
}

/* ===============================
   LOAD
================================ */
async function loadMoqList(supplierNo) {
  // Show loading indicator
  showLoadingIndicator("moqTableBody", "กำลังโหลดข้อมูล MOQ...");
  
  try {
    const res = await fetch(
      `${API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/moq`
    );

    if (!res.ok) throw new Error(await res.text());

    moqData = await res.json();

    renderMoqTable();

  } catch (err) {
    console.error("❌ Load MOQ error", err);
    // Hide loading indicator on error
    hideLoadingIndicator("moqTableBody");
  }
}

/* ===============================
   TABLE
================================ */
function renderMoqTable() {
  const tbody = document.getElementById("moqTableBody");
  const countEl = document.getElementById("moqRecordCount");

  // 🔥 กันพัง
  if (!tbody) {
    console.warn("❌ moqTableBody not found");
    return;
  }
  
  // Clear loading indicator
  hideLoadingIndicator("moqTableBody");

  if (!Array.isArray(moqData)) {
    console.warn("❌ moqData not ready");
    return;
  }

  let rows = [...moqData];

  // 🔥 อ่านค่า filter (radio)
  const filterValue =
    document.querySelector("input[name='moqFilter']:checked")?.value;

  // 🔥 filter status
  if (filterValue === "active") {
    rows = rows.filter(r => r.status === "OPEN");
  } else if (filterValue === "cancelled") {
    rows = rows.filter(r => r.status === "CANCELLED");
  }

  console.log("📊 render rows:", rows);

  // 🔥 clear table
  tbody.innerHTML = "";

  // 🔥 render rows
  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${idx + 1}</td>

      <td>
        <span 
          class="badge ${r.status === "OPEN" ? "bg-success" : "bg-danger"}"
          style="cursor:pointer"
          onclick="toggleMoqStatus(${r.moq_id}, '${r.status}')"
        >
          ${r.status}
        </span>
      </td>

      <td>${r.moq_name || "-"}</td>

      <td class="small">
        ${r.region || "-"} / ${r.branch || "-"}<br>
        ${r.category || "-"} / ${r.brand || "-"} / ${r.product_group || "-"}
      </td>

      <td><b>${r.moq_qty ?? "-"} ${r.moq_unit ?? ""}</b></td>

      <td>${formatThaiDateTime(r.updated_at || r.created_at)}</td>
    `;

    tbody.appendChild(tr);
  });

  // 🔥 update count
  if (countEl) {
    countEl.textContent = `${rows.length} รายการ`;
  }
}

/* ===============================
   EDIT
================================ */
function editMoq(row) {

  document.getElementById("moqName").value = row.moq_name || "";

  // 🔥 FIX ใช้ code
  document.getElementById("moqCat").value = row.category || "";
  document.getElementById("moqBrand").value = row.brand_code || "";
  document.getElementById("moqGroup").value = row.product_group_code || "";
  document.getElementById("moqSub").value = row.sub_group_code || "";

  document.getElementById("moqColor").value = row.color || "";
  document.getElementById("moqThick").value = row.thickness || "";
  document.getElementById("moqSku").value = row.sku || "";

  document.getElementById("moqQty").value = row.moq_qty || 0;
  document.getElementById("moqUnit").value = row.moq_unit || "";
}

/* ===============================
   STATUS
================================ */
function toggleMoqStatus(moqId, status) {
  currentCancelMoqId = moqId;

  const isCancel = status === "OPEN";

  // 🔥 ข้อความใหม่
  const title = isCancel
    ? "ยืนยันการยกเลิก"
    : "ยืนยันการเปิดใช้งาน";

  const message = isCancel
    ? "คุณกำลังจะยกเลิก MOQ นี้\nต้องการดำเนินการต่อหรือไม่?"
    : "คุณต้องการเปิด MOQ นี้อีกครั้ง\nต้องการดำเนินการต่อหรือไม่?";

  const confirmText = isCancel ? "ยืนยัน" : "เปิดใช้งาน";

  // 👉 set ลง modal
  document.getElementById("cancelMoqTitle").innerText = title;

  document.getElementById("cancelMoqMessage").innerHTML =
    message.replace(/\n/g, "<br>");

  document.getElementById("cancelMoqYesBtn").innerText = confirmText;

  // 👉 เปลี่ยนสีปุ่ม
  const btn = document.getElementById("cancelMoqYesBtn");
  btn.classList.remove("bg-red-600", "bg-green-600");
  btn.classList.add(isCancel ? "bg-red-600" : "bg-green-600");

  // 👉 status ถัดไป
  window.nextStatus = isCancel ? "CANCELLED" : "OPEN";

  // 👉 เปิด modal
  const modal = document.getElementById("cancelMoqModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function formatThaiDateTime(dateStr) {
  if (!dateStr) return "-";

  const clean = dateStr.replace("T", " ").substring(0, 19);

  const [datePart, timePart] = clean.split(" ");
  if (!datePart || !timePart) return "-";

  let [year, month, day] = datePart.split("-");
  const [hour, minute, second] = timePart.split(":");

  // 🔥 logic เดียวกับ Target
  if (parseInt(year) > 2400) {
    year = parseInt(year);
  } else {
    year = parseInt(year) + 543;
  }

  return `
    <div class="leading-tight">
      <div class="font-medium">
        ${day}/${month}/${year}
      </div>
      <div class="text-xs text-gray-400">
        ${hour}:${minute}:${second}
      </div>
    </div>
  `;
}

async function loadBranchData() {
  try {
    const res = await fetch(`${API_BASE}/api/master/branches`);
    const data = await res.json();

    console.log("🔥 branch loaded:", data);

    window.branchData = data;

  } catch (err) {
    console.error("❌ load branch error", err);
  }
}

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
    <tr>
      <td colspan="100%" class="text-center py-4">
        <div class="flex items-center justify-center gap-2">
          <svg class="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-gray-500">${message}</span>
        </div>
      </td>
    </tr>
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



window.onMoqRegionChange = onMoqRegionChange;
window.toggleMoqStatus = toggleMoqStatus;
window.setMoqFilter = setMoqFilter;
window.renderMoqTable = renderMoqTable;