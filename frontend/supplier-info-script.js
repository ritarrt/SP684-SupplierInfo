// ===== Global Supplier No =====
window.supplierNo =
  new URLSearchParams(window.location.search).get("id") || null;

if (!window.supplierNo) {
  console.warn("❌ supplierNo not found in URL");
}
console.log("supplier-info-script.js loaded");

// ===================================================
// TABS
// ===================================================
  (function initTabs() {
      const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
      const panes = Array.from(document.querySelectorAll('.tab-pane'));

      function activate(tabId) {
        tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        panes.forEach(p => p.classList.toggle('active', p.id === tabId));

        // Show loading for target tab when first activated
        if (tabId === 'pills-target' && window.supplierNo) {
          if (typeof window.loadTargetTable === 'function') {
            window.loadTargetTable();
          }
        }
      }

      window.activateTab = activate;

      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => activate(btn.dataset.tab));
      });
    })();

// ===================================================
// PAGE INIT
// ===================================================
document.addEventListener("DOMContentLoaded", () => {
  const supplierNo = getSupplierNoFromURL();
  addPhoneRow();

  const activeTab = sessionStorage.getItem("activeTab");
  if (activeTab) {
    sessionStorage.removeItem("activeTab");
    setTimeout(() => activateTab(activeTab), 100);
  }

  if (!supplierNo) {
    console.warn("❌ ไม่พบ supplierNo ใน URL");
    return;
  }

  // ===============================
  // LOAD MAIN SECTIONS
  // ===============================
  loadSupplierBasicInfo(supplierNo);
  loadSpecialTermsCurrent(supplierNo);


  loadLatestCoverageFromHistory(supplierNo);
  // ⭐⭐⭐ เพิ่มบรรทัดนี้เท่านั้น ⭐⭐⭐
  loadSupplierHistory(supplierNo);

  loadSupplierDocuments(supplierNo, "basic");
  loadSupplierDocuments(supplierNo, "document");
  // ===============================
  // GLOBAL CLICK HANDLER
  // ===============================
  
});


// ===================================================

function addPhoneRow() {
  const container = document.getElementById("phoneContainer");

  const row = document.createElement("div");
  row.className = "flex gap-2 items-center mb-2";

  row.innerHTML = `
    <input
      type="text"
      class="form-control phone-input"
      placeholder="เบอร์โทรศัพท์"
      required
    />
    <button
      type="button"
      class="btn btn-outline-danger btn-sm"
      onclick="this.parentElement.remove()"
    >
      <i class="bi bi-x"></i>
    </button>
  `;

  container.appendChild(row);
}

// Expose addPhoneRow globally for Excel import
window.addPhoneRow = addPhoneRow;

// ===================================================

