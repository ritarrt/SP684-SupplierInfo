const API_BASE = "http://localhost:3000";

let currentWorkbook = null;
let currentSheetName = null;
let currentData = [];
let currentTab = null;
let currentFile = null;
let productTypes = [];
let selectedSheets = new Set();

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

  // ตรวจสอบว่ามี draft ค้างอยู่ไหม
  checkPendingDraft(type);

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

// ============================================
// SHEET SELECTION (single select)
// ============================================

function showSheetSelection() {
  if (!currentWorkbook) return;

  // C-Line: แสดงเฉพาะชีทที่ขึ้นต้นด้วย "C-Line_" (ชีทราคา) ไม่แสดงชีทอื่น
  const sheetsToShow = currentTab === "C-Line"
    ? currentWorkbook.SheetNames.filter(n => n.toLowerCase().startsWith('c-line_'))
    : currentWorkbook.SheetNames;

  sheetButtons.innerHTML = "";
  selectedSheets.clear();

  if (currentTab === "C-Line" && sheetsToShow.length === 0) {
    sheetButtons.innerHTML = `
      <span class="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-1.5">
        ไม่พบชีทราคา (ต้องขึ้นต้นด้วย "C-Line_")
      </span>
    `;
    sheetSection.classList.remove("hidden");
    return;
  }

  sheetsToShow.forEach((name) => {
    const btn = document.createElement("button");
    btn.className = "px-3 py-1.5 border rounded hover:bg-gray-100 text-sm";
    btn.textContent = name;
    btn.dataset.sheet = name;
    btn.onclick = () => selectSheet(name, btn);
    sheetButtons.appendChild(btn);
  });
  
  sheetSection.classList.remove("hidden");
  
  // Auto-select first sheet ของ sheetsToShow
  const firstBtn = sheetButtons.querySelector('[data-sheet]');
  if (firstBtn) selectSheet(sheetsToShow[0], firstBtn);
}

function selectSheet(name, btn) {
  currentSheetName = name;
  selectedSheets.clear();
  selectedSheets.add(name);

  // Update button styles
  Array.from(sheetButtons.querySelectorAll('[data-sheet]')).forEach(b => {
    b.className = b.dataset.sheet === name
      ? "px-3 py-1.5 border rounded bg-blue-600 text-white text-sm"
      : "px-3 py-1.5 border rounded hover:bg-gray-100 text-sm";
  });

  const sheet = currentWorkbook.Sheets[name];
  currentData = XLSX.utils.sheet_to_json(sheet, { defval: "" });
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
  if (currentTab === "Gypsum" || currentTab === "Glass" || currentTab === "Accessories" || currentTab === "Sealant" || currentTab === "C-Line") {
    loadGypsumPreview();
    return;
  }
  
  // For other types, show preview
  renderTable(currentData);
}

