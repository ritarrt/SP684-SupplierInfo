console.log("🔥 supplier-history.js VERSION 2026-01-24 FIXED");

// ===============================
// LABEL MAPPING (TH)
// ===============================
const BILLING_CYCLE_LABEL = {
  monthly: "รายเดือน",
  biweekly: "ทุก 2 สัปดาห์",
  weekly: "รายสัปดาห์",
  per_order: "วางบิลต่อใบสัง",
};

const CREDIT_TYPE_LABEL = {
  credit: "เครดิต",
  cash: "เงินสด",
  lc: "L/C",
};


/**
 * supplier-history.js
 * -------------------
 * - Handle history tabs
 * - Render product & special terms history (grid)
 * - Called from supplier-info-script.js
 */

/**
 * INIT ENTRY
 * @param {string} noteNo
 */
function initSupplierHistory(supplierNo) {
  console.log("✅ initSupplierHistory", supplierNo);

  if (!supplierNo) {
    console.warn("⚠️ supplierNo not provided to initSupplierHistory()");
    return;
  }

  initHistoryTabs();
  loadContactHistory(supplierNo);
  loadProductHistory(supplierNo);
  loadTermsHistory(supplierNo);
  //loadMoqHistory(supplierNo); // ⭐ 
}

/* =====================================================
   TAB SWITCHING
   ===================================================== */
function initHistoryTabs() {
  const panel = document.getElementById("supplierHistoryPanel");
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-history-tab]");
    if (!btn) return;

    const tab = btn.dataset.historyTab;

    panel.querySelectorAll(".tab-btn").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );

    panel.querySelectorAll(".history-pane").forEach((pane) =>
      pane.classList.toggle("hidden", pane.id !== "history-" + tab)
    );
  });
}

/* =====================================================
   PRODUCT HISTORY
   ===================================================== */
async function loadProductHistory(supplierNo) {
  // Show loading indicator
  showLoadingIndicator("productHistoryGrid", "กำลังโหลดประวัติสินค้า...");
  
  try {
    const res = await fetch(
      `${window.API_BASE}/api/suppliers/${supplierNo}/product-coverage/history?limit=10`
    );

    if (!res.ok) throw new Error("โหลดประวัติสินค้าไม่สำเร็จ");

    const data = await res.json();
    
    // Clear loading indicator
    hideLoadingIndicator("productHistoryGrid");

    const mapped = data.map(row => ({
      id: row.id,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      items: Array.isArray(row.items) ? row.items : []
    }));

    renderProductHistory(mapped);

  } catch (err) {
    console.error(err);
    document.getElementById("productHistoryGrid").innerHTML = `
      <div class="text-sm text-red-500 py-4 text-center">
        โหลดประวัติสินค้าไม่สำเร็จ
      </div>
    `;
  }
}

function renderProductHistory(list) {
  const container = document.getElementById("productHistoryGrid");
  if (!container) return;

  container.innerHTML = "";

  if (!list.length) {
    container.innerHTML = `
      <div class="text-sm text-gray-500 py-4 text-center">
        ไม่พบประวัติการบันทึกสินค้า
      </div>
    `;
    return;
  }

  list.forEach(history => {
    const items = Array.isArray(history.items) ? history.items : [];
    const dateStr = formatDate(history.createdAt);
    const timeStr = formatTime(history.createdAt);

    // snapshot ว่าง
    if (!items.length) {
      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="grid grid-cols-11 gap-2 items-center py-2 text-sm text-gray-500">
          <div class="col-span-2">
            <div class="font-medium">${dateStr}</div>
            <div class="text-xs">${timeStr}</div>
          </div>
          <div class="col-span-4 italic">
            Snapshot (ไม่มีรายการสินค้า)
          </div>
          <div class="col-span-2 text-center">-</div>
          <div class="col-span-2 text-center">-</div>
          <div class="col-span-1">${history.createdBy || "-"}</div>
        </div>
        `
      );
      return;
    }

    // snapshot มีสินค้า
    items.forEach((it, idx) => {
      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="grid grid-cols-11 gap-2 items-center py-2 text-sm">
          <div class="col-span-2">
            ${
              idx === 0
                ? `<div class="font-medium">${dateStr}</div>
                   <div class="text-xs text-gray-400">${timeStr}</div>`
                : ""
            }
          </div>

          <!-- สินค้า / รายละเอียด -->
          <div class="col-span-4">
            <div class="font-medium text-gray-800">
              ${it.category_name || it.category || "-"}
            </div>
            <div class="text-xs text-gray-500">
              ${[
                it.brand_name || it.brand,
                it.SUBGROUP_NAME || it.subGroup
              ].filter(Boolean).join(" / ")}
            </div>
          </div>

          <!-- กลุ่ม -->
          <div class="col-span-2">
            ${it.group_name || it.group || "-"}
          </div>

          <!-- SKU -->
          <div class="col-span-2">
            ${it.sku || "-"}
          </div>

          <!-- ผู้บันทึก -->
          <div class="col-span-1 text-xs text-gray-600">
            ${history.createdBy || "-"}
          </div>
        </div>
        `
      );
    });
  });
}