// ---------------------------------------------------
// อ่าน supplierNo จาก query string
// ---------------------------------------------------
function getSupplierNoFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// ---------------------------------------------------
// ดึงข้อมูล Supplier (ชื่อ)
// ---------------------------------------------------
async function loadSupplierBasicInfo(supplierNo) {
  try {
    console.log("📡 Fetch supplier:", supplierNo);

    const res = await fetch(
      `${API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const supplier = await res.json();
    console.log("✅ Supplier response:", supplier);

    renderSupplierName(supplier);
  } catch (err) {
    console.error("❌ Load supplier error:", err);
  }
}

// ---------------------------------------------------
// Render ชื่อ Supplier
// ---------------------------------------------------
function renderSupplierName(supplier) {
  // ชื่อบน header
  const nameEl = document.getElementById("supplierName");
  if (nameEl) nameEl.textContent = supplier.name || "-";

  // รหัสผู้ขาย
  const codeEl = document.getElementById("supplierCode");
  if (codeEl) codeEl.value = supplier.supplierNo || "";

  // เลขประจำตัวผู้เสียภาษี
  document.getElementById("taxId").value =
  supplier.vatRegistrationNo || "";

  // ที่อยู่จดทะเบียน
  const addrEl = document.getElementById("registeredAddress");
  if (addrEl) addrEl.value = supplier.registeredAddress || "";

  // ประเภทสถานที่
  const locationEl = document.getElementById("locationType");
  if (locationEl) locationEl.value = supplier.locationType || "";

  // email
  const emailEl = document.getElementById("email");
  if (emailEl) emailEl.value = supplier.email || "";

  // mobile phone
  const mobileEl = document.getElementById("mobilePhone");
  if (mobileEl) mobileEl.value = supplier.mobilePhone || "";

  // currency
  const currencyEl = document.getElementById("currencyCode");
  if (currencyEl) currencyEl.value = supplier.currencyCode || "";

  // payment terms
  const paymentEl = document.getElementById("paymentTermsCode");
  if (paymentEl) paymentEl.value = supplier.paymentTermsCode || "";

  // purchaser
  const purchaserEl = document.getElementById("purchaserCode");
  if (purchaserEl) purchaserEl.value = supplier.purchaserCode || "";

  // country
  const countryEl = document.getElementById("countryCode");
  if (countryEl) countryEl.value = supplier.countryCode || "";
}

// ---------------------------------------------------
// Go back to Supplier List
// ---------------------------------------------------
function goBackToSupplierList() {
  window.location.href = "/supplier-list.html";
}



// ===================================================
// TOAST
// ===================================================
function showSaveMessage(text, isError = false) {
  const el = document.getElementById("saveMessage");
  if (!el) return;

  el.textContent = text;

  el.classList.remove("hidden");
  el.classList.toggle("bg-green-600", !isError);
  el.classList.toggle("bg-red-600", isError);

  setTimeout(() => {
    el.classList.add("hidden");
  }, 2500);
}

// Make showSaveMessage globally available for modules
window.showSaveMessage = showSaveMessage;

function addPaymentRow() {
  const container = document.getElementById("paymentMethodContainer");
  if (!container) {
    console.error("❌ ไม่พบ paymentMethodContainer");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="payment-row grid grid-cols-12 gap-2 items-center">
      <div class="col-span-12 md:col-span-3">
        <select class="form-select payment-method-select">
          <option value="">ทั้งหมด</option>
          <option value="transfer">โอนเงิน</option>
          <option value="cash">เงินสด</option>
          <option value="cheque">เช็ค</option>
          <option value="credit_note">หัก Credit Note</option>
        </select>
      </div>

      <div class="col-span-12 md:col-span-3">
        <input
          type="text"
          class="form-control bank-input"
          placeholder="เช่น SCB / KBank"
        />
      </div>

      <div class="col-span-12 md:col-span-3">
        <input
          type="text"
          class="form-control account-input"
          placeholder="xxx-x-xxxxx-x"
        />
      </div>

      <div class="col-span-12 md:col-span-2">
        <input
          type="text"
          class="form-control account-name-input"
          placeholder="ชื่อบัญชี"
        />
      </div>

      <div class="col-span-12 md:col-span-1 text-center">
        <button
          type="button"
          class="btn btn-outline-danger btn-sm"
          onclick="removePaymentRow(this)"
        >
          <i class="bi bi-x"></i>
        </button>
      </div>
    </div>
  `;

  container.appendChild(wrapper.firstElementChild);
}

function removePaymentRow(btn) {
  const row = btn.closest(".payment-row");
  if (!row) return;

  const container = document.getElementById("paymentMethodContainer");
  if (!container) return;

  const rows = container.querySelectorAll(".payment-row");

  // ✅ ถ้าคุณต้องการ "ห้ามลบแถวสุดท้าย"
  if (rows.length <= 1) {
    // ไม่ใช้ popup ตามที่คุณต้องการ
    console.warn("ต้องมีอย่างน้อย 1 วิธีการชำระเงิน");
    return;
  }

  row.remove();
}


// ===================================================
// LOAD SUPPLIER HISTORY COMPONENT
// ===================================================


  function loadSupplierHistory(supplierNo) {
  if (!supplierNo) {
    console.warn("loadSupplierHistory called without supplierNo");
    return;
  }

  fetch("./components/supplier-history.html")
    .then(res => res.text())
    .then(html => {
      const container = document.getElementById("supplierHistoryContainer");
      if (!container) {
        console.warn("supplierHistoryContainer not found");
        return;
      }

      container.innerHTML = html;

      if (window.initSupplierHistory) {
        window.initSupplierHistory(supplierNo);
      } else {
        console.error("❌ initSupplierHistory not found");
      }
    })
    .catch(err => {
      console.error("❌ loadSupplierHistory failed", err);
    });
}

function toggleDealSpecialMode() {
  const mode = document.getElementById("dealSpecialMode").value;
  const stepBox = document.getElementById("dealSpecialStepContainer");
  const addBtn = document.getElementById("dealAddStepBtn");

  if (mode === "step") {
    stepBox.classList.remove("hidden");
    addBtn.classList.remove("hidden");

    if (stepBox.children.length === 0) {
      addDealSpecialStep();
    }
  } else {
    stepBox.classList.add("hidden");
    addBtn.classList.add("hidden");
    stepBox.innerHTML = "";
  }
}


function addDealSpecialStep() {
  const container = document.getElementById("dealSpecialStepContainer");
  const unit = document.getElementById("dealSpecialUnit").value;
  const index = container.children.length + 1;

  const row = document.createElement("div");
  row.className = "grid grid-cols-12 gap-2 items-center";

  row.innerHTML = `
    <div class="col-span-2 text-sm text-gray-500">
      Step ${index}
    </div>

    <div class="col-span-4">
      <input
        type="number"
        class="form-control"
        placeholder="ตั้งแต่"
      >
    </div>

    <div class="col-span-4">
      <input
        type="number"
        class="form-control"
        placeholder="ราคาพิเศษ"
      >
    </div>

    <div class="col-span-1 text-xs text-gray-500">
      ${unit}
    </div>

    <div class="col-span-1 text-center">
      <button
        type="button"
        class="btn btn-outline-danger btn-sm"
        onclick="this.closest('.grid').remove()"
      >
        <i class="bi bi-x"></i>
      </button>
    </div>
  `;

  container.appendChild(row);
}


document
  .getElementById("submitSpecialTermsBtn")
  ?.addEventListener("click", () => {
    window.saveProductAndSpecialTerms();
  });

