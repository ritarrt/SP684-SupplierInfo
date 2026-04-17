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
      method: row.querySelector(".payment-method-select")?.value || null,
      bank: row.querySelector(".bank-input")?.value || null,
      account: row.querySelector(".account-input")?.value || null,
      accountName: row.querySelector(".account-name-input")?.value || null
    })),

    claim: {
      period: document.getElementById("spClaimPeriod")?.value || null,
      condition: document.getElementById("spClaimCondition")?.value || null,
      note: document.getElementById("spClaimNote")?.value || null
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

async function loadSpecialTermsCurrent(supplierNo) {
  if (!supplierNo) return;

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/special-terms`
  );

  if (!res.ok) {
    console.warn("ไม่พบเงื่อนไขพิเศษ current");
    return;
  }

  const data = await res.json();
  if (!data || !data.length) return;

  const payload = safeParse(data[0].PayloadJson);
  if (!payload?.terms) return;

  applySpecialTermsToForm(payload.terms);
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

  // ===== payment methods =====
  // ===== payment methods =====
const container = document.getElementById("paymentMethodContainer");
const template = container.querySelector(".payment-row");
if (!template) return;

// 1. ลบแถวที่ clone ไว้ก่อนหน้า (ยกเว้น template)
Array.from(container.querySelectorAll(".payment-row"))
  .slice(1)
  .forEach(row => row.remove());

// 2. ถ้าไม่มีข้อมูล → เคลียร์ template
if (!paymentMethods.length) {
  template.querySelector(".payment-method-select").value = "";
  template.querySelector(".bank-input").value = "";
  template.querySelector(".account-input").value = "";
  template.querySelector(".account-name-input").value = "";
  return;
}

// 3. ใส่ข้อมูลแถวแรกลง template
const first = paymentMethods[0];
template.querySelector(".payment-method-select").value = first.method || "";
template.querySelector(".bank-input").value = first.bank || "";
template.querySelector(".account-input").value = first.account || "";
template.querySelector(".account-name-input").value =
  first.accountName || "";

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
  row.querySelector(".payment-method-select").value = data.method || "";
  row.querySelector(".bank-input").value = data.bank || "";
  row.querySelector(".account-input").value = data.account || "";
  row.querySelector(".account-name-input").value = data.accountName || "";

  container.appendChild(row);
}

