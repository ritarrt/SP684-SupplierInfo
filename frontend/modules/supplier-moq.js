console.log("supplier-moq.js loaded");
let moqData = [];
let currentCancelMoqId = null;



document.addEventListener("DOMContentLoaded", () => {
 const supplierNo = window.supplierNo;

if (!supplierNo) return;


  // โหลดรายการ MOQ ตอนเปิดหน้า
  loadMoqList(supplierNo);

  // ผูกปุ่มบันทึก
  const btn = document.getElementById("submitMoqBtn");
  if (!btn) {
    console.warn("❌ submitMoqBtn not found");
    return;
  }

  btn.addEventListener("click", async () => {
    console.log("🟢 CLICK submitMoqBtn");

    const payload = {
      moq_name: document.getElementById("moqName")?.value,
      region: document.getElementById("moqRegion")?.value,
      branch: document.getElementById("moqBranch")?.value,
      category: document.getElementById("moqCat")?.value,
      brand: document.getElementById("moqBrand")?.value,
      product_group: document.getElementById("moqGroup")?.value,
      sub_group: document.getElementById("moqSub")?.value,
      color: document.getElementById("moqColor")?.value,
      mold: document.getElementById("moqMold")?.value,
      thickness: document.getElementById("moqThick")?.value,
      sku: document.getElementById("moqSku")?.value,
      moq_type: document.getElementById("moqType")?.value,
      vehicle_type: document.getElementById("moqVehicle")?.value,
      measure_type: document.getElementById("moqMeasure")?.value,
      moq_qty: Number(document.getElementById("moqQty")?.value || 0),
      moq_unit: document.getElementById("moqUnit")?.value,
    };

    try {
      const res = await fetch(
        `${API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/moq`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) throw new Error(await res.text());

      showSaveMessage("บันทึก MOQ สำเร็จ");

      // รีโหลดหน้าเพื่อแสดงผลล่าสุด
      setTimeout(() => {
        window.location.reload();
      }, 800);

    } catch (err) {
      console.error("❌ MOQ save error", err);
      showSaveMessage("บันทึก MOQ ไม่สำเร็จ", true);
    }
  });

  // ===== Modal Buttons =====
const modal = document.getElementById("cancelMoqModal");
const btnNo = document.getElementById("cancelMoqNoBtn");
const btnYes = document.getElementById("cancelMoqYesBtn");

if (btnNo) {
  btnNo.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    currentCancelMoqId = null;
  });
}

if (btnYes) {
  btnYes.addEventListener("click", async () => {

    const supplierNo = new URLSearchParams(window.location.search).get("id");

    try {
      const res = await fetch(
  `${API_BASE}/api/suppliers/${supplierNo}/moq/${currentCancelMoqId}/toggle`,
  { method: "PUT" }
);


      if (!res.ok) throw new Error(await res.text());

      showSaveMessage("เปลี่ยนสถานะ MOQ สำเร็จ");

      modal.classList.add("hidden");
      modal.classList.remove("flex");

      loadMoqList(supplierNo);

    } catch (err) {
      console.error(err);
      showSaveMessage("ไม่สามารถยกเลิกได้", true);
    }
  });
}

});


/* ===============================
   LOAD MOQ LIST
================================ */
async function loadMoqList(supplierNo) {
  try {
    console.log("📡 Load MOQ for", supplierNo);

    const res = await fetch(
      `${API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/moq`
    );

    if (!res.ok) throw new Error(await res.text());

   moqData = await res.json();
console.log("✅ MOQ rows", moqData);

renderMoqTable();

  } catch (err) {
    console.error("❌ Load MOQ error", err);
  }
}