/* =====================================================
   SPECIAL TERMS HISTORY (REAL)
   ===================================================== */
async function loadTermsHistory(supplierNo) {
  // Show loading indicator
  showLoadingIndicator("termsHistoryGrid", "กำลังโหลดประวัติเงื่อนไขพิเศษ...");
  
  try {
    const res = await fetch(
      `${window.API_BASE}/api/suppliers/${supplierNo}/special-terms/history`
    );

    if (!res.ok) throw new Error("โหลดประวัติเงื่อนไขพิเศษไม่สำเร็จ");

    const data = await res.json();
    
    // Clear loading indicator
    hideLoadingIndicator("termsHistoryGrid");

const mapped = data.map(row => {
  const terms = row.payload?.terms || {};
  const finance = terms.finance || {};
  const claim = terms.claim || {};

  return {
    date: row.createdAt,
    detail: buildFinanceText(finance),
    subDetail: [
      buildFinanceSubText(finance),
      buildClaimText(claim)
    ].filter(Boolean).join(" | "),
    type: finance.creditTerm ? "เครดิต" : "เงินสด",
    user: row.createdBy
  };
});


    renderTermsHistory(mapped);
  } catch (err) {
    console.error(err);
    document.getElementById("termsHistoryGrid").innerHTML = `
      <div class="text-sm text-red-500 py-4 text-center">
        โหลดประวัติเงื่อนไขพิเศษไม่สำเร็จ
      </div>
    `;
  }
}


