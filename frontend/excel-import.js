const API_BASE = "http://localhost:3000";

let currentWorkbook = null;
let currentSheetName = null;
let currentData = [];
let currentTab = null;
let currentFile = null;
let productTypes = [];

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const sheetSection = document.getElementById("sheetSection");
const sheetButtons = document.getElementById("sheetButtons");
const dataSection = document.getElementById("dataSection");
const productTypeTabs = document.getElementById("productTypeTabs");
const dataTable = document.getElementById("dataTable");
const rowCount = document.getElementById("rowCount");
const importBtn = document.getElementById("importBtn");
const clearBtn = document.getElementById("clearBtn");
const statusMessage = document.getElementById("statusMessage");

// ============================================
// INITIALIZE - Load product types
// ============================================

async function initializeProductTypes() {
  try {
    const response = await fetch(`${API_BASE}/api/master/categories`);
    if (response.ok) {
      const data = await response.json();
      // Extract category names
      productTypes = data.map(item => item.name).filter(Boolean);
      createProductTypeTabs();
    }
  } catch (err) {
    console.error("Failed to load product types:", err);
    // Fallback: create empty tabs, user can add manually
    createProductTypeTabs();
  }
}

function createProductTypeTabs() {
  productTypeTabs.innerHTML = "";

  // อัปเดต dropdown filter ด้วย
  const ptFilter = document.getElementById("filterProductType");
  if (ptFilter) {
    ptFilter.innerHTML = '<option value="">ทุกประเภท</option>';
    productTypes.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      ptFilter.appendChild(opt);
    });
  }
  
  if (productTypes.length === 0) {
    productTypeTabs.innerHTML = `
      <div class="px-4 py-2 text-gray-500 text-sm">
        ไม่พบประเภทสินค้า กรุณาไปตั้งค่าที่หน้าเป้าสินค้า
      </div>
    `;
    // โหลดข้อมูลตารางล่างแม้ไม่มี tabs
    loadImportData(1);
    return;
  }
  
  // Create tab for each product type
  productTypes.forEach((type) => {
    const btn = document.createElement("button");
    btn.className = "tab-button px-4 py-2 border-b-2 border-transparent hover:bg-gray-100 whitespace-nowrap";
    btn.textContent = type;
    btn.onclick = () => selectTab(type);
    productTypeTabs.appendChild(btn);
  });
  
  // Select first tab by default (จะเรียก loadImportData ผ่าน selectTab)
  if (productTypes.length > 0) {
    selectTab(productTypes[0]);
  }
}

function selectTab(type) {
  currentTab = type;
  
  // Update button styles
  Array.from(productTypeTabs.children).forEach((btn) => {
    btn.classList.remove("active", "border-blue-600", "text-blue-600");
    btn.classList.add("border-transparent");
  });
  
  Array.from(productTypeTabs.children).forEach((btn) => {
    if (btn.textContent === type) {
      btn.classList.add("active", "border-blue-600", "text-blue-600");
      btn.classList.remove("border-transparent");
    }
  });
  
  // Reset file input and data
  fileInput.value = "";
  currentData = [];
  currentWorkbook = null;
  currentSheetName = null;
  
  fileInfo.classList.add("hidden");
  sheetSection.classList.add("hidden");
  dataSection.classList.add("hidden");
  
  dataTable.querySelector("thead").innerHTML = "";
  dataTable.querySelector("tbody").innerHTML = "";

  // โหลดข้อมูลตาราง — filter ตาม tab ที่เลือก
  const ptFilter = document.getElementById("filterProductType");
  if (ptFilter) ptFilter.value = type;
  loadImportData(1);
}

// ============================================
// FILE UPLOAD HANDLING
// ============================================

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  // Store original file for sending to backend
  currentFile = file;
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      currentWorkbook = XLSX.read(data, { type: "array" });
      
      fileName.textContent = file.name;
      fileInfo.classList.remove("hidden");
      
      showSheetSelection();
      
    } catch (err) {
      showStatus("เกิดข้อผิดพลาดในการอ่านไฟล์", "error");
      console.error(err);
    }
  };
  
  reader.readAsArrayBuffer(file);
}

// ============================================
// SHEET SELECTION
// ============================================

