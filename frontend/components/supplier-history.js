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
  console.log("✅ initSupplierHistory called", supplierNo);
  
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
    console.log("📑 Tab clicked:", tab);

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
      `${window.API_BASE}/api/suppliers/${supplierNo}/product-coverage/history?limit=20`
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
      <div class="text-sm text-gray-500 py-2 text-center">
        ไม่พบประวัติการบันทึกสินค้า
      </div>
    `;
    return;
  }

  list.forEach(history => {
    const items = Array.isArray(history.items) ? history.items : [];
    const dateStr = formatDate(history.createdAt);
    const timeStr = formatTime(history.createdAt);

    if (!items.length) {
      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="border rounded p-2 mb-1 bg-gray-50 text-sm">
          <span class="text-gray-500">${dateStr} ${timeStr}</span> - ไม่มีรายการสินค้า
        </div>
        `
      );
      return;
    }

    // Group items by category for better display
    const itemsByCategory = items.reduce((acc, it) => {
      const cat = it.category_name || it.category || "อื่นๆ";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(it);
      return acc;
    }, {});

    Object.entries(itemsByCategory).forEach(([category, catItems], catIdx) => {
      container.insertAdjacentHTML(
        "beforeend",
        `
        <div class="border rounded-lg mb-2 overflow-hidden text-sm">
          <div class="bg-blue-50 px-2 py-1 flex justify-between items-center border-b">
            <div class="font-medium text-blue-700">
              <i class="bi bi-box-seam mr-1"></i>${category}
            </div>
            <div class="flex items-center gap-2">
              <button onclick="viewProductHistoryDetail(${history.id})" 
                      class="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600">
                <i class="bi bi-pencil mr-1"></i>แก้ไข
              </button>
              <span class="text-xs text-gray-500">
                ${dateStr} ${timeStr}
              </span>
            </div>
          </div>
          <div class="p-2 bg-white">
            <div class="grid grid-cols-4 gap-1 text-xs font-semibold text-gray-500 border-b pb-1 mb-1">
              <div class="col-span-1">แบรนด์</div>
              <div class="col-span-1">กลุ่ม</div>
              <div class="col-span-1">กลุ่มย่อย</div>
              <div class="col-span-1">SKU</div>
            </div>
            ${catItems.map(it => `
              <div class="grid grid-cols-4 gap-1 text-xs py-1">
                <div class="col-span-1">
                  <span class="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-xs">
                    ${it.brand_name || it.brand || "-"}
                  </span>
                </div>
                <div class="col-span-1 text-gray-600">${it.group_name || it.group || "-"}</div>
                <div class="col-span-1 text-gray-500">${it.SUBGROUP_NAME || it.subGroup || "-"}</div>
                <div class="col-span-1">
                  ${it.sku 
                    ? `<span class="text-purple-600 font-mono text-xs">${it.sku}</span>` 
                    : `<span class="text-gray-400">-</span>`}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        `
      );
    });
  });
}

/* =====================================================
   SPECIAL TERMS HISTORY (From Current Table)
   ===================================================== */
async function loadTermsHistory(supplierNo) {
  console.log("🔍 loadTermsHistory called with supplierNo:", supplierNo);
  
  // Show loading indicator
  showLoadingIndicator("termsHistoryGrid", "กำลังโหลดประวัติเงื่อนไขพิเศษ...");
  
  try {
    // ดึงจาก History table
    const url = `${window.API_BASE}/api/suppliers/${supplierNo}/special-terms/history?limit=20`;
    console.log("📡 Fetching terms from:", url);
    
    const res = await fetch(url);

    console.log("📡 API response status:", res.status);
    
    if (!res.ok) {
      console.error("❌ API error:", res.status, await res.text());
      throw new Error("โหลดประวัติเงื่อนไขพิเศษไม่สำเร็จ");
    }

    const data = await res.json();
    console.log("📦 API data:", data);
    
    // Clear loading indicator
    hideLoadingIndicator("termsHistoryGrid");

    // ถ้าไม่มีข้อมูล แสดง "ไม่พบ"
    if (!data || data.length === 0) {
      renderTermsHistory([]);
      return;
    }

    // Map ข้อมูลจาก History table
    const mapped = data.map(row => {
      // Parse PayloadJson - could be string or object
      let payload = row.payload || {};
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          payload = {};
        }
      }
      
      const terms = payload?.terms || payload || {};
      const finance = terms.finance || {};
      const paymentMethods = terms.paymentMethods || [];
      const claim = terms.claim || {};

      return {
        date: row.createdAt || row.CreatedAt,
        rawTerms: terms,
        rawPaymentMethods: paymentMethods,
        rawClaim: claim,
        billingCycle: finance.billingCycle || '-',
        creditTerm: finance.creditTerm || '-',
        creditLimit: finance.creditLimit ? `${Number(finance.creditLimit).toLocaleString()} ${finance.creditLimitUnit || 'บาท'}` : '-',
        paymentMethods: paymentMethods.filter(pm => pm.bank || pm.account).map(pm => pm.bank ? `${pm.bank} ${pm.account || ''}` : '-').join(', ') || '-',
        claimPeriod: claim.period || '-',
        claimCondition: claim.condition || '-',
        claimNote: claim.note || '-',
        user: row.createdBy || row.CreatedBy || "-"
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
      <div class="text-sm text-gray-500 py-2 text-center">
        ไม่พบประวัติเงื่อนไขพิเศษ
      </div>
    `;
    return;
  }

  list.forEach((item) => {
    const dateStr = formatDate(item.date);
    const timeStr = formatTime(item.date);
    
    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="border rounded-lg mb-2 overflow-hidden text-sm">
        <div class="bg-gray-50 px-2 py-1.5 flex justify-between items-center border-b">
          <div class="font-medium text-gray-700">
            <i class="bi bi-shield-check mr-1 text-green-600"></i>เงื่อนไขพิเศษ
          </div>
          <div class="flex items-center gap-2">
            <button onclick='restoreTermsToForm(${JSON.stringify(item.rawTerms).replace(/'/g, "&#39;")})' 
                    class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600">
              <i class="bi bi-pencil mr-1"></i>แก้ไข
            </button>
            <span class="text-xs text-gray-500">
              ${dateStr} ${timeStr} • ${item.user}
            </span>
          </div>
        </div>
        <div class="p-2 bg-white">
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div class="text-gray-500">รูปแบบการวางบิล:</div>
            <div class="text-gray-700">${item.billingCycle}</div>
            
            <div class="text-gray-500">เงื่อนไขเครดิต:</div>
            <div class="text-gray-700">${item.creditTerm}</div>
            
            <div class="text-gray-500">วงเงินเครดิต:</div>
            <div class="text-gray-700">${item.creditLimit}</div>
            
            <div class="text-gray-500">วิธีการชำระเงิน:</div>
            <div class="text-gray-700">${item.paymentMethods}</div>
            
            <div class="text-gray-500">ระยะเวลารับเคลม:</div>
            <div class="text-gray-700">${item.claimPeriod}</div>
            
            <div class="text-gray-500">เงื่อนไขการรับเคลม:</div>
            <div class="text-gray-700">${item.claimCondition}</div>
            
            <div class="text-gray-500">หมายเหตุ:</div>
            <div class="text-gray-700">${item.claimNote}</div>
          </div>
        </div>
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
  if (typeof window.loadProductCoverageFromHistoryById === 'function') {
    await window.loadProductCoverageFromHistoryById(historyId);
    
    // Show cancel button
    const cancelBtn = document.getElementById('cancelEditProductBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    
    // Switch to basic tab
    if (typeof window.activateTab === 'function') {
      window.activateTab('pills-basic');
    }
    
    window.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    console.error('loadProductCoverageFromHistoryById not found');
  }
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
    const limitedData = data.slice(0, 20);
    
    // Clear loading indicator
    hideLoadingIndicator("history-contacts");
    
    renderContactHistory(limitedData);

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

    const regionBadges = c.region 
      ? c.region.split(",").filter(Boolean).map(r => 
          `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-xs">${r.trim()}</span>`
        ).join("")
      : "";
    
    const provinceBadges = c.province 
      ? c.province.split(",").filter(Boolean).map(p => 
          `<span class="inline-flex items-center px-1.5 py-0.5 rounded bg-green-50 text-green-600 text-xs">${p.trim()}</span>`
        ).join("")
      : "";

    const brandDisplay = c.brand ? c.brand : "ทั้งหมด";
    const groupDisplay = c.product_group ? c.product_group : "ทั้งหมด";

    container.insertAdjacentHTML(
      "beforeend",
      `
      <div class="
        border rounded px-3 py-2 mb-2 text-sm
        ${isCancelled ? "bg-gray-50 opacity-60" : "bg-white"}
      ">
        <div class="flex justify-between items-start">
          
          <!-- LEFT -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <div class="font-medium text-gray-800">
                ${c.name || "-"}
              </div>
              ${c.position ? `<span class="text-gray-500 text-xs">(${c.position})</span>` : ""}
              ${
                isCancelled
                  ? `<span class="text-xs px-1.5 py-0.5 rounded bg-gray-400 text-white font-medium text-xs">
                       ยกเลิก
                     </span>`
                  : ""
              }
            </div>

            ${regionBadges ? `
              <div class="mt-1">
                <span class="text-xs text-gray-400 mr-1">ภาค:</span>
                ${regionBadges}
              </div>
            ` : `<div class="mt-1"><span class="text-xs text-gray-400 mr-1">ภาค:</span><span class="text-gray-400">ทั้งหมด</span></div>`}

            ${provinceBadges ? `
              <div class="mt-1">
                <span class="text-xs text-gray-400 mr-1">จังหวัด:</span>
                <span class="flex flex-wrap gap-1 inline-flex">${provinceBadges}</span>
              </div>
            ` : `<div class="mt-1"><span class="text-xs text-gray-400 mr-1">จังหวัด:</span><span class="text-gray-400">ทั้งหมด</span></div>`}

            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span class="text-purple-600 font-medium">แบรนด์: ${brandDisplay}</span>
              <span class="text-gray-300">|</span>
              <span class="text-orange-600 font-medium">กลุ่ม: ${groupDisplay}</span>
            </div>

            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              ${c.email ? `<span><i class="bi bi-envelope mr-1"></i>${c.email}</span>` : `<span><i class="bi bi-envelope mr-1"></i>-</span>`}
              ${c.line_id ? `<span><i class="bi bi-line mr-1"></i>${c.line_id}</span>` : `<span><i class="bi bi-line mr-1"></i>-</span>`}
              ${c.phones ? `<span><i class="bi bi-phone mr-1"></i>${c.phones}</span>` : `<span><i class="bi bi-phone mr-1"></i>-</span>`}
              ${c.start_date ? `<span><i class="bi bi-calendar mr-1"></i>${formatDate(c.start_date)}</span>` : `<span><i class="bi bi-calendar mr-1"></i>-</span>`}
            </div>
          </div>

          <!-- RIGHT -->
          <div class="ml-2 flex gap-2">
            ${
              !isCancelled
                ? `<button
                     class="text-xs text-red-600 hover:underline whitespace-nowrap"
                     onclick="cancelContact(${c.id})">
                     ยกเลิก
                   </button>`
                : `<button
                     class="text-xs text-green-600 hover:underline whitespace-nowrap"
                     onclick="reactivateContact(${c.id})">
                     เปิดใช้งาน
                   </button>`
            }
          </div>
        </div>
      </div>
      `
    );
  });
}

