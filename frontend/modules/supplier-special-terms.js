console.log("supplier-special-terms.js loaded");

// ===================================================
// COLLECT SPECIAL TERMS
// ===================================================
function collectSpecialTerms() {
  return {
    finance: {
      billingCycle: document.getElementById("spBillingCycle")?.value || null,
      creditTerm: document.getElementById("spCreditTerm")?.value || null,
      creditLimit: document.getElementById("spCreditLimit")?.value || null,
      creditLimitUnit: document.getElementById("spCreditLimitUnit")?.value || null
    },

    paymentMethods: Array.from(
      document.querySelectorAll("#paymentMethodContainer .payment-row")
    ).map(row => ({
      method:      row.querySelector(".payment-method-select")?.value || null,
      swiftCode:   row.querySelector(".swift-code-input")?.value || null,
      account:     row.querySelector(".account-input")?.value || null,
      accountName: row.querySelector(".account-name-input")?.value || null
    })).filter(pm => pm.swiftCode || pm.account || pm.method),

    claim: {
      period: document.getElementById("spClaimPeriod")?.value || null,
      condition: document.getElementById("spClaimCondition")?.value || null,
      note: document.getElementById("spClaimNote")?.value || null
    },

    leadtime: {
      type: document.getElementById("spLeadtimeType")?.value || null,
      days: document.getElementById("spLeadtimeDays")?.value || null,
      skuRows: Array.from(
        document.querySelectorAll("#leadtimeSkuContainer .leadtime-sku-row")
      ).map(row => ({
        days: row.querySelector(".leadtime-sku-days")?.value || null,
        sku: row.querySelector(".leadtime-sku-input")?.value || null
      })).filter(r => r.days || r.sku)
    }
  };
}

// ===================================================
// SAVE SPECIAL TERMS ONLY
// ===================================================
async function saveSpecialTermsOnly() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  const payload = {
    terms: collectSpecialTerms()
  };

  // 1️⃣ save current (backend will auto save to history)
  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/special-terms`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  if (!res.ok) {
    alert("บันทึกเงื่อนไขพิเศษไม่สำเร็จ");
    return;
  }

  showSaveMessage("บันทึกเงื่อนไขพิเศษเรียบร้อยแล้ว");

  setTimeout(() => {
    window.location.href = window.location.pathname + "?id=" + supplierNo;
  }, 1000);
}



// ===================================================
// SAVE BOTH (PRODUCT + SPECIAL TERMS)
// ===================================================
async function saveProductAndSpecialTerms() {
  const supplierNo = new URLSearchParams(location.search).get("id");

  await saveProductCoverageOnly();
  await saveSpecialTermsOnly();

  setTimeout(() => {
    window.location.href = window.location.pathname + "?id=" + supplierNo;
  }, 1000);
}

// expose
window.collectSpecialTerms = collectSpecialTerms;
window.saveSpecialTermsOnly = saveSpecialTermsOnly;
window.saveProductAndSpecialTerms = saveProductAndSpecialTerms;
window.addPaymentMethodRow = addPaymentMethodRow;

async function loadSpecialTermsCurrent(supplierNo) {
  if (!supplierNo) return;

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/special-terms`
  );

  if (!res.ok) {
    console.warn("ไม่พบเงื่อนไขพิเศษ current");
    prefillBankFromSupplier();
    return;
  }

  const data = await res.json();
  if (!data || !data.length) {
    prefillBankFromSupplier();
    return;
  }

  const payload = safeParse(data[0].PayloadJson);
  if (!payload?.terms) {
    prefillBankFromSupplier();
    return;
  }

  applySpecialTermsToForm(payload.terms);
  // หลัง apply แล้ว ถ้าช่องยังว่างให้ใส่จาก DB
  prefillBankFromSupplier();
}

function prefillBankFromSupplier() {
  const container = document.getElementById("paymentMethodContainer");
  if (!container) return;
  const firstRow = container.querySelector(".payment-row");
  if (!firstRow) return;

  const methodEl = firstRow.querySelector(".payment-method-select");
  const swiftEl   = firstRow.querySelector(".swift-code-input");
  const accountEl = firstRow.querySelector(".account-input");
  const nameEl    = firstRow.querySelector(".account-name-input");

  if (swiftEl   && !swiftEl.value)   swiftEl.value   = window.__supplierSwiftCode   || "";
  if (accountEl && !accountEl.value) accountEl.value = window.__supplierBankAccount || "";
  if (nameEl    && !nameEl.value)    nameEl.value    = window.__supplierBankName    || "-";

  // ถ้า method ยังว่าง แต่มีธนาคารและเลขบัญชี → โอนเงิน
  if (methodEl && !methodEl.value) {
    const hasBank    = swiftEl?.value;
    const hasAccount = accountEl?.value;
    if (hasBank && hasAccount) methodEl.value = "transfer";
  }
}

function safeParse(json) {
  try {
    return typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return null;
  }
}