function renderTermsHistory(list) {
  const container = document.getElementById("termsHistoryGrid");
  if (!container) return;

  container.innerHTML = "";

  if (!list.length) {
    container.innerHTML = `
      <div class="text-sm text-gray-500 py-4 text-center">
        ไม่พบประวัติเงื่อนไขพิเศษ
      </div>
    `;
    return;
  }

  list.forEach((item) => {
    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="grid grid-cols-11 gap-2 items-center py-2 text-sm">
        <div class="col-span-2">
          <div class="font-medium">${formatDate(item.date)}</div>
          <div class="text-xs text-gray-400">${item.time || ""}</div>
        </div>

        <div class="col-span-6">
          <div class="font-medium">${item.detail}</div>
          <div class="text-xs text-gray-500">${item.subDetail || ""}</div>
        </div>

        <div class="col-span-2">${item.type}</div>
        <div class="col-span-1 text-xs text-gray-600">${item.user}</div>
      </div>
      `
    );
  });
}

/* =====================================================
   HELPERS
   ===================================================== */
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);

  return isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("th-TH", {
        timeZone: "Asia/Bangkok", // ⭐
      });
}


function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);

  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok", // ⭐ ตัวนี้
      });
}


/* =====================================================
   ACTION
   ===================================================== */
async function viewProductHistoryDetail(historyId) {
  const supplierNo = getSupplierNoFromURL();

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/product-coverage/history/${historyId}`
  );

  const data = await res.json();

  loadProductCoverageFromHistory(data);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// expose
window.initSupplierHistory = initSupplierHistory;

function buildFinanceText(finance) {
  if (!finance) return "-";

  const parts = [];

  // ประเภทเครดิต (ใช้ mapping)
  const creditType = finance.creditType || "credit";
  parts.push(CREDIT_TYPE_LABEL[creditType] || "เครดิต");

  // จำนวนวันเครดิต
  if (finance.creditTerm) {
    parts.push(`${finance.creditTerm} วัน`);
  }

  // วงเงิน (ถ้ามี)
  if (finance.creditLimit) {
    parts.push(
      `วงเงิน ${Number(finance.creditLimit).toLocaleString()} บาท`
    );
  }

  return parts.join(" ");
}

function buildFinanceSubText(finance) {
  if (!finance?.billingCycle) return "";

  // แปลรอบวางบิล / รอบคิดเงิน
  return BILLING_CYCLE_LABEL[finance.billingCycle] || finance.billingCycle;
}

function buildClaimText(claim) {
  if (!claim) return "";

  const lines = [];

  if (claim.period) {
    lines.push(`ระยะเวลารับเคลม: ${claim.period}`);
  }

  if (claim.condition) {
    lines.push(`เงื่อนไข: ${claim.condition}`);
  }

  if (claim.note) {
    lines.push(`หมายเหตุ: ${claim.note}`);
  }

  return lines.join(" • ");
}

async function loadContactHistory(supplierNo) {
  // Show loading indicator
  showLoadingIndicator("history-contacts", "กำลังโหลดรายชื่อผู้ติดต่อ...");
  
  try {
    const res = await fetch(
      `${window.API_BASE}/api/suppliers/${supplierNo}/contacts`
    );

    if (!res.ok) throw new Error("โหลดรายชื่อผู้ติดต่อไม่สำเร็จ");

    const data = await res.json();
    
    // Clear loading indicator
    hideLoadingIndicator("history-contacts");
    
    renderContactHistory(data);

  } catch (err) {
    console.error(err);
    document.getElementById("history-contacts").innerHTML = `
      <div class="text-sm text-red-500 py-4 text-center">
        โหลดรายชื่อผู้ติดต่อไม่สำเร็จ
      </div>
    `;
  }
}

function renderContactHistory(list) {
  const container = document.getElementById("history-contacts");
  if (!container) return;

  container.innerHTML = "";

  if (!list || !list.length) {
    container.innerHTML = `
      <div class="text-sm text-gray-500">
        ยังไม่มีรายชื่อผู้ติดต่อ
      </div>
    `;
    return;
  }

  list.forEach(c => {
    const isCancelled = c.status === "CANCELLED";

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="
        border rounded px-4 py-3 mb-3 text-sm
        ${isCancelled ? "bg-gray-100 opacity-70" : "bg-white"}
      ">
        <div class="flex justify-between items-start">
          
          <!-- LEFT -->
          <div>
            <div class="font-medium text-gray-800">
              ${c.name || "-"}
              ${
                isCancelled
                  ? `<span class="ml-2 text-xs px-2 py-0.5 rounded bg-gray-400 text-white">
                       ยกเลิกแล้ว
                     </span>`
                  : ""
              }
            </div>

            <div class="text-xs text-gray-500 mt-1">
              ${[
                c.position,
                c.region,
                c.province,
                c.brand,
                c.product_group
              ].filter(Boolean).join(" | ")}
            </div>

            <div class="text-xs text-gray-400 mt-1">
              📧 ${c.email || "-"}
              &nbsp;|&nbsp;
              📞 ${c.phones || "-"}
            </div>

            ${
              c.start_date
                ? `<div class="text-xs text-gray-400 mt-1">
                     เริ่มติดต่อ: ${formatDate(c.start_date)}
                   </div>`
                : ""
            }
          </div>

          <!-- RIGHT -->
          <div>
            ${
              !isCancelled
                ? `<button
                     class="text-xs text-red-600 hover:underline"
                     onclick="cancelContact(${c.id})">
                     ยกเลิก
                   </button>`
                : ""
            }
          </div>
        </div>
      </div>
      `
    );
  });
}

async function cancelContact(id) {
  if (!confirm("ยืนยันการยกเลิกผู้ติดต่อรายนี้?")) return;

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/contacts/${id}/cancel`,
    { method: "PATCH" }
  );

  if (!res.ok) {
    alert("ยกเลิกไม่สำเร็จ");
    return;
  }

  const supplierNo = getSupplierNoFromURL();
  loadContactHistory(supplierNo);
}

window.cancelContact = cancelContact;



// expose

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
window.loadContactHistory = loadContactHistory;