async function loadGypsumPreview() {
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
    groupSummaries,
  } = result;

  dataTable.querySelector("thead").innerHTML = "";
  dataTable.querySelector("tbody").innerHTML = "";

  // แสดงสาขา: ถ้ามี groupSummaries (C-Line) แสดงแยกตาม zone group
  const branchDisplay = groupSummaries && groupSummaries.length > 0
    ? groupSummaries.join(' + ')   // เช่น "BKK-C-E(13) + N-NE-S(13)"
    : branches.length.toLocaleString();

  const branchDetail = groupSummaries && groupSummaries.length > 0
    ? `<div class="text-xs font-medium text-gray-500 mb-1">สาขาแยกตามภาค</div>
       <div class="text-xs text-gray-600 leading-relaxed">${groupSummaries.join(' | ')}</div>
       <div class="text-xs text-gray-400 mt-1">${branches.join(', ')}</div>`
    : `<div class="text-xs font-medium text-gray-500 mb-1">สาขา (${branches.length})</div>
       <div class="text-xs text-gray-600 leading-relaxed">${branches.join(', ')}</div>`;

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
          <div class="text-lg font-bold text-purple-700">${branchDisplay}</div>
          <div class="text-xs text-purple-500 mt-0.5">สาขา</div>
        </div>
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-gray-700">${totalRows.toLocaleString()}</div>
          <div class="text-xs text-gray-500 mt-0.5">แถวทั้งหมด</div>
        </div>
      </div>

      <!-- Branches -->
      <div class="bg-gray-50 rounded-lg p-3">
        ${branchDetail}
      </div>

      <!-- Change summary -->
      <div class="grid grid-cols-2 gap-3">
        <div class="border rounded-lg p-3 text-center ${priceChangesTotal > 0 ? 'border-orange-200 bg-orange-50' : 'border-gray-100'}">
          <div class="text-xl font-bold ${priceChangesTotal > 0 ? 'text-orange-600' : 'text-gray-400'}">${priceChangesTotal.toLocaleString()}</div>
          <div class="text-xs mt-0.5 ${priceChangesTotal > 0 ? 'text-orange-500' : 'text-gray-400'}">ราคาเปลี่ยนแปลง</div>
        </div>
        <div class="border rounded-lg p-3 text-center ${newSkusTotal > 0 ? 'border-green-200 bg-green-50' : 'border-gray-100'}">
          <div class="text-xl font-bold ${newSkusTotal > 0 ? 'text-green-600' : 'text-gray-400'}">${newSkusTotal.toLocaleString()}</div>
          <div class="text-xs mt-0.5 ${newSkusTotal > 0 ? 'text-green-500' : 'text-gray-400'}">SKU ใหม่</div>
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
    showStatus("ไม่มีไฟล์หรือไม่ได้เลือก sheet", "warning");
    return;
  }

  // ตรวจสอบว่ามี draft ค้างอยู่ไหม — ถ้ามีต้องเตือนก่อน
  try {
    const draftCheckRes = await fetch(`${API_BASE}/api/excel/pending-draft?productType=${encodeURIComponent(currentTab)}`);
    if (draftCheckRes.ok) {
      const drafts = await draftCheckRes.json();
      const activeDraft = drafts.find(d => d.draftCount > 0);
      if (activeDraft) {
        const date = new Date(activeDraft.importedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
        const confirmed = await showConfirmModal({
          icon: 'exclamation-triangle',
          iconColor: 'text-amber-500',
          iconBg: 'bg-amber-50',
          title: 'มี Draft ค้างอยู่',
          message: `ยังมี Draft <span class="font-semibold text-blue-700">${activeDraft.versionLabel || activeDraft.id}</span> (${activeDraft.draftCount.toLocaleString()} แถว · ${date}) ที่ยังไม่ได้ประกาศใช้<br><span class="text-red-500 font-medium">การนำเข้าใหม่จะลบ Draft นี้ทิ้ง</span>`,
          confirmText: 'นำเข้าต่อ (ลบ Draft เก่า)',
          confirmClass: 'bg-amber-500 hover:bg-amber-600 text-white',
        });
        if (!confirmed) return;
      }
    }
  } catch (e) {
    // ถ้าเช็คไม่ได้ก็ข้ามไป ไม่ block การ import
    console.warn('Draft check failed:', e);
  }

  const overlay = document.createElement('div');
  overlay.id = 'importLoadingOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[280px]">
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
        excelBuffer,
        availableSheets: currentWorkbook.SheetNames
      }),
    });

    setProgress('กำลังประมวลผล...');
    const result = await response.json();

    if (response.ok) {
      const label = result.versionLabel ? ` [${result.versionLabel}]` : '';
      showStatus(`นำเข้าข้อมูลสำเร็จ! ${result.imported} แถว${label} — กรุณาตรวจสอบและกด ประกาศใช้`, "success");
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
  selectedSheets.clear();
  
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
  statusMessage.innerHTML = message;
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
  el.innerHTML = originalValue > 0 ? fmt(originalValue) : '<span class="text-gray-300">-</span>';
}

// ============================================
// EDIT DISCOUNT PCT
// ============================================