function applySpecialTermsToForm(terms) {
  const finance = terms.finance || {};
  const claim = terms.claim || {};
  const paymentMethods = terms.paymentMethods || [];

  // ===== finance =====
  if (finance.billingCycle)
    document.getElementById("spBillingCycle").value = finance.billingCycle;

  if (finance.creditTerm)
    document.getElementById("spCreditTerm").value = finance.creditTerm;

  if (finance.creditLimit)
    document.getElementById("spCreditLimit").value = finance.creditLimit;

  if (finance.creditLimitUnit)
    document.getElementById("spCreditLimitUnit").value =
      finance.creditLimitUnit;

  // ===== claim =====
  if (claim.period)
    document.getElementById("spClaimPeriod").value = claim.period;

  if (claim.condition)
    document.getElementById("spClaimCondition").value = claim.condition;

  if (claim.note)
    document.getElementById("spClaimNote").value = claim.note;

  // ===== leadtime =====
  const leadtime = terms.leadtime || {};

  if (leadtime.type)
    document.getElementById("spLeadtimeType").value = leadtime.type;

  if (leadtime.days)
    document.getElementById("spLeadtimeDays").value = leadtime.days;

  // leadtime sku rows
  const skuRows = leadtime.skuRows || [];
  const skuContainer = document.getElementById("leadtimeSkuContainer");
  if (skuContainer) {
    skuContainer.innerHTML = "";
    skuRows.forEach(r => addLeadtimeSkuRow(r));
  }

  // ===== payment methods =====
  // ===== payment methods =====
const container = document.getElementById("paymentMethodContainer");
const template = container.querySelector(".payment-row");
if (!template) return;

// 1. ลบแถวที่ clone ไว้ก่อนหน้า (ยกเว้น template)
Array.from(container.querySelectorAll(".payment-row"))
  .slice(1)
  .forEach(row => row.remove());

// 2. ถ้าไม่มีข้อมูลใน JSON → pre-fill จาก supplier DB แทน
if (!paymentMethods.length) {
  const swiftEl = template.querySelector(".swift-code-input");
  if (swiftEl) swiftEl.value = window.__supplierSwiftCode || "";
  template.querySelector(".account-input").value = window.__supplierBankAccount || "";
  template.querySelector(".account-name-input").value = window.__supplierBankName || "";
  return;
}

// 3. ใส่ข้อมูลแถวแรกลง template
const first = paymentMethods[0];
// ถ้า method เป็น null แต่มีธนาคารและเลขบัญชี → นับเป็นโอนเงิน
const resolvedMethod = first.method || ((first.swiftCode || first.bank) && first.account ? "transfer" : "");
template.querySelector(".payment-method-select").value = resolvedMethod;
const swiftEl = template.querySelector(".swift-code-input");
// รองรับทั้ง swiftCode (ใหม่) และ bank (เก่า)
if (swiftEl) swiftEl.value = first.swiftCode || first.bank || "";
template.querySelector(".account-input").value = first.account || "";
const accountNameEl = template.querySelector(".account-name-input");
if (accountNameEl) {
  accountNameEl.value = first.accountName || window.__supplierBankName || "";
}

// 4. แถวถัดไป clone จาก template
paymentMethods.slice(1).forEach(pm => {
  addPaymentMethodRow(pm);
});

}


function addPaymentMethodRow(data = {}) {
  const container = document.getElementById("paymentMethodContainer");
  if (!container) return;

  // ใช้แถวแรกเป็น template
  const template = container.querySelector(".payment-row");
  if (!template) return;

  const row = template.cloneNode(true);

  // ใส่ค่า
  // ถ้า method เป็น null แต่มีธนาคารและเลขบัญชี → นับเป็นโอนเงิน
  const resolvedMethod = data.method || ((data.swiftCode || data.bank) && data.account ? "transfer" : "");
  row.querySelector(".payment-method-select").value = resolvedMethod;
  const swiftEl = row.querySelector(".swift-code-input");
  // รองรับทั้ง swiftCode (ใหม่) และ bank (เก่า)
  if (swiftEl) swiftEl.value = data.swiftCode || data.bank || "";
  row.querySelector(".account-input").value = data.account || "";
  row.querySelector(".account-name-input").value = data.accountName || "";

  container.appendChild(row);
}


// ===================================================
// LEADTIME SKU ROWS
// ===================================================
function addLeadtimeSkuRow(data = {}) {
  const container = document.getElementById("leadtimeSkuContainer");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "leadtime-sku-row grid grid-cols-12 gap-2 items-center";

  row.innerHTML = `
    <div class="col-span-12 md:col-span-2">
      <div class="flex">
        <input
          type="number"
          min="0"
          class="form-control leadtime-sku-days"
          placeholder="Leadtime"
          value="${data.days || ""}"
        >
        <span class="text-sm text-gray-500 flex-shrink-0 px-1">วัน</span>
      </div>
    </div>
    <div class="col-span-12 md:col-span-4 relative">
      <input
        type="text"
        class="form-control leadtime-sku-input"
        placeholder="SKU"
        value="${data.sku || ""}"
      >
    </div>
    <div class="col-span-12 md:col-span-1">
      <button
        type="button"
        class="btn btn-outline-danger btn-sm"
        onclick="removeLeadtimeSkuRow(this)"
      >
        <i class="bi bi-x"></i>
      </button>
    </div>
  `;

  container.appendChild(row);

  // attach SKU autocomplete เหมือนกับส่วนสินค้าที่บริษัทดูแล
  const skuInput = row.querySelector(".leadtime-sku-input");
  if (skuInput && typeof attachSkuAutocomplete === "function") {
    attachSkuAutocomplete(skuInput);
  }
}

function removeLeadtimeSkuRow(btn) {
  btn.closest(".leadtime-sku-row")?.remove();
}

window.addLeadtimeSkuRow = addLeadtimeSkuRow;
window.removeLeadtimeSkuRow = removeLeadtimeSkuRow;