function showSheetSelection() {
  if (!currentWorkbook) return;
  
  sheetButtons.innerHTML = "";
  
  currentWorkbook.SheetNames.forEach((name) => {
    const btn = document.createElement("button");
    btn.className = "px-4 py-2 border rounded hover:bg-gray-100";
    btn.textContent = name;
    btn.onclick = () => selectSheet(name);
    sheetButtons.appendChild(btn);
  });
  
  sheetSection.classList.remove("hidden");
  
  // Auto-select first sheet
  selectSheet(currentWorkbook.SheetNames[0]);
}

function selectSheet(name) {
  currentSheetName = name;
  
  // Update button styles
  Array.from(sheetButtons.children).forEach((btn) => {
    if (btn.textContent === name) {
      btn.className = "px-4 py-2 border rounded bg-blue-600 text-white";
    } else {
      btn.className = "px-4 py-2 border rounded hover:bg-gray-100";
    }
  });
  
  // Get data from sheet
  const sheet = currentWorkbook.Sheets[name];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  
  currentData = data;
  showDataPreview();
}

// ============================================
// ORGANIZE DATA BY PRODUCT TYPE
// ============================================

function organizeDataByType() {
  dataByType = {};
  
  allData.forEach((row) => {
    const type = row["ประเภทสินค้า"] || row.product_type || "ไม่ระบุ";
    
    if (!dataByType[type]) {
      dataByType[type] = [];
    }
    dataByType[type].push(row);
  });
}

// ============================================
// DATA PREVIEW
// ============================================

function showDataPreview() {
  if (currentData.length === 0) {
    showStatus("ไม่มีข้อมูลในชีตนี้", "warning");
    dataSection.classList.add("hidden");
    return;
  }
  
  dataSection.classList.remove("hidden");
  
  // For Gypsum and Glass, show preview from backend
  if (currentTab === "Gypsum" || currentTab === "Glass" || currentTab === "Accessories") {
    loadGypsumPreview();
    return;
  }
  
  // For other types, show preview
  renderTable(currentData);
}

