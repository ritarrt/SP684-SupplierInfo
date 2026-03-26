import { loadColors, loadThickness } from "../modules/master-helper.js";
import { loadCoverageToForm, loadGroups, loadSubGroups } from "../modules/coverage-helper.js";

// ============================================================
// DROPDOWN TOGGLE
// ============================================================
window.toggleDropdown = function (id) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.toggle("hidden");
};

document.addEventListener("click", (e) => {
  const dropdowns = ["regionDropdown", "provinceDropdown", "branchDropdown"];

  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    if (!el.contains(e.target) && !e.target.closest(`[onclick*="${id}"]`)) {
      el.classList.add("hidden");
    }
  });
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function renderCheckboxList(containerId, data) {
  const el = document.getElementById(containerId);

  el.innerHTML = data.map(d => `
    <label class="block text-sm py-1">
      <input type="checkbox" value="${d.value}" class="mr-2">
      ${d.label}
    </label>
  `).join("");
}

// ============================================================
// INIT
// ============================================================
let currentTargetId = null;
let branchData = [];


function getSelectedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)]
    .map(i => i.value);
}


document.addEventListener("DOMContentLoaded", async () => {

  // 🔥 โหลด branch master ก่อนใช้งาน
  await loadBranchMaster();

  console.log("supplier-target.js loaded");
  updateLastModifiedLabel();
  await loadContactDropdown();
  
  // โหลดสี + ความหนา ตามประเภทสินค้า
  const catSelect = document.getElementById("tgCat");
  if (catSelect) {
    catSelect.addEventListener("change", (e) => {
      const category = e.target.value;

      loadColors(category, "tgColor");
      loadThickness(category, "tgThick");
    });
  }

  // ============================================================
  // 1️⃣ โหลด Coverage ของ Supplier
  // ============================================================
  if (window.supplierNo) {
    await loadCoverageToForm(window.supplierNo, {
      category: "tgCat",
      brand: "tgBrand",
      group: "tgGroup",
      sub: "tgSub",
      color: "tgColor",
      thickness: "tgThick",
      sku: "tgSku"
    });
  }

  // ============================================================
  // Reload GROUP when Category / Brand change
  // ============================================================
  const catSelect2 = document.getElementById("tgCat");
  const brandSelect2 = document.getElementById("tgBrand");

  if (catSelect2 && brandSelect2) {

    catSelect2.addEventListener("change", () => {
      loadGroups(catSelect2.value, brandSelect2.value, "tgGroup");
    });

    brandSelect2.addEventListener("change", () => {
      loadGroups(catSelect2.value, brandSelect2.value, "tgGroup");
    });
  }

  const groupSelect = document.getElementById("tgGroup");

  if (groupSelect) {
    groupSelect.addEventListener("change", () => {
      loadSubGroups(
        catSelect2.value,
        brandSelect2.value,
        groupSelect.value,
        "tgSub"
      );
    });
  }

  // ============================================================
  // 2️⃣ Prevent form reload
  // ============================================================
  const form = document.getElementById("targetForm");
  if (form) {
    form.addEventListener("submit", e => e.preventDefault());
  }

  // ============================================================
  // 3️⃣ Radio Filter
  // ============================================================
  document.querySelectorAll('input[name="tgFilter"]')
    .forEach(radio => {
      radio.addEventListener("change", loadTargetTable);
    });

  // ============================================================
  // 4️⃣ Save Button
  // ============================================================
  const submitBtn = document.getElementById("submitTgBtn");

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {

      if (!window.supplierNo) return;

      const targetName = document.getElementById("tgName")?.value?.trim();
      const category = document.getElementById("tgCat")?.value?.trim();
      const brand = document.getElementById("tgBrand")?.value?.trim();
      const productGroup = document.getElementById("tgGroup")?.value?.trim();

      if (!targetName) return alert("กรุณากรอกชื่อเป้าหมาย");
      if (!category) return alert("กรุณาเลือกประเภทสินค้า");
      if (!brand) return alert("กรุณาเลือกแบรนด์");

      const payload = {
        supplier_code: window.supplierNo,
        provider_contact_id: document.getElementById("tgProvider")?.value || null,
        target_name: targetName,
        target_ref: document.getElementById("tgRef")?.value || "",
        region: getSelectedValues("regionDropdown").join(",") || null,
province: getSelectedValues("provinceDropdown").join(",") || null,
branch: getSelectedValues("branchDropdown").join(",") || null,
parent_target_ref: document.getElementById("tgRef")?.value || null,
        category: category,

        brand: brand,
        group: productGroup,
      

        sub_group_name: document.getElementById("tgSub")?.selectedOptions[0]?.text || "",
        sub_group_code: document.getElementById("tgSub")?.value || "",
        color: document.getElementById("tgColor")?.value || "",
        thickness: document.getElementById("tgThick")?.value || "",
        mold: document.getElementById("tgMold")?.value || "",
        sku: document.getElementById("tgSku")?.value || "",

        benefit_period: document.getElementById("tgBenefit")?.value || "",
        target_type: document.getElementById("tgType")?.value || "",
        target_qty: document.getElementById("tgQty")?.value || 0,
        target_unit: document.getElementById("tgUnit")?.value || "",

        start_date: document.getElementById("tgStart")?.value || null,
        end_date: document.getElementById("tgEnd")?.value || null
      };

      try {
        const res = await fetch(`${API_BASE}/api/targets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (result.success) {
          await loadTargetTable();
        }

      } catch (err) {
        console.error("Save Target Error:", err);
      }
    });
  }

  // ============================================================
// 🔥 REGION → PROVINCE (MULTI)
// ============================================================
document.addEventListener("change", (e) => {

  if (e.target.matches("#regionDropdown input")) {

    const selectedRegions = getSelectedValues("regionDropdown");

    let provinces = [];

    selectedRegions.forEach(r => {

      let regionName = r;

      if (r === "กลาง") regionName = "ภาคกลาง";
      if (r === "เหนือ") regionName = "ภาคเหนือ";
      if (r === "ใต้") regionName = "ภาคใต้";
      if (r === "อีสาน") regionName = "ภาคตะวันออกเฉียงเหนือ";

      const filtered = branchData
        .filter(b => b.region === regionName)
        .map(b => b.province);

      provinces = provinces.concat(filtered);
    });

    provinces = [...new Set(provinces)];

    renderCheckboxList("provinceDropdown",
      provinces.map(p => ({ value: p, label: p }))
    );

    renderCheckboxList("branchDropdown", []);
  }
});

console.log("branchData:", branchData);

  // ============================================================
// 🔥 PROVINCE → BRANCH (MULTI)
// ============================================================
document.addEventListener("change", (e) => {

  if (e.target.matches("#provinceDropdown input")) {

    const selectedProvinces = getSelectedValues("provinceDropdown");

    let branches = [];

    selectedProvinces.forEach(p => {
      const filtered = branchData.filter(b => b.province === p);
      branches = branches.concat(filtered);
    });

    renderCheckboxList("branchDropdown",
      branches.map(b => ({
        value: b.branchCode,
        label: `${b.branchCode} - ${b.branchName}`
      }))
    );
  }
});

function updateSelectedText(containerId, textId) {
  const values = [...document.querySelectorAll(`#${containerId} input:checked`)]
    .map(i => i.parentElement.textContent.trim());

  document.getElementById(textId).innerText =
    values.length ? values.join(", ") : "- เลือก -";
}

document.addEventListener("change", (e) => {

  if (e.target.matches("#regionDropdown input"))
    updateSelectedText("regionDropdown", "regionText");

  if (e.target.matches("#provinceDropdown input"))
    updateSelectedText("provinceDropdown", "provinceText");

  if (e.target.matches("#branchDropdown input"))
    updateSelectedText("branchDropdown", "branchText");

});

  // ============================================================
  // 5️⃣ Initial Table Load
  // ============================================================
  if (window.supplierNo) {
    loadTargetTable();
  }
renderRegionDropdown();
});

function renderRegionDropdown() {

  // 🔥 ดึง region จาก branchData จริง
  const regions = [...new Set(branchData.map(b => b.region))];

renderCheckboxList("regionDropdown",
  regions.map(r => ({
    value: r,   // ✅ ใช้ค่าจริงจาก DB
    label: r
  }))
);

  console.log("✅ region loaded:", regions);
}

// ============================================================
// LOAD TABLE
// ============================================================
async function loadTargetTable() {

  if (!window.supplierNo) return;

  try {
    const color = document.getElementById("tgColor")?.value || "";

const res = await fetch(
  `${API_BASE}/api/targets/${window.supplierNo}?color=${encodeURIComponent(color)}`
);
const data = await res.json();

    const tbody = document.getElementById("tgTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    const selectedFilter =
  document.querySelector('input[name="tgFilter"]:checked')?.value || "OPEN";

    const filtered = data.filter(item => {

  if (selectedFilter === "OPEN") {
    return item.status === "OPEN";
  }

  if (selectedFilter === "CLOSED") {
    return item.status === "CLOSED";
  }

  if (selectedFilter === "CANCELLED") {
    return item.status === "CANCELLED";
  }

  return true;
});

    const countEl = document.getElementById("tgRecordCount");
    if (countEl) {
      countEl.textContent = `${filtered.length} รายการ`;
    }

    filtered.forEach((item, index) => {

      const statusBadge =
  item.status === "OPEN"
    ? `<span
         style="
           display:inline-block;
           background:#198754;
           color:#fff;
           padding:6px 16px;
           border-radius:20px;
           font-weight:600;
           font-size:13px;
           cursor:pointer;
         "
         onclick="toggleTargetStatus(${item.id}, 'OPEN')">
         OPEN
       </span>`

  : item.status === "CANCELLED"
    ? `<span
         style="
           display:inline-block;
           background:#dc3545;
           color:#fff;
           padding:6px 16px;
           border-radius:20px;
           font-weight:600;
           font-size:13px;
           cursor:pointer;
         "
         onclick="toggleTargetStatus(${item.id}, 'CANCELLED')">
         CANCELLED
       </span>`

  : `<span
       style="
         display:inline-block;
         background:#0d6efd;
         color:#fff;
         padding:6px 16px;
         border-radius:20px;
         font-weight:600;
         font-size:13px;
       ">
       CLOSED
     </span>`;

      tbody.innerHTML += `
        <tr>
          <td>${index + 1}</td>
          <td>${statusBadge}</td>
          <td>
  <div style="font-weight:600;">
    ${item.target_ref || "-"}
  </div>
  <div style="font-size:12px; color:#6c757d;">
    ${item.target_name || "-"}
  </div>
</td>

          <td class="small">
            ${item.region || "-"} / ${item.province || "-"} / ${item.branch || "-"}<br>
            ${item.category || "-"} / ${item.brand_name || "-"} / ${item.sub_group || "-"}
${item.color || "-"} / ${item.thickness || "-"}
            Mold: ${item.mold || "-"} / SKU: ${item.sku || "-"}
          </td>

          <td>
            ${formatDate(item.start_date)} - ${formatDate(item.end_date)}
          </td>

        <td style="min-width:200px;">

  <!-- Target -->
  <div style="font-weight:600; font-size:15px;">
    ${Number(item.target_qty || 0).toLocaleString()} ${item.target_unit || ""}
  </div>

  <!-- Actual -->
<div style="font-size:14px; margin-top:4px;">

  ${
  item.target_unit === "ชิ้น" || item.target_unit === "pcs"
    ? `${Number(item.actual_qty || 0).toLocaleString()} ชิ้น`

    : item.target_unit === "บาท"
    ? `${Number(item.actual_amount || 0).toLocaleString()} บาท`

    : item.target_unit === "ตัน" || item.target_unit === "ton"
    ? `${Number((item.actual_weight || 0) / 1000).toLocaleString()} ตัน`

    : "-"
}

  ${
    item.achievement_percent
      ? `<span style="font-size:13px; color:#6c757d;">
           (${Number(item.achievement_percent).toFixed(0)}%)
         </span>`
      : ""
  }

</div>

  <!-- Status Badge -->
 <div style="margin-top:6px;">
  ${
    item.target_state === "บรรลุเป้า"
      ? `<span style="background:#198754;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;">
          บรรลุเป้า
        </span>`

        : item.target_state === "ไม่ถึงเป้า (หมดอายุ)"
  ? `<span style="background:#dc3545;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;">
        ไม่ถึงเป้า
     </span>
     <span style="background:#6c757d;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;margin-left:4px;">
        หมดอายุ
     </span>`


    : item.target_state === "บรรลุแล้ว (หมดอายุ)"
      ? `<span style="background:#198754;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;">
          บรรลุแล้ว
        </span>
         <span style="background:#6c757d;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;margin-left:4px;">
          หมดอายุ
        </span>`

    : item.target_state === "หมดอายุแล้ว"
      ? `<span style="background:#6c757d;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;">
          หมดอายุแล้ว
        </span>`

    : item.target_state === "ยังไม่ถึงเป้า"
      ? `<span style="background:#ffc107;color:#000;padding:3px 8px;border-radius:12px;font-size:12px;">
          ยังไม่ถึงเป้า
        </span>`

    : item.target_state === "ยังไม่เริ่ม"
      ? `<span style="background:#0d6efd;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;">
          ยังไม่เริ่ม
        </span>`

    : ""
  }
</div>

</td>

          <td>
            ${formatDateTime(item.updated_at)}
          </td>
        </tr>
      `;
    });

  } catch (err) {
    console.error("Load Target Error:", err);
  }
}


// ============================================================
// TOGGLE STATUS
// ============================================================
function toggleTargetStatus(targetId, currentStatus) {

  currentTargetId = targetId;

  const modal = document.getElementById("cancelTargetModal");
  const messageEl = document.getElementById("cancelTargetMessage");

  if (currentStatus === "OPEN") {
    messageEl.innerHTML =
      "คุณกำลังจะยกเลิก Target นี้<br>ต้องการดำเนินการต่อหรือไม่?";
  } else {
    messageEl.innerHTML =
      "คุณต้องการเปิดใช้งาน Target นี้อีกครั้งหรือไม่?";
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

window.toggleTargetStatus = toggleTargetStatus;
function closeCancelModal() {
  const modal = document.getElementById("cancelTargetModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

// ปุ่ม ยกเลิก
document.getElementById("cancelTargetNoBtn")
  ?.addEventListener("click", closeCancelModal);

// ปุ่ม ยืนยัน
document.getElementById("cancelTargetYesBtn")
  ?.addEventListener("click", async () => {

    if (!currentTargetId) return;

    try {
      await fetch(`${API_BASE}/api/targets/cancel/${currentTargetId}`, {
        method: "PUT"
      });

      closeCancelModal();
      loadTargetTable();

    } catch (err) {
      console.error("Toggle Status Error:", err);
    }
});

// ============================================================
// DATE FORMATTERS
// ============================================================
function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("th-TH");
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";

  // ตัด millisecond
  const clean = dateStr.replace("T", " ").substring(0, 19);

  const [datePart, timePart] = clean.split(" ");
  if (!datePart || !timePart) return "-";

  let [year, month, day] = datePart.split("-");
  const [hour, minute, second] = timePart.split(":");

  // ถ้าเป็น พ.ศ.
  if (parseInt(year) > 2400) {
    year = parseInt(year);
  } else {
    year = parseInt(year) + 543;
  }

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

// ============================================================
// LOAD CONTACT DROPDOWN
// ============================================================
async function loadContactDropdown() {

  if (!window.supplierNo) return;

  try {

    const res = await fetch(`${API_BASE}/api/suppliers/${window.supplierNo}/contacts`);
    const contacts = await res.json();

    const select = document.getElementById("tgProvider");
    if (!select) return;

    select.innerHTML = `<option value="">- เลือกผู้ติดต่อ -</option>`;

    contacts
      .filter(c => c.status !== "CANCELLED")
      .forEach(c => {

        const option = document.createElement("option");
        option.value = c.id;
        option.textContent = `${c.name} ${c.position ? `(${c.position})` : ""}`;

        select.appendChild(option);
      });

  } catch (err) {
    console.error("Load Contacts Error:", err);
  }
}

// ===================================================
// UPDATE LAST MODIFIED TIME
// ===================================================
function updateLastModifiedLabel() {

  const el = document.getElementById("tgLastUpdated"); // 👈 แก้ตรงนี้
  if (!el) return;

  const now = new Date();

  const formatted =
    now.toLocaleDateString("th-TH") +
    " " +
    now.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit"
    });

  el.innerHTML = `
    <i class="bi bi-clock"></i> แก้ไขล่าสุด: ${formatted}
  `;
}

async function loadBranchMaster() {
  try {
    const res = await fetch(`${API_BASE}/api/master/branches`);

    if (!res.ok) {
      console.error("❌ API NOT FOUND:", res.status);
      return;
    }

    const data = await res.json();

    console.log("✅ Branch Data:", data);

    branchData = data;

  } catch (err) {
    console.error("Load Branch Error:", err);
  }
}
