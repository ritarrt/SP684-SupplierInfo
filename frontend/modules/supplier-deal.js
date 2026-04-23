console.log("supplier-deal.js loaded");

let dealData = [];

function showDealFormLoading(show) {
  const form = document.getElementById("dealForm");
  if (!form) return;
  
  let loader = document.getElementById("dealFormLoading");
  
  if (show) {
    if (!loader) {
      loader = document.createElement("div");
      loader.id = "dealFormLoading";
      loader.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255,255,255,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        border-radius: 0.5rem;
      `;
      loader.innerHTML = '<div class="text-center"><div class="spinner-border text-primary mb-2"></div><div>กำลังโหลด...</div></div>';
      form.style.position = "relative";
      form.appendChild(loader);
    }
    loader.style.display = "flex";
  } else {
    if (loader) loader.style.display = "none";
  }
}

function getCategoryName(code) {
  if (!window.CATEGORY_DATA) return code;
  const cat = window.CATEGORY_DATA.find(c => c.category === code);
  return cat ? cat.category_name : code;
}

function getBrandName(code) {
  if (!window.BRAND_DATA) return code;
  const brand = window.BRAND_DATA.find(b => b.brand_no === code);
  return brand ? brand.brand_name : code;
}

function getGroupName(code) {
  if (!window.GROUP_DATA) return code;
  const group = window.GROUP_DATA.find(g => g.group_code === code);
  return group ? group.group_name : code;
}

function getSubGroupName(code) {
  if (!window.SUBGROUP_DATA) return code;
  const subgroup = window.SUBGROUP_DATA.find(s => s.subgroup_code === code);
  return subgroup ? subgroup.subgroup_name : code;
}

function getBranchName(code) {
  if (!window.BRANCHES_DATA) return code;
  const branch = window.BRANCHES_DATA.find(b => b.branchCode === code);
  return branch ? branch.branchName : code;
}

function getSelectedValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  return [...container.querySelectorAll("input:checked")].map(i => i.value).filter(v => v && v !== "on");
}

function renderCheckboxList(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <label class="flex items-center gap-2 p-1 cursor-pointer hover:bg-gray-100 rounded">
      <input type="checkbox" class="select-all-checkbox" onchange="toggleAll${containerId}(this)">
      <span class="text-sm font-medium">เลือกทั้งหมด</span>
    </label>
  `;

  data.forEach(item => {
    const label = document.createElement("label");
    label.className = "flex items-center gap-2 p-1 cursor-pointer hover:bg-gray-100 rounded";
    label.innerHTML = `
      <input type="checkbox" value="${item.value}" class="item-checkbox">
      <span class="text-sm">${item.label}</span>
    `;
    container.appendChild(label);
  });

  container.querySelector('.select-all-checkbox')?.addEventListener('change', function() {
    const checkboxes = container.querySelectorAll('.item-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
    updateSelectedText(containerId, containerId.replace("Dropdown", "Text"));
  });

  container.querySelectorAll('.item-checkbox').forEach(cb => {
    cb.addEventListener('change', () => updateSelectedText(containerId, containerId.replace("Dropdown", "Text")));
  });
}

function updateSelectedText(containerId, textId) {
  const container = document.getElementById(containerId);
  const textEl = document.getElementById(textId);
  if (!container || !textEl) return;
  
  const checked = container.querySelectorAll("input:checked:not(.select-all-checkbox)");
  if (checked.length === 0) {
    textEl.textContent = "ทั้งหมด";
  } else if (checked.length <= 3) {
    textEl.textContent = [...checked].map(c => c.nextElementSibling.textContent).join(", ");
  } else {
    textEl.textContent = `เลือก ${checked.length} รายการ`;
  }
}

async function loadBranchMaster() {
  try {
    const res = await fetch(`${window.API_BASE}/api/master/branches`);
    if (res.ok) {
      window.BRANCHES_DATA = await res.json();
    }
  } catch (err) {
    console.error("Load branches error:", err);
  }
}

function showLoadingIndicator(containerId, message = "กำลังโหลด...") {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <tr>
      <td colspan="100%" class="text-center py-4">
        <div class="spinner-border text-primary" role="status"></div>
        <div class="mt-2">${message}</div>
      </td>
    </tr>
  `;
}

function hideLoadingIndicator(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const loader = container.querySelector('.spinner-border');
  if (loader) {
    const row = loader.closest('tr');
    if (row) row.remove();
  }
}

/* ===============================
   LOAD DEAL LIST
 ============================== */
async function loadDealList(supplierNo) {
  showLoadingIndicator("dealTableBody", "กำลังโหลดข้อมูลดีล...");

  try {
    // Use new simple deals API
    const res = await fetch(
      `${window.API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/deals-simple`
    );

    if (!res.ok) throw new Error(await res.text());

    let data = await res.json();
    
    // Filter by selected branch
    const branchFilter = document.getElementById("dealBranchSelect")?.value;
    if (branchFilter) {
      data = data.filter(d => d.branch === branchFilter);
    }
    
    // Filter by selected category - need to get category from SKU
    const categoryFilter = document.getElementById("dealCategorySelect")?.value;
    if (categoryFilter && window.cachedSkuData.length > 0) {
      // Create SKU to category map
      const skuToCategory = {};
      window.cachedSkuData.forEach(s => {
        if (s.sku) skuToCategory[s.sku] = s.category;
      });
      
      data = data.filter(d => {
        const skuCategory = skuToCategory[d.sku];
        return skuCategory === categoryFilter;
      });
    }

    // Filter by selected contact person
    const contactFilter = document.getElementById("dealContactSelect")?.value;
    if (contactFilter) {
      data = data.filter(d => d.contact_person === contactFilter);
    }
    
    dealData = data;
    renderDealTable();

  } catch (err) {
    console.error("❌ Load deal error", err);
    hideLoadingIndicator("dealTableBody");
  }
}

/* ===============================
   RENDER DEAL TABLE
 ============================== */
function renderDealTable() {
  const filterValue = document.querySelector("input[name='dealFilter']:checked")?.value;

  // "ประวัติทั้งหมด" โหลดจาก endpoint ประวัติ
  if (filterValue === "history") {
    loadDealHistory();
    return;
  }

  const tbody   = document.getElementById("dealTableBody");
  const countEl = document.getElementById("dealRecordCount");
  if (!tbody) return;

  hideLoadingIndicator("dealTableBody");

  // restore header กลับเป็น deal mode
  const headRow = document.getElementById("dealTableHeadRow");
  if (headRow && !headRow.querySelector('th[class*="text-success"]') === false) {
    headRow.innerHTML = `
      <th>#</th><th>สถานะ</th><th>ผู้ให้ราคา</th><th>ชื่อดีลราคา</th>
      <th>Project No</th><th>SKU</th><th>สาขา</th><th>ราคาตั้งต้น</th>
      <th>กรอบเงื่อนไข</th><th>Tier</th><th>จาก</th><th>ถึง</th>
      <th>ราคาดีล/ส่วนลด</th><th>หน่วย</th><th>ประเภทดีล</th>
      <th>วันที่เริ่ม</th><th>วันที่สิ้นสุด</th>
      <th>ลงลัง</th><th>Supplier ส่ง</th><th>หมายเหตุ</th><th>แก้ไขล่าสุด</th>
    `;
  }

  // แสดงทุก status ไม่ filter
  let rows = [...dealData];

  // Sort by SKU then branch
  rows.sort((a, b) => {
    const skuA = (a.sku || "").toLowerCase();
    const skuB = (b.sku || "").toLowerCase();
    if (skuA !== skuB) return skuA < skuB ? -1 : 1;
    return (a.branch || "").toLowerCase() < (b.branch || "").toLowerCase() ? -1 : 1;
  });

  tbody.innerHTML = "";
  let rowNum = 0;

  rows.forEach((r) => {
    const isExpired = r.end_date && new Date() > new Date(r.end_date);
    const statusStyle = r.status === "OPEN"
      ? isExpired ? "background:#0d6efd;color:#fff;" : "background:#198754;color:#fff;"
      : r.status === "USE"
        ? isExpired ? "background:#0d6efd;color:#fff;" : "background:#ffc107;color:#000;"
        : r.status === "CLOSED"
          ? "background:#0d6efd;color:#fff;"
          : "background:#dc3545;color:#fff;";

    const isClosedAndExpired = r.status === "CLOSED" && isExpired;
    const conditionModeText = r.condition_mode === "stepped" ? "ขั้นบันได" : "ราคาปกติ";

    // สร้าง display rows — stepped deal ออกหลาย row ตาม steps
    const displayRows = [];
    if (r.condition_mode === "stepped" && r.steps && r.steps.length > 0) {
      r.steps.forEach(step => {
        displayRows.push({
          tier:        step.step_number ?? "-",
          from_qty:    step.from_qty    ?? "-",
          to_qty:      step.to_qty      ?? "-",
          price_value: step.price_value,
          price_unit:  step.price_unit || r.price_unit
        });
      });
    } else {
      displayRows.push({
        tier:        "-",
        from_qty:    "-",
        to_qty:      "-",
        price_value: r.price_value,
        price_unit:  r.price_unit
      });
    }

    displayRows.forEach((d, dIdx) => {
      rowNum++;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${rowNum}</td>
        <td>
          <span class="badge" style="${statusStyle}padding:4px 8px;border-radius:12px;font-size:12px;">
            ${r.status}
          </span>
          ${isClosedAndExpired ? `<br><span class="text-muted small">ปิดแล้ว</span>` : ""}
        </td>
        <td>${dIdx === 0 ? (r.contact_person || "-") : ""}</td>
        <td>${dIdx === 0 ? `<div class="fw-bold">${r.deal_name || "-"}</div>` : ""}</td>
        <td>${dIdx === 0 ? (r.project_no || "-") : ""}</td>
        <td>${dIdx === 0 ? (r.sku || "-") : ""}</td>
        <td>${dIdx === 0 ? (getBranchName(r.branch) || r.branch || "-") : ""}</td>
        <td class="text-end">${dIdx === 0 ? (r.base_price ? Number(r.base_price).toLocaleString() : "-") : ""}</td>
        <td>${dIdx === 0 ? conditionModeText : ""}</td>
        <td class="text-center">${d.tier}</td>
        <td class="text-end">${d.from_qty !== "-" ? Number(d.from_qty).toLocaleString() : "-"}</td>
        <td class="text-end">${d.to_qty   !== "-" ? Number(d.to_qty).toLocaleString()   : "-"}</td>
        <td class="text-end">${d.price_value != null ? Number(d.price_value).toLocaleString() : "-"}</td>
        <td>${d.price_unit || "-"}</td>
        <td>${dIdx === 0 ? (r.deal_type === "Discount" ? "ส่วนลด" : r.deal_type === "New Price" ? "ราคาใหม่" : "-") : ""}</td>
        <td>${dIdx === 0 ? formatDisplayDate(r.start_date) : ""}</td>
        <td>${dIdx === 0 ? formatDisplayDate(r.end_date)   : ""}</td>
        <td>${dIdx === 0 ? (r.require_pallet === false ? `<span class="badge bg-warning text-dark">ไม่</span>` : `<span class="badge bg-success">ใช่</span>`) : ""}</td>
        <td>${dIdx === 0 ? (r.supplier_delivery === false ? `<span class="badge bg-secondary">ไปรับ</span>` : `<span class="badge bg-info">ส่ง</span>`) : ""}</td>
        <td>${dIdx === 0 ? (r.note || "-") : ""}</td>
        <td class="text-muted small">${dIdx === 0 ? formatThaiDateTime(r.updated_at || r.created_at) : ""}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  if (countEl) {
    countEl.textContent = `${rows.length} รายการ`;
  }
}

/* ===============================
   LOAD DEAL PROVIDER OPTIONS
 =============================== */
async function loadDealProviderOptions(supplierNo) {
  const regions = [...new Set((window.BRANCHES_DATA || []).map(b => b.region))];
  renderCheckboxList("dealRegionDropdown",
    regions.map(r => ({
      value: r,
      label: r
    }))
  );
}

// Helper function to convert dd/MM/yyyy to yyyy-MM-dd for HTML date inputs
function convertDateFormat(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// แปลง ISO date string หรือ yyyy-MM-dd → dd/MM/yyyy (ค.ศ.)
function formatDisplayDate(dateStr) {
  if (!dateStr) return "-";
  try {
    // ตัด timezone ออก แล้วอ่านแค่ส่วน date
    const datePart = String(dateStr).split("T")[0].split(" ")[0]; // "2025-01-15"
    if (!datePart || datePart.length < 10) return dateStr;
    const [y, m, d] = datePart.split("-");
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  } catch {
    return dateStr;
  }
}

function formatThaiDate(dateStr) {
  if (!dateStr) return "-";
  const part = dateStr.split(" ")[0];
  if (part.includes("/")) {
    const [d, m, y] = part.split("/");
    return `${d}/${m}/${parseInt(y) + 543}`;
  }
  return part;
}

function formatThaiDateTime(dateStr) {
  if (!dateStr) return "-";
  try {
    // รองรับทั้ง ISO string (2025-01-15T10:30:00.000Z) และ string ทั่วไป
    const s = String(dateStr).trim();
    let date;

    if (s.includes("T")) {
      // ISO format — parse ตรง แต่ใช้ local parts เพื่อหลีกเลี่ยง timezone shift
      date = new Date(s);
    } else {
      // "2025-01-15 10:30:00" หรือ "15/01/2025 10:30:00"
      date = new Date(s.replace(" ", "T"));
    }

    if (isNaN(date.getTime())) return s;

    const d  = String(date.getDate()).padStart(2, "0");
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const y  = date.getFullYear();
    const h  = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");

    return `<div class="leading-tight">
      <div class="font-medium">${d}/${mo}/${y}</div>
      <div class="text-xs text-gray-400">${h}:${mi}</div>
    </div>`;
  } catch {
    return String(dateStr);
  }
}

window.toggleDealConditionMode = function() {
  const mode = document.getElementById("dealConditionMode")?.value;
  const normalDiv = document.getElementById("dealNormalMode");
  const steppedDiv = document.getElementById("dealSteppedMode");

  normalDiv?.classList.add("hidden");
  steppedDiv?.classList.add("hidden");

  if (mode === "normal") {
    normalDiv?.classList.remove("hidden");
  } else if (mode === "stepped") {
    steppedDiv?.classList.remove("hidden");
  }
}

window.addDealStep = function() {
  const container = document.getElementById("dealStepsContainer");
  if (!container) return;

  const stepCount = container.children.length + 1;

  const stepDiv = document.createElement("div");
  stepDiv.className = "border rounded p-2 bg-white shadow-sm mb-2";
  stepDiv.innerHTML = `
    <div class="flex gap-2 items-end">
      <div class="flex-1">
        <label class="text-xs text-gray-500">จากจำนวน</label>
        <input type="number" class="deal-step-from form-control form-control-sm" placeholder="0">
      </div>
      <div class="flex-1">
        <label class="text-xs text-gray-500">ถึงจำนวน</label>
        <input type="number" class="deal-step-to form-control form-control-sm" placeholder="0">
      </div>
      <div class="flex-1">
        <label class="text-xs text-gray-500">หน่วย</label>
        <select class="deal-step-unit form-select form-select-sm">
          <option value="ชิ้น">ชิ้น</option>
          <option value="เส้น">เส้น</option>
          <option value="แผ่น">แผ่น</option>
          <option value="ตัน">ตัน</option>
        </select>
      </div>
      <div class="flex-1">
        <label class="text-xs text-gray-500">ส่วนลด</label>
        <input type="number" class="deal-step-price form-control form-control-sm" placeholder="0">
      </div>
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentElement.parentElement.remove()">
        <i class="bi bi-x"></i>
      </button>
    </div>
  `;
  container.appendChild(stepDiv);
}

function getDealSteps() {
  const container = document.getElementById("dealStepsContainer");
  if (!container) return [];

  const steps = [];
  const stepDivs = container.querySelectorAll(".border");

  stepDivs.forEach(div => {
    const fromQty = div.querySelector(".deal-step-from")?.value;
    const toQty = div.querySelector(".deal-step-to")?.value;
    const unit = div.querySelector(".deal-step-unit")?.value;
    const price = div.querySelector(".deal-step-price")?.value;

    if (fromQty && toQty && price) {
      steps.push({
        from_qty: Number(fromQty),
        to_qty: Number(toQty),
        unit: unit || "ชิ้น",
        price_value: Number(price),
        price_unit: document.getElementById("dealUnit")?.value || "บาท"
      });
    }
  });

  return steps;
}

// Initialize on load (called from HTML)
async function initDealModule() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) return;

  await loadBranchMaster();
  await populateDealBranchFilter(); // Load SKU data first
  loadDealProviderOptions(supplierNo);
  await populateDealContactFilter(supplierNo);
  loadDealList(supplierNo);
  
  // Initialize stepped pricing
  toggleDealConditionMode();
}

// Auto-initialize on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  await initDealModule();
});

// Populate branch and category filter dropdowns
window.cachedSkuData = [];
async function populateDealBranchFilter() {
  const branchSelect = document.getElementById("dealBranchSelect");
  const categorySelect = document.getElementById("dealCategorySelect");
  if (!branchSelect) return;
  
  branchSelect.innerHTML = '<option value="">กำลังโหลด...</option>';
  if (categorySelect) categorySelect.innerHTML = '<option value="">กำลังโหลด...</option>';

  try {
    // Load branches from StockStatusFact + BranchMaster combined
    const branchRes = await fetch(window.API_BASE + "/api/master/branches-for-filter");
    const branches = await branchRes.json();
    
    branchSelect.innerHTML = '<option value="">ทุกสาขา</option>';
    branches.forEach(b => {
      branchSelect.add(new Option(b, b));
    });
    
    // Load SKU data for categories
    const skuRes = await fetch(window.API_BASE + "/api/master/sku-by-branch");
    const skuData = await skuRes.json();
    window.cachedSkuData = skuData;
    
    // Get unique categories from SKU data
    const catSet = new Set();
    skuData.forEach(s => {
      if (s.category) catSet.add(s.category);
    });
    const categories = Array.from(catSet).sort();
    
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="">ทุกประเภท</option>';
      categories.forEach(c => {
        categorySelect.add(new Option(c, c));
      });
    }
    
    console.log("Loaded:", branches.length, "branches,", categories.length, "categories");
  } catch (err) {
    console.error("Filter error:", err);
    branchSelect.innerHTML = '<option value="">โหลดไม่ส���เร็จ</option>';
  }
}

// Handle branch filter change - update category dropdown
function onDealBranchChange() {
  const branchSelect = document.getElementById("dealBranchSelect");
  const categorySelect = document.getElementById("dealCategorySelect");
  const selectedBranch = branchSelect?.value;
  
  // Update category options based on selected branch
  if (categorySelect && cachedSkuData.length > 0) {
    let filteredData = cachedSkuData;
    if (selectedBranch) {
      filteredData = cachedSkuData.filter(s => s.branchCode === selectedBranch);
    }
    const categories = [...new Set(filteredData.map(s => s.category).filter(c => c && c.trim()))];
    categorySelect.innerHTML = '<option value="">ทุกประเภท</option>';
    categories.sort().forEach(code => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
      categorySelect.appendChild(option);
    });
  }
  
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (supplierNo) {
    loadDealList(supplierNo);
  }
}

// Handle category filter change
function onDealCategoryChange() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (supplierNo) {
    loadDealList(supplierNo);
  }
}

/* ===============================
   LOAD DEAL HISTORY (import sessions)
 ============================== */
async function loadDealHistory() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) return;

  const tbody   = document.getElementById("dealTableBody");
  const countEl = document.getElementById("dealRecordCount");
  if (!tbody) return;

  showLoadingIndicator("dealTableBody", "กำลังโหลดประวัติ import...");

  // สลับ header เป็น history mode
  const headRow = document.getElementById("dealTableHeadRow");
  if (headRow) {
    headRow.innerHTML = `
      <th>#</th>
      <th>วันที่ import</th>
      <th class="text-center">ทั้งหมด</th>
      <th class="text-center text-success">ใหม่</th>
      <th class="text-center text-primary">อัปเดต</th>
      <th class="text-center text-muted">ไม่เปลี่ยน</th>
      <th class="text-center text-danger">ผิดพลาด</th>
      <th>ไฟล์</th>
      <th class="text-center">CSV</th>
    `;
  }

  try {
    const res = await fetch(`${window.API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/deals-import-logs`);
    if (!res.ok) throw new Error(await res.text());
    const logs = await res.json();

    tbody.innerHTML = "";

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="100%" class="text-center py-4 text-muted">ยังไม่มีประวัติการ import</td></tr>`;
      if (countEl) countEl.textContent = "0 ครั้ง";
      return;
    }

    logs.forEach((log, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="text-center">${i + 1}</td>
        <td>${log.imported_at || "-"}</td>
        <td class="text-center">${log.total_rows}</td>
        <td class="text-center text-success fw-bold">${log.inserted}</td>
        <td class="text-center text-primary fw-bold">${log.updated}</td>
        <td class="text-center text-muted">${log.skipped}</td>
        <td class="text-center ${log.errors > 0 ? "text-danger fw-bold" : "text-muted"}">${log.errors}</td>
        <td class="text-muted small">${log.note || "-"}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-secondary" onclick="downloadImportLogCSV(${log.log_id}, '${log.imported_at}')">
            <i class="bi bi-download"></i> CSV
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    if (countEl) countEl.textContent = `${logs.length} ครั้ง`;

  } catch (err) {
    console.error("Load import logs error:", err);
    tbody.innerHTML = `<tr><td colspan="100%" class="text-center text-danger py-4">โหลดประวัติไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

/* ===============================
   DOWNLOAD IMPORT LOG CSV
 ============================== */
window.downloadImportLogCSV = async function(logId, importedAt) {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) return;

  try {
    const res = await fetch(`${window.API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/deals-import-logs/${logId}/items`);
    if (!res.ok) throw new Error(await res.text());
    const items = await res.json();

    if (items.length === 0) { alert("ไม่มีรายละเอียดใน import ครั้งนี้"); return; }

    const headers = ["#","deal_id","SKU","สาขา","ชื่อดีล","ผลลัพธ์","หมายเหตุ"];
    const escCSV = v => {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
    };
    const rows = items.map((item, i) => [
      i + 1, item.deal_id || "", item.sku || "", item.branch || "",
      item.deal_name || "", item.action || "", item.error_msg || ""
    ].map(escCSV).join(","));

    const bom = "\uFEFF";
    const csv = bom + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `import_log_${logId}_${(importedAt||"").replace(/[: ]/g,"-").substring(0,16)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("โหลด CSV ไม่สำเร็จ: " + err.message);
  }
};

// Populate contact person filter from contacts API
async function populateDealContactFilter(supplierNo) {
  const contactSelect = document.getElementById("dealContactSelect");
  if (!contactSelect) return;
  try {
    const res = await fetch(`${window.API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/contacts`);
    if (!res.ok) return;
    const contacts = await res.json();
    contactSelect.innerHTML = '<option value="">ทุกคน</option>';
    // กรองเฉพาะ active (status ไม่ใช่ CANCELLED) และไม่ซ้ำชื่อ
    const seen = new Set();
    contacts
      .filter(c => c.status !== "CANCELLED" && c.name)
      .forEach(c => {
        if (!seen.has(c.name)) {
          seen.add(c.name);
          contactSelect.add(new Option(c.name, c.name));
        }
      });
  } catch (err) {
    console.error("Load contacts for filter error:", err);
  }
}

// Handle contact filter change
function onDealContactChange() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (supplierNo) loadDealList(supplierNo);
}

// Expose functions and data to global scope
window.renderDealTable = renderDealTable;
window.loadDealList = loadDealList;
window.getBranchName = getBranchName;
window.formatThaiDate = formatThaiDate;
window.onDealBranchChange = onDealBranchChange;
window.onDealCategoryChange = onDealCategoryChange;
window.onDealContactChange = onDealContactChange;
window.initDealModule = initDealModule;
window.cachedSkuData = window.cachedSkuData;

window.dealModuleLoaded = true;