async function loadGypsumPreview() {
  // แสดง loading state
  dataTable.querySelector("thead").innerHTML = "";
  dataTable.querySelector("tbody").innerHTML = "";
  rowCount.innerHTML = `<div class="text-sm text-gray-400 animate-pulse">⏳ กำลังวิเคราะห์ไฟล์...</div>`;

  try {
    const excelBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const bytes = new Uint8Array(e.target.result);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        resolve(btoa(binary));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(currentFile);
    });

    const response = await fetch(`${API_BASE}/api/excel/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetName: currentSheetName, productType: currentTab, excelBuffer })
    });

    if (!response.ok) {
      const error = await response.json();
      showStatus(`ข้อผิดพลาด: ${error.message}`, "error");
      rowCount.innerHTML = "";
      return;
    }

    const result = await response.json();

    if (result.success && result.totalSkus > 0) {
      renderImportSummary(result);
    } else {
      rowCount.innerHTML = `<div class="text-sm text-red-500">⚠️ ไม่พบข้อมูลที่จะนำเข้าในไฟล์นี้</div>`;
    }
  } catch (err) {
    console.error("Preview error:", err);
    showStatus("เกิดข้อผิดพลาดในการโหลด preview", "error");
    rowCount.innerHTML = "";
  }
}

function renderImportSummary(result) {
  const {
    detectedType, totalSkus, totalRows, branches,
    uploadRoundToday, previewVersionLabel,
    priceChangesTotal,
    newSkusTotal,
    removedSkusTotal,
  } = result;

  dataTable.querySelector("thead").innerHTML = "";
  dataTable.querySelector("tbody").innerHTML = "";

  rowCount.innerHTML = `
    <div class="space-y-4 text-sm">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="text-base font-bold text-gray-800">สรุปข้อมูลก่อนนำเข้า</div>
        <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium font-mono">
          ${previewVersionLabel || `รอบที่ ${uploadRoundToday}`}
        </span>
      </div>

      <!-- Stats cards -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-blue-50 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-blue-700">${totalSkus.toLocaleString()}</div>
          <div class="text-xs text-blue-500 mt-0.5">SKU</div>
        </div>
        <div class="bg-purple-50 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-purple-700">${branches.length.toLocaleString()}</div>
          <div class="text-xs text-purple-500 mt-0.5">สาขา</div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-gray-700">${totalRows.toLocaleString()}</div>
          <div class="text-xs text-gray-500 mt-0.5">แถวทั้งหมด</div>
        </div>
      </div>

      <!-- Branches -->
      <div class="bg-gray-50 rounded-lg p-3">
        <div class="text-xs font-medium text-gray-500 mb-1">สาขา (${branches.length})</div>
        <div class="text-xs text-gray-600 leading-relaxed">${branches.join(', ')}</div>
      </div>

      <!-- Change summary -->
      <div class="grid grid-cols-3 gap-3">
        <div class="border rounded-lg p-3 text-center ${priceChangesTotal > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-100'}">
          <div class="text-xl font-bold ${priceChangesTotal > 0 ? 'text-orange-600' : 'text-gray-400'}">${priceChangesTotal.toLocaleString()}</div>
          <div class="text-xs mt-0.5 ${priceChangesTotal > 0 ? 'text-orange-500' : 'text-gray-400'}">ราคาเปลี่ยนแปลง</div>
        </div>
        <div class="border rounded-lg p-3 text-center ${newSkusTotal > 0 ? 'border-green-200 bg-green-50' : 'border-gray-100'}">
          <div class="text-xl font-bold ${newSkusTotal > 0 ? 'text-green-600' : 'text-gray-400'}">${newSkusTotal.toLocaleString()}</div>
          <div class="text-xs mt-0.5 ${newSkusTotal > 0 ? 'text-green-500' : 'text-gray-400'}">SKU ใหม่</div>
        </div>
        <div class="border rounded-lg p-3 text-center ${removedSkusTotal > 0 ? 'border-red-200 bg-red-50' : 'border-gray-100'}">
          <div class="text-xl font-bold ${removedSkusTotal > 0 ? 'text-red-600' : 'text-gray-400'}">${removedSkusTotal.toLocaleString()}</div>
          <div class="text-xs mt-0.5 ${removedSkusTotal > 0 ? 'text-red-500' : 'text-gray-400'}">SKU ที่หายไป</div>
        </div>
      </div>

    </div>
  `;
}

function renderTable(data) {
  if (data.length === 0) {
    dataTable.querySelector("tbody").innerHTML = `
      <tr>
        <td colspan="100" class="py-6 text-center text-gray-400">
          ไม่มีข้อมูล
        </td>
      </tr>
    `;
    rowCount.textContent = "ไม่มีข้อมูล";
    return;
  }
  
  // Get headers
  const headers = Object.keys(data[0]);
  
  // Build table header
  const thead = dataTable.querySelector("thead");
  thead.innerHTML = `
    <tr>
      ${headers.map((h) => `<th>${h}</th>`).join("")}
    </tr>
  `;
  
  // Build table body (show first 20 rows)
  const tbody = dataTable.querySelector("tbody");
  tbody.innerHTML = "";
  
  const displayRows = data.slice(0, 20);
  displayRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = headers.map((h) => `<td>${row[h] || ""}</td>`).join("");
    tbody.appendChild(tr);
  });
  
  // Show row count
  rowCount.textContent = `รวม ${data.length} แถว (แสดง ${displayRows.length} แถวแรก)`;
}

// ============================================
// IMPORT DATA
// ============================================

importBtn.addEventListener("click", async () => {
  if (!currentWorkbook || !currentSheetName) {
    showStatus("ไม่มีไฟล์ที่จะนำเข้า", "warning");
    return;
  }
  
  if (currentData.length === 0) {
    showStatus("ไม่มีข้อมูลที่จะนำเข้า", "warning");
    return;
  }

  // แสดง loading overlay
  const overlay = document.createElement('div');
  overlay.id = 'importLoadingOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[260px]">
      <div class="relative w-14 h-14">
        <svg class="animate-spin w-14 h-14 text-blue-600" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
          <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
        </svg>
      </div>
      <div class="text-center">
        <div class="font-semibold text-gray-800 text-base">กำลังนำเข้าข้อมูล...</div>
        <div class="text-sm text-gray-400 mt-1">กรุณารอสักครู่ อย่าปิดหน้าต่างนี้</div>
      </div>
      <div id="importProgressText" class="text-xs text-blue-500 font-medium"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  importBtn.disabled = true;
  importBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> กำลังนำเข้า...';

  const setProgress = (text) => {
    const el = document.getElementById('importProgressText');
    if (el) el.textContent = text;
  };
  
  try {
    setProgress('กำลังอ่านไฟล์...');
    const excelBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const bytes = new Uint8Array(e.target.result);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        resolve(btoa(binary));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(currentFile);
    });

    setProgress('กำลังส่งข้อมูลไปยัง server...');
    const response = await fetch(`${API_BASE}/api/excel/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheetName: currentSheetName,
        productType: currentTab,
        data: currentData,
        excelBuffer: excelBuffer,
        availableSheets: currentWorkbook.SheetNames
      }),
    });

    setProgress('กำลังประมวลผล...');
    const result = await response.json();
    
    if (response.ok) {
      const label = result.versionLabel ? ` [${result.versionLabel}]` : '';
      showStatus(`นำเข้าข้อมูลสำเร็จ! ${result.imported} แถว${label} — กรุณาตรวจสอบและกด Publish`, "success");
      clearData();
      if (result.logId && result.imported > 0) {
        openDraftPanel(result.logId, result.versionLabel || result.logId);
      } else {
        loadImportData();
      }
    } else {
      showStatus(`เกิดข้อผิดพลาด: ${result.message}`, "error");
    }
    
  } catch (err) {
    showStatus("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
    console.error(err);
  } finally {
    document.getElementById('importLoadingOverlay')?.remove();
    importBtn.disabled = false;
    importBtn.innerHTML = '<i class="bi bi-download"></i> นำเข้าข้อมูล';
  }
});