function showConfirmModal(title, message, onConfirm) {
  // Remove existing modal if any
  const existing = document.getElementById('confirmModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'confirmModal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black bg-opacity-50" onclick="document.getElementById('confirmModal')?.remove()"></div>
    <div class="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
      <div class="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center">
        <i class="bi bi-exclamation-triangle text-red-500 mr-2"></i>
        <h3 class="text-red-800 font-semibold">${title}</h3>
      </div>
      <div class="p-4">
        <p class="text-gray-600">${message}</p>
      </div>
      <div class="px-4 py-3 bg-gray-50 flex justify-end gap-2">
        <button onclick="document.getElementById('confirmModal')?.remove()" 
                class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
          ยกเลิก
        </button>
        <button id="confirmBtn" 
                class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition">
          ยืนยัน
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('confirmBtn').onclick = () => {
    modal.remove();
    onConfirm();
  };
}

async function cancelContact(id) {
  showConfirmModal('ยกเลิกผู้ติดต่อ', 'คุณต้องการยกเลิกผู้ติดต่อรายนี้ใช่หรือไม่?', async () => {
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
  });
}

async function reactivateContact(id) {
  showConfirmModal('เปิดใช้งานผู้ติดต่อ', 'คุณต้องการเปิดใช้งานผู้ติดต่อรายนี้ใช่หรือไม่?', async () => {
    const res = await fetch(
      `${window.API_BASE}/api/suppliers/contacts/${id}/reactivate`,
      { method: "PATCH" }
    );

    if (!res.ok) {
      alert("เปิดใช้งานไม่สำเร็จ");
      return;
    }

    const supplierNo = getSupplierNoFromURL();
    loadContactHistory(supplierNo);
  });
}

window.cancelContact = cancelContact;

function restoreTermsToForm(terms) {
  // Check if applySpecialTermsToForm exists
  if (typeof window.applySpecialTermsToForm === 'function') {
    window.applySpecialTermsToForm(terms);
    
    // Show cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    
    // Switch to basic tab
    if (typeof window.activateTab === 'function') {
      window.activateTab('pills-basic');
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    console.error('applySpecialTermsToForm not found');
  }
}

function cancelEditSpecialTerms() {
  const supplierNo = new URLSearchParams(window.location.search).get("id");
  
  // Hide cancel button
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  
  // Reload current data
  if (typeof window.loadSpecialTermsCurrent === 'function') {
    window.loadSpecialTermsCurrent(supplierNo);
  } else if (typeof window.loadSpecialTermsCurrent === 'function') {
    window.loadSpecialTermsCurrent(supplierNo);
  } else {
    window.location.reload();
  }
}

function cancelEditProductCoverage() {
  const supplierNo = new URLSearchParams(window.location.search).get("id");
  
  // Hide cancel button
  const cancelEditProductBtn = document.getElementById('cancelEditProductBtn');
  if (cancelEditProductBtn) cancelEditProductBtn.style.display = 'none';
  
  // Reload current data
  if (typeof window.loadLatestCoverageFromHistory === 'function') {
    window.loadLatestCoverageFromHistory(supplierNo);
  } else {
    window.location.reload();
  }
}

window.restoreTermsToForm = restoreTermsToForm;
window.cancelEditSpecialTerms = cancelEditSpecialTerms;
window.cancelEditProductCoverage = cancelEditProductCoverage;


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