function startEditPct(el) {
  if (el.querySelector('input')) return;

  const currentPct   = parseFloat(el.dataset.value) || 0;
  const priceBefore  = parseFloat(el.dataset.priceBefore) || 0;
  const field        = el.dataset.field;       // discount_pct_1 / 2 / 3
  const priceField   = el.dataset.priceField;  // discount_price_1 / 2 / 3
  const id           = el.dataset.id;

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.1';
  input.min  = '0';
  input.max  = '100';
  input.value = currentPct;
  input.className = 'w-16 text-right border border-orange-400 rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500';
  input._confirmed = false;

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const newPct = parseFloat(input.value);
      if (isNaN(newPct) || newPct < 0 || newPct > 100) {
        input.classList.add('border-red-500');
        return;
      }
      input._confirmed = true;
      el.innerHTML = currentPct > 0 ? `${currentPct.toFixed(1)}%` : '<span class="text-gray-300">-</span>';
      if (newPct === currentPct) return;
      // คำนวณ discount_price ใหม่จาก %
      const newDiscountPrice = priceBefore > 0 ? priceBefore * (1 - newPct / 100) : 0;
      showConfirmPctDialog(currentPct, newPct, newDiscountPrice, id, field, priceField, priceBefore);
    }
    if (event.key === 'Escape') {
      input._confirmed = true;
      cancelEditPct(el, currentPct);
    }
  });

  input.addEventListener('blur', () => {
    if (!input._confirmed) cancelEditPct(el, currentPct);
  });

  el.innerHTML = '';
  el.appendChild(input);
  input.select();
}

function cancelEditPct(el, originalPct) {
  if (!el) return;
  el.dataset.value = originalPct;
  el.innerHTML = originalPct > 0 ? `${originalPct.toFixed(1)}%` : '<span class="text-gray-300">-</span>';
}

function showConfirmPctDialog(oldPct, newPct, newDiscountPrice, id, field, priceField, priceBefore) {
  const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });

  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
  overlay.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl p-6 w-96 text-center">
      <div class="text-gray-500 text-sm mb-2">ยืนยันการเปลี่ยนแปลงส่วนลด</div>
      <div class="flex items-center justify-center gap-3 my-3">
        <span class="text-xl font-bold text-gray-400">${oldPct.toFixed(1)}%</span>
        <i class="bi bi-arrow-right text-gray-400 text-lg"></i>
        <span class="text-xl font-bold text-orange-600">${newPct.toFixed(1)}%</span>
      </div>
      <div class="text-sm text-gray-500 mb-4">
        ราคาหลังลด: <span class="font-semibold text-blue-600">${fmt(newDiscountPrice)}</span>
        <span class="text-xs text-gray-400 ml-1">(จาก ${fmt(priceBefore)})</span>
      </div>
      <div class="flex gap-3 justify-center">
        <button class="px-5 py-2 border rounded-lg hover:bg-gray-100 text-sm" onclick="closeConfirmDialog()">ยกเลิก</button>
        <button id="confirmOkBtn" class="px-5 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm"
          onclick="confirmSavePct(${oldPct}, ${newPct}, ${newDiscountPrice}, '${id}', '${field}', '${priceField}')">ยืนยัน</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay._keyHandler = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmSavePct(oldPct, newPct, newDiscountPrice, id, field, priceField); }
      if (e.key === 'Escape') closeConfirmDialog();
    };
    document.addEventListener('keydown', overlay._keyHandler);
  }, 200);
}