clearBtn.addEventListener("click", clearData);

function clearData() {
  currentWorkbook = null;
  currentSheetName = null;
  currentData = [];
  currentFile = null;
  
  fileInput.value = "";
  fileInfo.classList.add("hidden");
  sheetSection.classList.add("hidden");
  dataSection.classList.add("hidden");
  statusMessage.classList.add("hidden");
  
  sheetButtons.innerHTML = "";
  dataTable.querySelector("thead").innerHTML = "";
  dataTable.querySelector("tbody").innerHTML = "";
}

// ============================================
// STATUS MESSAGE
// ============================================

function showStatus(message, type = "info") {
  statusMessage.textContent = message;
  statusMessage.classList.remove("hidden", "bg-blue-50", "text-blue-700", "bg-green-50", "text-green-700", "bg-yellow-50", "text-yellow-700", "bg-red-50", "text-red-700");
  
  if (type === "success") {
    statusMessage.classList.add("bg-green-50", "text-green-700");
  } else if (type === "error") {
    statusMessage.classList.add("bg-red-50", "text-red-700");
  } else if (type === "warning") {
    statusMessage.classList.add("bg-yellow-50", "text-yellow-700");
  } else {
    statusMessage.classList.add("bg-blue-50", "text-blue-700");
  }
}

// ============================================
// INLINE PRICE EDIT
// ============================================

function startEditPrice(el) {
  if (el.querySelector('input')) return;

  const currentValue = parseFloat(el.dataset.value) || 0;
  const field = el.dataset.field;
  const id = el.dataset.id;

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.value = currentValue;
  input.className = 'w-24 text-right border border-blue-400 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500';
  input._confirmed = false; // flag ป้องกัน blur ยิง cancel

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const newValue = parseFloat(input.value) || 0;
      input._confirmed = true;
      el.innerHTML = ''; // เคลียร์ input ออกก่อน
      const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });
      el.innerHTML = fmt(currentValue); // คืนค่าเดิม
      if (newValue === currentValue) return;
      showConfirmDialog(currentValue, newValue, id, field);
    }
    if (event.key === 'Escape') {
      input._confirmed = true;
      cancelEditPrice(el, currentValue);
    }
  });

  input.addEventListener('blur', () => {
    if (!input._confirmed) {
      cancelEditPrice(el, currentValue);
    }
  });

  el.innerHTML = '';
  el.appendChild(input);
  input.select();
}

function cancelEditPrice(el, originalValue) {
  if (!el) return;
  const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  el.dataset.value = originalValue;
  el.innerHTML = fmt(originalValue);
}

// ============================================
// CONFIRM DIALOG
// ============================================

