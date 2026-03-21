console.log("supplier-deal.js loaded");

let dealData = [];
let currentToggleDealId = null;
let currentDealStatus = null;


/* ===============================
   INIT
================================ */
document.addEventListener("DOMContentLoaded", () => {

  const supplierNo = window.supplierNo;
  if (!supplierNo) return;

  loadDealList(supplierNo);

  /* ===============================
     🔥 SAVE DEAL BUTTON
  ================================ */
  const btn = document.getElementById("submitDealBtn");

  if (btn) {
    btn.addEventListener("click", async () => {

      const payload = {
        deal_name: document.getElementById("dealName")?.value,
        contact_person: document.getElementById("dealProvider")?.value,
        region: document.getElementById("dealRegion")?.value,
        branch: document.getElementById("dealBranch")?.value,
        category: document.getElementById("dealCat")?.value,
        brand: document.getElementById("dealBrand")?.value,
        product_group: document.getElementById("dealGroup")?.value,
        sub_group: document.getElementById("dealSub")?.value,
        color: document.getElementById("dealColor")?.value,
        thickness: document.getElementById("dealThick")?.value,
        mold: document.getElementById("dealMold")?.value,
        sku: document.getElementById("dealSku")?.value,
        deal_type: document.getElementById("dealType")?.value,
        price_value: Number(document.getElementById("dealPrice")?.value || 0),
        price_unit: document.getElementById("dealUnit")?.value,
        start_date: document.getElementById("dealStart")?.value || null,
        end_date: document.getElementById("dealEnd")?.value || null,
        note: document.getElementById("dealNote")?.value
      };

      try {

        const res = await fetch(
          `${API_BASE}/api/suppliers/${supplierNo}/deals`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );

        if (!res.ok) throw new Error(await res.text());

        showSaveMessage("บันทึกดีลสำเร็จ");

        await loadDealList(supplierNo);

      } catch (err) {
        console.error("❌ Save deal error:", err);
        showSaveMessage("บันทึกดีลไม่สำเร็จ", true);
      }

    });
  }

  /* ===============================
     🔥 DEAL MODAL BUTTONS
  ================================ */

  const modal = document.getElementById("cancelDealModal");
  const btnNo = document.getElementById("cancelDealNoBtn");
  const btnYes = document.getElementById("cancelDealYesBtn");

  if (btnNo) {
    btnNo.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      currentToggleDealId = null;
    });
  }

  if (btnYes) {
    btnYes.addEventListener("click", async () => {

      const supplierNo = window.supplierNo;
      if (!supplierNo || !currentToggleDealId) return;

      try {

        const res = await fetch(
          `${API_BASE}/api/suppliers/${supplierNo}/deals/${currentToggleDealId}/toggle`,
          { method: "PUT" }
        );

        if (!res.ok) throw new Error(await res.text());

        showSaveMessage("เปลี่ยนสถานะดีลสำเร็จ");

        modal.classList.add("hidden");
        modal.classList.remove("flex");

        await loadDealList(supplierNo);

      } catch (err) {
        console.error("❌ Toggle deal error", err);
        showSaveMessage("ไม่สามารถเปลี่ยนสถานะได้", true);
      }
    });
  }

});


/* ===============================
   LOAD DEAL LIST
================================ */
async function loadDealList(supplierNo) {

  try {

    const res = await fetch(
      `${API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/deals`
    );

    if (!res.ok) throw new Error(await res.text());

    dealData = await res.json();
    renderDealTable();

  } catch (err) {
    console.error("❌ Load deal error", err);
  }
}


/* ===============================
   RENDER TABLE
================================ */
function renderDealTable() {

  const tbody = document.getElementById("dealTableBody");
  const countEl = document.getElementById("dealRecordCount");

  if (!tbody) return;

  const filterValue =
    document.querySelector("input[name='dealFilter']:checked")?.value;

  let rows = [...dealData];

  if (filterValue === "active") {
    rows = rows.filter(r => r.status === "OPEN");
  }

  if (filterValue === "cancelled") {
    rows = rows.filter(r => r.status === "CANCELLED");
  }

  tbody.innerHTML = "";

  rows.forEach((r, idx) => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${idx + 1}</td>

      <td>
        <span
          class="badge ${r.status === "OPEN" ? "bg-success" : "bg-danger"}"
          style="cursor:pointer"
          onclick="openDealModal(${r.deal_id}, '${r.status}')"
        >
          ${r.status}
        </span>
      </td>

      <td>
        <div class="fw-bold">${r.deal_name || "-"}</div>
      </td>

      <td class="small">
  <div><strong>${r.region || "-"} / ${r.branch || "-"}</strong></div>

  <div>
    ${r.category || "-"} / ${r.brand || "-"}
  </div>

  <div>
    ${r.product_group || "-"} / ${r.sub_group || "-"}
  </div>

  <div>
    สี: ${r.color || "-"} /
    หนา: ${r.thickness || "-"}
  </div>

  <div>
    Mold: ${r.mold || "-"} /
    SKU: ${r.sku || "-"}
  </div>
</td>

<td class="small text-end">
  <div class="fw-bold">
    ${r.price_value || 0} ${r.price_unit || ""}
  </div>

  <div>
    ประเภทดีล: ${r.deal_type || "-"}
  </div>

  <div>
    เริ่ม: ${formatThaiDate(r.start_date)}
  </div>

  <div>
    สิ้นสุด: ${formatThaiDate(r.end_date)}
  </div>

  <div>
    ผู้ให้ราคา: ${r.contact_person || "-"}
  </div>

  <div class="text-muted">
    ${r.note || ""}
  </div>
</td>


      <td class="small">
        ${formatThaiDateTime(r.updated_at || r.created_at)}
      </td>
    `;

    tbody.appendChild(tr);
  });

  if (countEl) {
    countEl.textContent = `${rows.length} รายการ`;
  }
}


/* ===============================
   OPEN DEAL MODAL
================================ */
function openDealModal(dealId, status) {

  currentToggleDealId = dealId;
  currentDealStatus = status;

  const modal = document.getElementById("cancelDealModal");
  const message = document.getElementById("dealModalMessage");

  if (!modal) return;

  if (status === "OPEN") {
    message.innerHTML =
      "คุณกำลังจะยกเลิกดีลราคานี้<br>ต้องการดำเนินการต่อหรือไม่?";
  } else {
    message.innerHTML =
      "คุณต้องการเปิดใช้งานดีลราคานี้อีกครั้งหรือไม่?";
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}


/* ===============================
   FORMAT DATE
================================ */

function formatThaiDate(dateStr) {

  if (!dateStr) return "-";

  // ตัด Z และ T ออกเพื่อไม่ให้ browser treat เป็น UTC
  const fixedDate = new Date(
    dateStr.replace("T", " ").replace("Z", "")
  );

  return fixedDate.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

document.getElementById("dealCat").addEventListener("change", (e) => {
  loadColors(e.target.value, "dealColor");
});