async function confirmSavePct(oldPct, newPct, newDiscountPrice, id, field, priceField) {
  closeConfirmDialog();
  const fmt = v => parseFloat(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const pctEl   = document.querySelector(`.editable-pct[data-id="${id}"][data-field="${field}"]`);
  const priceEl = document.querySelector(`.editable-price[data-id="${id}"][data-field="${priceField}"]`);

  try {
    const response = await fetch(`${API_BASE}/api/excel/data/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [field]:      newPct / 100,        // เก็บเป็น 0-1 ใน DB
        [priceField]: newDiscountPrice      // อัปเดตราคาหลังลดด้วย
      })
    });

    if (response.ok) {
      // อัปเดต pct cell
      if (pctEl) {
        pctEl.dataset.value = newPct;
        pctEl.innerHTML = newPct > 0 ? `${newPct.toFixed(1)}%` : '<span class="text-gray-300">-</span>';
      }
      // อัปเดต price cell
      if (priceEl) {
        const priceBefore = parseFloat(pctEl?.dataset.priceBefore) || 0;
        const hasDiscount = newDiscountPrice > 0 && newDiscountPrice < priceBefore;
        priceEl.dataset.value = newDiscountPrice;
        priceEl.innerHTML = hasDiscount
          ? fmt(newDiscountPrice)
          : '<span class="text-gray-300">-</span>';
      }
      showToast(`ส่วนลด ${oldPct.toFixed(1)}% → ${newPct.toFixed(1)}%`, 'success');
    } else {
      const err = await response.json();
      showToast(`บันทึกไม่สำเร็จ: ${err.message}`, 'error');
    }
  } catch (err) {
    showToast("เกิดข้อผิดพลาดในการเชื่อมต่อ", 'error');
  }
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
// CONFIRM MODAL (แทน browser confirm())
// ============================================

/**
 * showConfirmModal({ icon, iconColor, iconBg, title, message, confirmText, confirmClass })
 * returns Promise<boolean>
 */
function showConfirmModal({ icon = 'question-circle', iconColor = 'text-blue-600', iconBg = 'bg-blue-50',
                            title = 'ยืนยัน', message = '', confirmText = 'ยืนยัน',
                            confirmClass = 'bg-blue-600 hover:bg-blue-700 text-white' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[9999] animate-fade-in';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <!-- Icon header -->
        <div class="flex flex-col items-center pt-8 pb-4 px-6">
          <div class="w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mb-4">
            <i class="bi bi-${icon} text-2xl ${iconColor}"></i>
          </div>
          <h3 class="text-lg font-bold text-gray-800 mb-1">${title}</h3>
          <p class="text-sm text-gray-500 text-center leading-relaxed">${message}</p>
        </div>
        <!-- Divider -->
        <div class="border-t border-gray-100 mx-6"></div>
        <!-- Actions -->
        <div class="flex gap-3 p-5">
          <button id="_confirmModalCancel"
            class="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            ยกเลิก
          </button>
          <button id="_confirmModalOk"
            class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${confirmClass}">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    const cleanup = (result) => {
      document.removeEventListener('keydown', keyHandler);
      overlay.classList.add('opacity-0');
      overlay.style.transition = 'opacity 0.15s';
      setTimeout(() => overlay.remove(), 150);
      resolve(result);
    };

    const keyHandler = (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); cleanup(true); }
      if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
    };

    overlay.querySelector('#_confirmModalOk').addEventListener('click',     () => cleanup(true));
    overlay.querySelector('#_confirmModalCancel').addEventListener('click',  () => cleanup(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });

    document.body.appendChild(overlay);
    setTimeout(() => document.addEventListener('keydown', keyHandler), 100);

    // focus ปุ่มยืนยันเพื่อให้กด Enter ได้ทันที
    setTimeout(() => overlay.querySelector('#_confirmModalOk')?.focus(), 50);
  });
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
      // priceBefore: ราคาก่อนหน้า — ถ้า value >= priceBefore หรือ value = 0 แสดงเป็น - แต่ยังคลิกแก้ไขได้เสมอ
      const priceCell = (field, value, priceBefore = null) => {
        const numVal = value != null ? parseFloat(value) : 0;
        const hasDiscount = numVal > 0 && (priceBefore == null || numVal < parseFloat(priceBefore));
        const display = hasDiscount ? fmt(value) : '<span class="text-gray-300">-</span>';
        return `
          <td class="text-right">
            <span 
              class="editable-price cursor-pointer hover:bg-yellow-50 hover:text-blue-600 px-1 rounded"
              data-id="${row.id}"
              data-field="${field}"
              data-value="${numVal}"
              onclick="startEditPrice(this)"
              title="คลิกเพื่อแก้ไข"
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

      // pctCell — คลิกแก้ไข % ได้ คำนวณ discount_price ใหม่อัตโนมัติ
      // field: 'discount_pct_1' | 'discount_pct_2' | 'discount_pct_3'
      // priceField: 'discount_price_1' | 'discount_price_2' | 'discount_price_3'
      // storedPct: ค่า % จาก DB (0-1), priceBefore: ราคาก่อนลด, priceAfter: ราคาหลังลด
      const pctCell = (field, priceField, storedPct, priceBefore, priceAfter) => {
        // คำนวณ % ที่จะแสดง
        let displayPct = null;
        if (storedPct != null && storedPct > 0 && parseFloat(priceAfter) > 0) {
          displayPct = storedPct * 100; // DB เก็บเป็น 0-1
        } else {
          displayPct = calcPct(priceBefore, priceAfter);
        }
        const display = displayPct != null
          ? `${displayPct.toFixed(1)}%`
          : '<span class="text-gray-300">-</span>';
        const currentPct = displayPct != null ? displayPct : 0;

        return `
          <td class="text-right text-orange-600 font-medium">
            <span
              class="editable-pct cursor-pointer hover:bg-yellow-50 hover:text-orange-700 px-1 rounded"
              data-id="${row.id}"
              data-field="${field}"
              data-price-field="${priceField}"
              data-price-before="${parseFloat(priceBefore) || 0}"
              data-value="${currentPct}"
              onclick="startEditPct(this)"
              title="คลิกเพื่อแก้ไข %"
            >${display}</span>
          </td>
        `;
      };

      return `
        <tr>
          <td><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">${row.productType || '-'}</span></td>
          <td class="font-mono text-xs">${row.sku || '-'}</td>
          <td>${row.productName || '-'}</td>
          <td class="text-gray-600">${row.brand || '-'}</td>
          <td><span class="font-medium">${row.branch || '-'}</span></td>
          ${priceCell('base_price', row.basePrice)}
          ${pctCell('discount_pct_1', 'discount_price_1', row.discountPct1, row.basePrice,      row.discountPrice1)}
          ${priceCell('discount_price_1', row.discountPrice1, row.basePrice)}
          ${pctCell('discount_pct_2', 'discount_price_2', row.discountPct2, row.discountPrice1, row.discountPrice2)}
          ${priceCell('discount_price_2', row.discountPrice2, row.discountPrice1)}
          ${pctCell('discount_pct_3', 'discount_price_3', row.discountPct3, row.discountPrice2, row.discountPrice3)}
          ${priceCell('discount_price_3', row.discountPrice3, row.discountPrice2)}
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

async function initializeBranchFilter() {
  try {
    const res = await fetch(`${API_BASE}/api/master/branches-for-filter`);
    if (!res.ok) return;
    const branches = await res.json();

    const selects = [
      document.getElementById("filterBranch"),
      document.getElementById("draftFilterBranch")
    ];

    selects.forEach(sel => {
      if (!sel) return;
      sel.innerHTML = '<option value="">ทุกสาขา</option>';
      branches.forEach(b => {
        const code  = b.branchCode ?? b;
        const label = b.branchName ? `${b.branchCode} - ${b.branchName}` : code;
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = label;
        sel.appendChild(opt);
      });
    });
  } catch (err) {
    console.error("initializeBranchFilter error:", err);
  }
}

// initializeProductTypes จะเรียก loadImportData เองผ่าน selectTab
// ไม่ต้องเรียก loadImportData() แยกเพื่อป้องกัน race condition
initializeBranchFilter();
initializeProductTypes();

// ============================================
// EXPORT SELLING PRICE EXCEL
// ============================================

async function exportSellingPriceExcel() {
  const productType = document.getElementById("filterProductType")?.value || "";
  const branch      = document.getElementById("filterBranch")?.value || "";
  const searchText  = document.getElementById("filterSku")?.value || "";

  const btn = document.querySelector('button[onclick="exportSellingPriceExcel()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> กำลังนำออก...'; }

  try {
    // ดึงข้อมูลทั้งหมด (limit สูงๆ)
    const params = new URLSearchParams({ page: 1, limit: 99999 });
    if (productType) params.append("productType", productType);
    if (branch)      params.append("branch", branch);
    if (searchText)  params.append("search", searchText);

    const response = await fetch(`${API_BASE}/api/excel/data?${params}`);
    if (!response.ok) { showToast("โหลดข้อมูลไม่สำเร็จ", "error"); return; }

    const { data } = await response.json();
    if (!data || data.length === 0) { showToast("ไม่มีข้อมูลที่จะนำออก", "info"); return; }

    const fmt = v => (v != null && parseFloat(v) !== 0) ? parseFloat(v) : "";

    // สร้าง rows
    const headers = [
      "SKU", "Branch",
      "SDM", "W1", "W2", "R1", "R2"
    ];

    const rows = data.map(r => [
      r.sku || "", r.branch || "",
      fmt(r.sellingPriceSdm), fmt(r.sellingPriceW1), fmt(r.sellingPriceW2), fmt(r.sellingPriceR1), fmt(r.sellingPriceR2)
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // กำหนดความกว้างคอลัมน์
    ws['!cols'] = [
      {wch:22},{wch:8},
      {wch:14},{wch:14},{wch:14},{wch:14},{wch:14}
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ราคาขาย");

    const typeSuffix = productType || "ทุกประเภท";
    const branchSuffix = branch || "ทุกสาขา";
    const today = new Date().toLocaleDateString('th-TH', { dateStyle: 'short' }).replace(/\//g, '-');
    XLSX.writeFile(wb, `ราคาขาย_${typeSuffix}_${branchSuffix}_${today}.xlsx`);

    showToast(`นำออกสำเร็จ ${data.length.toLocaleString()} รายการ`, "success");

  } catch (err) {
    console.error("exportSellingPriceExcel error:", err);
    showToast("เกิดข้อผิดพลาด: " + err.message, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-arrow-down"></i> นำออกราคาขาย'; }
  }
}

// ============================================
// CHECK PENDING DRAFT ON TAB CHANGE
// ============================================

async function checkPendingDraft(productType) {
  // ซ่อน draft panel และลบ banner เก่าออกก่อนเสมอ (อาจเป็น tab อื่น)
  closeDraftPanel();
  document.getElementById('draftBanner')?.remove();

  try {
    const response = await fetch(`${API_BASE}/api/excel/pending-draft?productType=${encodeURIComponent(productType)}`);
    if (!response.ok) return;
    const drafts = await response.json();

    // เอาเฉพาะ draft ที่มีข้อมูลจริง (draftCount > 0)
    const activeDraft = drafts.find(d => d.draftCount > 0);
    if (!activeDraft) return;

    // แสดง banner แจ้งเตือน
    showDraftBanner(activeDraft);
  } catch (err) {
    console.error('checkPendingDraft error:', err);
  }
}

function showDraftBanner(draft) {
  // ลบ banner เก่าออกก่อน
  document.getElementById('draftBanner')?.remove();

  const date = new Date(draft.importedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  const banner = document.createElement('div');
  banner.id = 'draftBanner';
  banner.className = 'w-full bg-orange-50 border border-orange-300 rounded p-3 mb-4 flex items-center justify-between gap-3 text-sm';
  banner.innerHTML = `
    <div class="flex items-center gap-2">
      <i class="bi bi-exclamation-triangle-fill text-orange-500"></i>
      <span class="text-orange-800">
        มี Draft ค้างอยู่: <span class="font-mono font-semibold">${draft.versionLabel || draft.id}</span>
        (${draft.draftCount.toLocaleString()} แถว · อัปโหลดเมื่อ ${date})
        — ยังไม่ได้ประกาศใช้
      </span>
    </div>
    <div class="flex gap-2 shrink-0">
      <button onclick="openDraftPanel(${draft.id}, '${draft.versionLabel || draft.id}')"
        class="px-3 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600 font-medium">
        <i class="bi bi-pencil"></i> ดู/แก้ไข Draft
      </button>
      <button onclick="discardDraftById(${draft.id})"
        class="px-3 py-1 bg-white border border-orange-300 text-orange-600 rounded text-xs hover:bg-orange-50">
        <i class="bi bi-trash"></i> ยกเลิก
      </button>
    </div>
  `;

  // แทรก banner ก่อน upload section
  const uploadSection = document.querySelector('main');
  if (uploadSection) uploadSection.prepend(banner);
}

async function discardDraftById(logId) {
  const confirmed = await showConfirmModal({
    icon: 'trash',
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50',
    title: 'ยกเลิก Draft',
    message: 'ข้อมูลที่ยังไม่ประกาศใช้จะถูกลบออกถาวร',
    confirmText: 'ยกเลิก Draft',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
  });
  if (!confirmed) return;
  try {
    const response = await fetch(`${API_BASE}/api/excel/draft/${logId}`, { method: 'DELETE' });
    if (response.ok) {
      document.getElementById('draftBanner')?.remove();
      showToast('ยกเลิก Draft สำเร็จ', 'success');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}

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

  tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-gray-400 text-sm">กำลังโหลด...</td></tr>`;

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
        <td class="text-right">${fmtPct(row.discountPct3, row.discountPrice2, row.discountPrice3)}</td>
        ${draftPriceCell('discount_price_3', row.discountPrice3, row.id)}
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
  const confirmed = await showConfirmModal({
    icon: 'check-circle',
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
    title: 'ประกาศใช้ข้อมูล',
    message: 'ข้อมูลจะถูกนำไปแสดงในระบบทันที ไม่สามารถย้อนกลับได้',
    confirmText: 'ประกาศใช้',
    confirmClass: 'bg-green-600 hover:bg-green-700 text-white',
  });
  if (!confirmed) return;

  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
  overlay.innerHTML = `<div class="bg-white rounded-xl px-8 py-6 flex items-center gap-4 shadow-xl">
    <svg class="animate-spin w-8 h-8 text-green-600" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3"/>
      <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
    </svg>
    <span class="font-medium text-gray-700">กำลังประกาศใช้...</span>
  </div>`;
  document.body.appendChild(overlay);

  try {
    const response = await fetch(`${API_BASE}/api/excel/draft/${currentDraftLogId}/publish`, { method: 'POST' });
    const result = await response.json();
    if (response.ok) {
      showToast(`ประกาศใช้สำเร็จ! ${result.published} แถว`, 'success');
      closeDraftPanel();
      document.getElementById('draftBanner')?.remove();
      loadImportData();
    } else {
      showToast(`ประกาศใช้ไม่สำเร็จ: ${result.message}`, 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  } finally {
    overlay.remove();
  }
}

async function discardDraft() {
  if (!currentDraftLogId) return;
  const confirmed = await showConfirmModal({
    icon: 'trash',
    iconColor: 'text-red-500',
    iconBg: 'bg-red-50',
    title: 'ยกเลิก Draft',
    message: 'ข้อมูลที่ยังไม่ประกาศใช้จะถูกลบออกถาวร',
    confirmText: 'ยกเลิก Draft',
    confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
  });
  if (!confirmed) return;

  try {
    const response = await fetch(`${API_BASE}/api/excel/draft/${currentDraftLogId}`, { method: 'DELETE' });
    if (response.ok) {
      showToast('ยกเลิก Draft สำเร็จ', 'success');
      closeDraftPanel();
      document.getElementById('draftBanner')?.remove();
    } else {
      showToast('ยกเลิกไม่สำเร็จ', 'error');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาด', 'error');
  }
}