function showConfirmDialog(oldValue, newValue, id, field) {
  const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl p-6 w-80 text-center">
      <div class="text-gray-500 text-sm mb-2">ยืนยันการเปลี่ยนแปลงราคา</div>
      <div class="flex items-center justify-center gap-3 my-4">
        <span class="text-xl font-bold text-gray-400">${fmt(oldValue)}</span>
        <i class="bi bi-arrow-right text-gray-400 text-lg"></i>
        <span class="text-xl font-bold text-blue-600">${fmt(newValue)}</span>
      </div>
      <div class="text-xs text-gray-400 mb-5">กด Enter เพื่อยืนยัน หรือ Escape เพื่อยกเลิก</div>
      <div class="flex gap-3 justify-center">
        <button 
          class="px-5 py-2 border rounded-lg hover:bg-gray-100 text-sm"
          onclick="closeConfirmDialog()"
        >ยกเลิก</button>
        <button 
          id="confirmOkBtn"
          class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          onclick="confirmSavePrice(${oldValue}, ${newValue}, '${id}', '${field}')"
        >ยืนยัน</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // รอ 200ms ก่อน bind keyboard เพื่อป้องกัน Enter จาก input ก่อนหน้ายิงทันที
  setTimeout(() => {
    overlay._keyHandler = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmSavePrice(oldValue, newValue, id, field); }
      if (e.key === 'Escape') closeConfirmDialog();
    };
    document.addEventListener('keydown', overlay._keyHandler);
  }, 200);
}

function closeConfirmDialog() {
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) {
    document.removeEventListener('keydown', overlay._keyHandler);
    overlay.remove();
  }
}

