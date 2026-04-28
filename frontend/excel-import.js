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

  // โหลดข้อมูลตาราง — ไม่ผูก filter กับ tab เพื่อให้แสดงข้อมูลทั้งหมด
  loadImportData(1);
}

// ============================================
// FILE UPLOAD HANDLING
// ============================================

dropzone.addEventListener("click", () => fileInput.click());

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

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
  
  // For Gypsum, show preview from backend
  if (currentTab === "Gypsum") {
    loadGypsumPreview();
    return;
  }
  
  // For other types, show preview
  renderTable(currentData);
}

async function loadGypsumPreview() {
  try {
    // Read original file as base64
    const excelBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const bytes = new Uint8Array(e.target.result);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        resolve(btoa(binary));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(currentFile);
    });

    const response = await fetch(`${API_BASE}/api/excel/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sheetName: currentSheetName,
        productType: currentTab,
        excelBuffer: excelBuffer
      })
    });

    if (!response.ok) {
      const error = await response.json();
      showStatus(`ข้อผิดพลาด: ${error.message}`, "error");
      return;
    }

    const result = await response.json();
    
    if (result.success && result.preview && result.preview.length > 0) {
      renderGypsumPreview(result);
    } else {
      showStatus("ไม่พบข้อมูลที่จะนำเข้า", "warning");
      dataTable.querySelector("thead").innerHTML = "";
      dataTable.querySelector("tbody").innerHTML = `
        <tr>
          <td colspan="100" class="py-6 text-center text-gray-600">
            ไม่พบข้อมูลที่จะนำเข้า
          </td>
        </tr>
      `;
    }
  } catch (err) {
    console.error("Preview error:", err);
    showStatus("เกิดข้อผิดพลาดในการโหลด preview", "error");
  }
}

function renderGypsumPreview(result) {
  const { preview, totalSkus, totalRows, branches } = result;
  const thead = dataTable.querySelector("thead");
  const tbody = dataTable.querySelector("tbody");
  
  // Build table header - แสดงคอลัมน์ที่จะเก็บจริงใน DB
  thead.innerHTML = `
    <tr class="text-xs">
      <th rowspan="2">SKU</th>
      <th rowspan="2">ชื่อสินค้า</th>
      <th rowspan="2">ยี่ห้อ</th>
      <th rowspan="2">สาขา<br/>(ตัวอย่าง)</th>
      <th colspan="4" class="bg-blue-50">ราคา</th>
      <th colspan="4" class="bg-green-50">ราคาขาย</th>
      <th colspan="2" class="bg-yellow-50">ส่วนลด %</th>
    </tr>
    <tr class="text-xs">
      <th class="bg-blue-50">base_price</th>
      <th class="bg-blue-50">discount_price_1</th>
      <th class="bg-blue-50">discount_price_2</th>
      <th class="bg-blue-50">discount_price_3</th>
      <th class="bg-green-50">selling_price_w1</th>
      <th class="bg-green-50">selling_price_w2</th>
      <th class="bg-green-50">selling_price_r1</th>
      <th class="bg-green-50">selling_price_r2</th>
      <th class="bg-yellow-50">discount_pct_1</th>
      <th class="bg-yellow-50">discount_pct_2</th>
    </tr>
  `;
  
  // Build table body
  tbody.innerHTML = "";
  preview.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "text-sm";
    tr.innerHTML = `
      <td class="font-mono text-xs">${row.sku}</td>
      <td>${row.productName}</td>
      <td class="text-gray-600">${row.brand || '-'}</td>
      <td>${row.branch}</td>
      <td class="text-right">${row.base_price.toFixed(2)}</td>
      <td class="text-right">${row.discount_price_1.toFixed(2)}</td>
      <td class="text-right text-gray-400">${row.discount_price_2.toFixed(2)}</td>
      <td class="text-right text-gray-400">${row.discount_price_3.toFixed(2)}</td>
      <td class="text-right">${row.selling_price_w1.toFixed(2)}</td>
      <td class="text-right">${row.selling_price_w2.toFixed(2)}</td>
      <td class="text-right">${row.selling_price_r1.toFixed(2)}</td>
      <td class="text-right">${row.selling_price_r2.toFixed(2)}</td>
      <td class="text-right">${(row.discount_pct_1 * 100).toFixed(2)}%</td>
      <td class="text-right">${(row.discount_pct_2 * 100).toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  });
  
  // Show summary
  rowCount.innerHTML = `
    <div class="space-y-2 text-sm">
      <div class="text-lg font-semibold text-blue-600">📊 สรุปข้อมูลที่จะนำเข้า</div>
      <div class="grid grid-cols-2 gap-2 mt-2">
        <div><strong>ตาราง:</strong> excel_import_data</div>
        <div><strong>จำนวน SKU:</strong> ${totalSkus} SKU</div>
        <div><strong>จำนวนสาขา:</strong> ${branches.length} สาขา</div>
        <div><strong>รวมแถวทั้งหมด:</strong> ${totalRows} แถว</div>
      </div>
      <div class="mt-3 p-3 bg-gray-50 rounded">
        <strong>สาขาทั้งหมด (${branches.length}):</strong>
        <div class="text-xs mt-1 text-gray-600">${branches.join(', ')}</div>
      </div>
      <div class="mt-3 p-3 bg-blue-50 rounded text-xs">
        <strong>💾 คอลัมน์ที่จะบันทึก:</strong>
        <ul class="list-disc list-inside mt-1 space-y-0.5">
          <li><strong>ข้อมูลพื้นฐาน:</strong> branch, product_type, sku, product_name, brand, unit</li>
          <li><strong>ราคา:</strong> base_price, discount_price_1/2/3</li>
          <li><strong>ราคาขาย:</strong> selling_price_w1/w2/r1/r2</li>
          <li><strong>ส่วนลด:</strong> discount_pct_1/2 (เปอร์เซ็นต์)</li>
          <li><strong>อื่นๆ:</strong> project_no, project_discount_1/2, project_price, carton_price, shipping_cost, free_item</li>
          <li><strong>อัตโนมัติ:</strong> created_at, updated_at</li>
        </ul>
      </div>
      <div class="mt-2 text-xs text-gray-500">
        * แสดง ${preview.length} SKU แรก (สาขา ${branches[0]} เป็นตัวอย่าง)
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
  
  importBtn.disabled = true;
  importBtn.innerHTML = '<i class="bi bi-hourglass-split animate-spin"></i> กำลังนำเข้า...';
  
  try {
    // Read original file as base64 (not re-written workbook)
    const excelBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const bytes = new Uint8Array(e.target.result);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        resolve(btoa(binary));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(currentFile);
    });
    
    console.log('Sending import request:', {
      sheetName: currentSheetName,
      productType: currentTab,
      dataRows: currentData.length,
      availableSheets: currentWorkbook.SheetNames
    });
    
    const response = await fetch(`${API_BASE}/api/excel/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sheetName: currentSheetName,
        productType: currentTab,
        data: currentData,
        excelBuffer: excelBuffer,
        availableSheets: currentWorkbook.SheetNames
      }),
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showStatus(`นำเข้าข้อมูลสำเร็จ! (${result.imported} แถว)`, "success");
      clearData();
      loadImportData(); // refresh data view
    } else {
      showStatus(`เกิดข้อผิดพลาด: ${result.message}`, "error");
    }
    
  } catch (err) {
    showStatus("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
    console.error(err);
  } finally {
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

      // Editable price cell
      const priceCell = (field, value) => `
        <td class="text-right">
          <span 
            class="editable-price cursor-pointer hover:bg-yellow-50 hover:text-blue-600 px-1 rounded"
            data-id="${row.id}"
            data-field="${field}"
            data-value="${value != null ? parseFloat(value) : 0}"
            onclick="startEditPrice(this)"
          >${fmt(value)}</span>
        </td>
      `;

      return `
        <tr>
          <td><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">${row.productType || '-'}</span></td>
          <td class="font-mono text-xs">${row.sku || '-'}</td>
          <td>${row.productName || '-'}</td>
          <td class="text-gray-600">${row.brand || '-'}</td>
          <td><span class="font-medium">${row.branch || '-'}</span></td>
          ${priceCell('base_price', row.basePrice)}
          <td class="text-right text-orange-600 font-medium">${row.discountPct1 ? (row.discountPct1 * 100).toFixed(1) + '%' : '-'}</td>
          ${priceCell('discount_price_1', row.discountPrice1)}
          <td class="text-right text-orange-600 font-medium">${row.discountPct2 ? (row.discountPct2 * 100).toFixed(1) + '%' : '-'}</td>
          <td class="text-right text-gray-400">${row.discountPct2 ? fmt(row.discountPrice2) : '-'}</td>
          <td class="text-right text-orange-600 font-medium">${row.discountPct3 ? (row.discountPct3 * 100).toFixed(1) + '%' : '-'}</td>
          <td class="text-right text-gray-400">${row.discountPct3 ? fmt(row.discountPrice3) : '-'}</td>
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