/* ===============================
   RENDER TABLE
================================ */
function renderMoqTable() {
  const tbody = document.getElementById("moqTableBody");
  const countEl = document.getElementById("moqRecordCount");

  if (!tbody) {
    console.warn("❌ moqTableBody not found");
    return;
  }

  const filterValue =
    document.querySelector("input[name='moqFilter']:checked")?.value;

  // ✅ filter จาก moqData เสมอ
  let rows = [...moqData];

  if (filterValue === "active") {
    rows = moqData.filter(r => r.status === "OPEN");
  }

  if (filterValue === "cancelled") {
    rows = moqData.filter(r => r.status === "CANCELLED");
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
          onclick="toggleMoqStatus(${r.moq_id}, '${r.status}')"
        >
          ${r.status}
        </span>
      </td>

      <td>
        <div class="fw-bold">${r.moq_name || "-"}</div>
      </td>

      <td class="small">
        ${r.region || "-"} / ${r.branch || "-"}<br>
        ${r.category || "-"} / ${r.brand || "-"} / ${r.product_group || "-"}<br>
        ${r.sub_group || "-"} / ${r.color || "-"} / ${r.thickness || "-"}<br>
        Mold: ${r.mold || "-"} / SKU: ${r.sku || "-"}
      </td>

      <td class="small">
        ประเภท: ${r.moq_type || "-"}<br>
        รถ: ${r.vehicle_type || "-"}<br>
        ตัววัด: ${r.measure_type || "-"}<br>
        <strong>${r.moq_qty || 0} ${r.moq_unit || ""}</strong>
      </td>

      <td class="small">
  ${formatThaiDateTime(r.updated_at || r.created_at)}
</td>


      </td>

      <td class="text-center">
        <button
          class="btn btn-sm btn-outline-primary"
          onclick='editMoq(${JSON.stringify(r)})'
        >
          แก้ไข
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  if (countEl) {
    countEl.textContent = `${rows.length} รายการ`;
  }
}



/* ===============================
   EDIT MOQ
================================ */
function editMoq(row) {
  console.log("✏️ Edit MOQ", row);

  // ====== ข้อมูลพื้นฐาน ======
  document.getElementById("moqCode").value = row.moq_id;
  document.getElementById("moqStatus").value = row.status;
  document.getElementById("moqStatusText").textContent = row.status;
  document.getElementById("moqName").value = row.moq_name || "";

  // ====== Scope ======
  document.getElementById("moqRegion").value = row.region || "-";
  document.getElementById("moqBranch").value = row.branch || "";
  document.getElementById("moqCat").value = row.category || "-";
  document.getElementById("moqBrand").value = row.brand || "-";
  document.getElementById("moqGroup").value = row.product_group || "-";
  document.getElementById("moqSub").value = row.sub_group || "-";
  document.getElementById("moqColor").value = row.color || "-";
  document.getElementById("moqMold").value = row.mold || "-";
  document.getElementById("moqThick").value = row.thickness || "-";
  document.getElementById("moqSku").value = row.sku || "";

  // ====== เงื่อนไขการสั่ง ======
  document.getElementById("moqType").value = row.moq_type || "";
  document.getElementById("moqVehicle").value = row.vehicle_type || "-";
  document.getElementById("moqMeasure").value = row.measure_type || "";
  document.getElementById("moqQty").value = row.moq_qty || 0;
  document.getElementById("moqUnit").value = row.moq_unit || "";

  document.getElementById("submitMoqBtn").textContent = "บันทึกการแก้ไข";
}

function toggleMoqStatus(moqId, currentStatus) {

  currentCancelMoqId = moqId;

  const modal = document.getElementById("cancelMoqModal");

  // เปลี่ยนข้อความตามสถานะ
  const messageEl = modal.querySelector("p");

  if (currentStatus === "OPEN") {
    messageEl.innerHTML =
      "คุณกำลังจะยกเลิก MOQ นี้<br>ต้องการดำเนินการต่อหรือไม่?";
  } else {
    messageEl.innerHTML =
      "คุณต้องการเปิดใช้งาน MOQ นี้อีกครั้งหรือไม่?";
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}


function formatThaiDateTime(dateStr) {
  return dateStr || "-";
}