async function confirmSavePrice(oldValue, newValue, id, field) {
  closeConfirmDialog();
  const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const el = document.querySelector(`.editable-price[data-id="${id}"][data-field="${field}"]`);

  try {
    const response = await fetch(`${API_BASE}/api/excel/data/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: newValue })
    });

    if (response.ok) {
      if (el) { el.dataset.value = newValue; el.innerHTML = fmt(newValue); }
      showToast(`เปลี่ยนจาก ${fmt(oldValue)} → ${fmt(newValue)}`, 'success');
    } else {
      const err = await response.json();
      showToast(`บันทึกไม่สำเร็จ: ${err.message}`, 'error');
    }
  } catch (err) {
    showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", 'error');
  }
}

// Toast notification
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };

  toast.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded shadow-lg text-sm flex items-center gap-2 transition-all duration-300 opacity-0`;
  toast.innerHTML = `
    <i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => { toast.classList.remove('opacity-0'); toast.classList.add('opacity-100'); });
  setTimeout(() => {
    toast.classList.remove('opacity-100'); toast.classList.add('opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// IMPORT DATA VIEW
// ============================================

let currentDataPage = 1;
let searchTimer = null;

function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadImportData(), 400);
}

async function loadImportData(page = 1) {
  currentDataPage = page;
  const tbody = document.getElementById("importDataBody");
  const summary = document.getElementById("dataSummary");
  const pagination = document.getElementById("dataPagination");

  tbody.innerHTML = `
    <tr><td colspan="13" class="text-center py-6 text-gray-400">
      <i class="bi bi-hourglass-split"></i> กำลังโหลด...
    </td></tr>
  `;

  const productType = document.getElementById("filterProductType")?.value || "";
  const branch      = document.getElementById("filterBranch")?.value || "";
  const searchText  = document.getElementById("filterSku")?.value || "";

  const params = new URLSearchParams({ page, limit: 50 });
  if (productType) params.append("productType", productType);
  if (branch)      params.append("branch", branch);
  if (searchText)  params.append("search", searchText);

  try {
    const response = await fetch(`${API_BASE}/api/excel/data?${params}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-6 text-red-400">โหลดข้อมูลไม่สำเร็จ: ${err.error || err.message || response.status}</td></tr>`;
      return;
    }

    const { data, total, totalPages } = await response.json();

    summary.textContent = `พบ ${total.toLocaleString()} รายการ`;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="13" class="text-center py-6 text-gray-400">ไม่มีข้อมูล</td></tr>`;
      pagination.innerHTML = "";
      return;
    }

    tbody.innerHTML = data.map(row => {
      const date = row.createdAt
        ? new Date(row.createdAt).toLocaleDateString('th-TH', { dateStyle: 'short' })
        : '-';
      const fmt = v => v != null ? parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-';

      // Editable price cell — แสดง "-" ถ้าค่าเป็น 0 แต่ยังคลิกแก้ไขได้เสมอ
      const priceCell = (field, value) => {
        const numVal = value != null ? parseFloat(value) : 0;
        const display = numVal !== 0 ? fmt(value) : '<span class="text-gray-300">-</span>';
        return `
          <td class="text-right">
            <span 
              class="editable-price cursor-pointer hover:bg-yellow-50 hover:text-blue-600 px-1 rounded"
              data-id="${row.id}"
              data-field="${field}"
              data-value="${numVal}"
              onclick="startEditPrice(this)"
            >${display}</span>
          </td>
        `;
      };

      // คำนวณ % ส่วนลดย้อนกลับจากราคา เมื่อ discountPct ไม่มีใน DB
      // สูตร: pct = (ราคาก่อน - ราคาหลัง) / ราคาก่อน × 100
      // ถ้าราคาหลัง >= ราคาก่อน หรือ ราคาหลัง = 0 → ไม่มีส่วนลดจริง → แสดง -
      const calcPct = (priceBefore, priceAfter) => {
        const before = parseFloat(priceBefore);
        const after  = parseFloat(priceAfter);
        if (!before || !after || after <= 0 || after >= before) return null;
        const pct = ((before - after) / before) * 100;
        if (pct < 0.01) return null; // ต่ำกว่า 0.01% ถือว่าไม่มีส่วนลด
        return pct;
      };

      const fmtPct = (storedPct, priceBefore, priceAfter) => {
        // ถ้ามีค่า discountPct จาก DB ให้ใช้ก่อน (แม่นยำกว่า)
        // แต่ต้องมี priceAfter > 0 ด้วย ไม่งั้นแปลว่าข้อมูลผิด
        if (storedPct != null && storedPct > 0 && parseFloat(priceAfter) > 0) {
          return `<span title="จาก DB">${(storedPct * 100).toFixed(1)}%</span>`;
        }
        // ไม่มีใน DB หรือ priceAfter = 0 → คำนวณย้อนกลับจากราคา
        const computed = calcPct(priceBefore, priceAfter);
        if (computed != null) {
          return `<span class="text-gray-500 italic" title="คำนวณจากราคา">${computed.toFixed(1)}%</span>`;
        }
        return '<span class="text-gray-300">-</span>';
      };

      return `
        <tr>
          <td><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">${row.productType || '-'}</span></td>
          <td class="font-mono text-xs">${row.sku || '-'}</td>
          <td>${row.productName || '-'}</td>
          <td class="text-gray-600">${row.brand || '-'}</td>
          <td><span class="font-medium">${row.branch || '-'}</span></td>
          ${priceCell('base_price',       row.basePrice)}
          <td class="text-right text-orange-600 font-medium">${fmtPct(row.discountPct1, row.basePrice,      row.discountPrice1)}</td>
          ${priceCell('discount_price_1', row.discountPrice1)}
          <td class="text-right text-orange-600 font-medium">${fmtPct(row.discountPct2, row.discountPrice1, row.discountPrice2)}</td>
          ${priceCell('discount_price_2', row.discountPrice2)}
          <td class="text-right text-orange-600 font-medium">${fmtPct(row.discountPct3, row.discountPrice2, row.discountPrice3)}</td>
          ${priceCell('discount_price_3', row.discountPrice3)}
          <td class="text-gray-400 text-xs">${date}</td>
        </tr>
      `;
    }).join('');

    // Pagination
    if (totalPages > 1) {
      const prevDisabled = page <= 1 ? 'opacity-40 pointer-events-none' : '';
      const nextDisabled = page >= totalPages ? 'opacity-40 pointer-events-none' : '';
      pagination.innerHTML = `
        <span>หน้า ${page} / ${totalPages}</span>
        <div class="flex gap-2">
          <button onclick="loadImportData(${page - 1})" class="px-3 py-1 border rounded hover:bg-gray-100 ${prevDisabled}">
            <i class="bi bi-chevron-left"></i>
          </button>
          <button onclick="loadImportData(${page + 1})" class="px-3 py-1 border rounded hover:bg-gray-100 ${nextDisabled}">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      `;
    } else {
      pagination.innerHTML = "";
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="13" class="text-center py-6 text-red-400">เกิดข้อผิดพลาด</td></tr>`;
    console.error("loadImportData error:", err);
  }
}

// ============================================
// INITIALIZE ON PAGE LOAD
// ============================================

// initializeProductTypes จะเรียก loadImportData เองผ่าน selectTab
// ไม่ต้องเรียก loadImportData() แยกเพื่อป้องกัน race condition
initializeProductTypes();

// ============================================
// DRAFT PANEL
// ============================================

let currentDraftLogId = null;
let currentDraftPage = 1;
let draftSearchTimer = null;

function debounceDraftSearch() {
  clearTimeout(draftSearchTimer);
  draftSearchTimer = setTimeout(() => loadDraftData(), 400);
}

function openDraftPanel(logId, label) {
  currentDraftLogId = logId;
  currentDraftPage = 1;
  document.getElementById('draftPanel').classList.remove('hidden');
  document.getElementById('draftVersionBadge').textContent = label;
  document.getElementById('draftPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadDraftData();
}

function closeDraftPanel() {
  document.getElementById('draftPanel').classList.add('hidden');
  currentDraftLogId = null;
}

async function loadDraftData(page = 1) {
  if (!currentDraftLogId) return;
  currentDraftPage = page;

  const tbody = document.getElementById('draftBody');
  const summary = document.getElementById('draftSummary');
  const pagination = document.getElementById('draftPagination');
  const branch = document.getElementById('draftFilterBranch')?.value || '';
  const search = document.getElementById('draftFilterSku')?.value || '';

  tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-gray-400 text-sm">กำลังโหลด...</td></tr>`;

  try {
    const params = new URLSearchParams({ page, limit: 50 });
    if (branch) params.append('branch', branch);
    if (search) params.append('search', search);

    const response = await fetch(`${API_BASE}/api/excel/draft/${currentDraftLogId}?${params}`);
    if (!response.ok) throw new Error('โหลด draft ไม่สำเร็จ');
    const { data, total, totalPages } = await response.json();

    summary.textContent = `พบ ${total.toLocaleString()} รายการ`;

    const fmt = v => v != null && parseFloat(v) !== 0
      ? parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 })
      : '<span class="text-gray-300">-</span>';

    const calcPct = (b, a) => {
      const bv = parseFloat(b), av = parseFloat(a);
      if (!bv || !av || av <= 0 || av >= bv) return null;
      const p = ((bv - av) / bv) * 100;
      return p < 0.01 ? null : p;
    };
    const fmtPct = (stored, before, after) => {
      if (stored != null && stored > 0 && parseFloat(after) > 0)
        return `<span class="text-orange-600">${(stored * 100).toFixed(1)}%</span>`;
      const c = calcPct(before, after);
      return c != null ? `<span class="text-orange-400 italic">${c.toFixed(1)}%</span>` : '<span class="text-gray-300">-</span>';
    };

    const draftPriceCell = (field, value, rowId) => {
      const numVal = value != null ? parseFloat(value) : 0;
      const display = numVal !== 0 ? parseFloat(value).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '<span class="text-gray-300">-</span>';
      return `<td class="text-right">
        <span class="editable-draft cursor-pointer hover:bg-yellow-50 hover:text-blue-600 px-1 rounded"
          data-id="${rowId}" data-field="${field}" data-value="${numVal}"
          onclick="startEditDraftPrice(this)">${display}</span>
      </td>`;
    };

    tbody.innerHTML = data.map(row => `
      <tr class="text-sm hover:bg-orange-50">
        <td class="font-mono text-xs">${row.sku || '-'}</td>
        <td>${row.productName || '-'}</td>
        <td class="text-gray-500">${row.brand || '-'}</td>
        <td><span class="font-medium">${row.branch || '-'}</span></td>
        ${draftPriceCell('base_price', row.basePrice, row.id)}
        <td class="text-right">${fmtPct(row.discountPct1, row.basePrice, row.discountPrice1)}</td>
        ${draftPriceCell('discount_price_1', row.discountPrice1, row.id)}
        <td class="text-right">${fmtPct(row.discountPct2, row.discountPrice1, row.discountPrice2)}</td>
        ${draftPriceCell('discount_price_2', row.discountPrice2, row.id)}
      </tr>
    `).join('');

    if (totalPages > 1) {
      pagination.innerHTML = `
        <span>หน้า ${page} / ${totalPages}</span>
        <div class="flex gap-2">
          <button onclick="loadDraftData(${page - 1})" class="px-3 py-1 border rounded hover:bg-gray-100 ${page <= 1 ? 'opacity-40 pointer-events-none' : ''}">
            <i class="bi bi-chevron-left"></i>
          </button>
          <button onclick="loadDraftData(${page + 1})" class="px-3 py-1 border rounded hover:bg-gray-100 ${page >= totalPages ? 'opacity-40 pointer-events-none' : ''}">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      `;
    } else {
      pagination.innerHTML = '';
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-400 text-sm">${err.message}</td></tr>`;
  }
}

function startEditDraftPrice(el) {
  if (el.querySelector('input')) return;
  const currentValue = parseFloat(el.dataset.value) || 0;
  const field = el.dataset.field;
  const id = el.dataset.id;

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.01';
  input.value = currentValue;
  input.className = 'w-24 text-right border border-blue-400 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500';
  input._confirmed = false;

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newValue = parseFloat(input.value) || 0;
      input._confirmed = true;
      if (newValue === currentValue) { cancelEditDraftPrice(el, currentValue); return; }
      await saveDraftPrice(el, id, field, currentValue, newValue);
    }
    if (e.key === 'Escape') { input._confirmed = true; cancelEditDraftPrice(el, currentValue); }
  });
  input.addEventListener('blur', () => { if (!input._confirmed) cancelEditDraftPrice(el, currentValue); });

  el.innerHTML = '';
  el.appendChild(input);
  input.select();
}

function cancelEditDraftPrice(el, originalValue) {
  const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  el.dataset.value = originalValue;
  el.innerHTML = originalValue !== 0 ? fmt(originalValue) : '<span class="text-gray-300">-</span>';
}

async function saveDraftPrice(el, rowId, field, oldValue, newValue) {
  const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  try {
    const response = await fetch(`${API_BASE}/api/excel/draft/${currentDraftLogId}/rows/${rowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: newValue })
    });
    if (response.ok) {
      el.dataset.value = newValue;
      el.innerHTML = newValue !== 0 ? fmt(newValue) : '<span class="text-gray-300">-</span>';
      showToast(`แก้ไข ${fmt(oldValue)} → ${fmt(newValue)}`, 'success');
    } else {
      cancelEditDraftPrice(el, oldValue);
      showToast('บันทึกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    cancelEditDraftPrice(el, oldValue);
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

async function publishDraft() {
  if (!currentDraftLogId) return;
  if (!confirm('ยืนยันการ Publish ข้อมูลนี้?\nข้อมูลจะถูกนำไปแสดงในระบบทันที')) return;

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
  overlay.innerHTML = `<div class="bg-white rounded-xl px-8 py-6 flex items-center gap-4 shadow-xl">
    <svg class="animate-spin w-8 h-8 text-green-600" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
      <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
    </svg>
    <span class="font-medium text-gray-700">กำลัง Publish...</span>
  </div>`;
  document.body.appendChild(overlay);

  try {
    const response = await fetch(`${API_BASE}/api/excel/draft/${currentDraftLogId}/publish`, { method: 'POST' });
    const result = await response.json();
    if (response.ok) {
      showToast(`Publish สำเร็จ! ${result.published} แถว`, 'success');
      closeDraftPanel();
      loadImportData();
    } else {
      showToast(`Publish ไม่สำเร็จ: ${result.message}`, 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  } finally {
    overlay.remove();
  }
}

async function discardDraft() {
  if (!currentDraftLogId) return;
  if (!confirm('ยืนยันการยกเลิก Draft นี้?\nข้อมูลที่ยังไม่ Publish จะถูกลบออก')) return;

  try {
    const response = await fetch(`${API_BASE}/api/excel/draft/${currentDraftLogId}`, { method: 'DELETE' });
    if (response.ok) {
      showToast('ยกเลิก Draft สำเร็จ', 'success');
      closeDraftPanel();
    } else {
      showToast('ยกเลิกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}
