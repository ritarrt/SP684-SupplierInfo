import { loadColors, loadThickness } from "../modules/master-helper.js";
import { loadCoverageToForm, loadGroups, loadSubGroups, renderCheckboxDropdown, updateCheckboxText, getCheckboxValues } from "../modules/coverage-helper.js";

// ============================================================
// DROPDOWN TOGGLE — รองรับทั้ง region/province/branch และ brand/group/sub/color/thick
// ============================================================
const ALL_MULTI_DROPDOWNS = [
  "regionDropdown", "provinceDropdown", "branchDropdown",
  "brandDropdown", "groupDropdown", "subDropdown",
  "colorDropdown", "thickDropdown"
];

window.toggleDropdown = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden");
};

document.addEventListener("click", (e) => {
  ALL_MULTI_DROPDOWNS.forEach(id => {
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
  if (!el) return;

  const textId = containerId.replace("Dropdown", "Text");

  el.innerHTML = (data.length > 0 ? `
    <label class="block text-sm py-1 font-semibold border-b mb-1">
      <input type="checkbox" class="mr-2 select-all-checkbox" data-container="${containerId}" data-textid="${textId}" value="">
      ทั้งหมด
    </label>
  ` : '') + data.map(d => `
    <label class="block text-sm py-1">
      <input type="checkbox" value="${d.value}" class="mr-2 item-checkbox"
             data-container="${containerId}" data-textid="${textId}" data-label="${d.label}">
      ${d.label}
    </label>
  `).join("");

  const selectAllCb = el.querySelector('.select-all-checkbox');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', function () {
      el.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = this.checked);
      _syncCheckboxText(containerId, textId);
    });
  }
  el.querySelectorAll('.item-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const allItems = el.querySelectorAll('.item-checkbox');
      if (selectAllCb) selectAllCb.checked = [...allItems].every(c => c.checked);
      _syncCheckboxText(containerId, textId);
    });
  });
}

function _syncCheckboxText(containerId, textId) {
  const el = document.getElementById(containerId);
  const textEl = document.getElementById(textId);
  if (!el || !textEl) return;
  const labels = [...el.querySelectorAll('.item-checkbox:checked')]
    .map(cb => cb.dataset.label || cb.value);
  textEl.textContent = labels.length ? labels.join(", ") : "ทั้งหมด";
}

// ============================================================
// INIT
// ============================================================
let currentTargetId = null;
let branchData = [];


function getSelectedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input.item-checkbox:checked`)]
    .map(i => i.value)
    .filter(v => v);
}


// Show/hide loading for form fields
function showFormLoading(show) {
  const form = document.getElementById("targetForm");
  if (!form) return;
  
  let loader = document.getElementById("targetFormLoading");
  
  if (show) {
    if (!loader) {
      loader = document.createElement("div");
      loader.id = "targetFormLoading";
      loader.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255,255,255,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        flex-direction: column;
        gap: 12px;
      `;
      loader.innerHTML = `
        <svg class="animate-spin" style="width: 32px; height: 32px; color: #2563eb;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span style="color: #374151; font-weight: 500;">กำลังโหลดข้อมูล...</span>
      `;
      form.style.position = "relative";
      form.appendChild(loader);
    }
    loader.style.display = "flex";
  } else {
    if (loader) {
      loader.style.display = "none";
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {

  // Show loading while form data is being loaded
  showFormLoading(true);

  // 🔥 โหลด branch master ก่อนใช้งาน
  await loadBranchMaster();

  // 🔥 Ensure default options exist for all dropdowns
  ensureDefaultOptions();

  console.log("supplier-target.js loaded");
  updateLastModifiedLabel();
  await loadContactDropdown();
  await loadParentTargets();

  // Set default start date to current date
  const today = new Date();
  const tgStart = document.getElementById("tgStart");
  if (tgStart && !tgStart.value) {
    tgStart.value = today.toISOString().split("T")[0];
  }
  
  // โหลดสี + ความหนา ตามประเภทสินค้า
  const catSelect = document.getElementById("tgCat");
  if (catSelect) {
    catSelect.addEventListener("change", (e) => {
      const category = e.target.value;
      loadColors(category, "colorDropdown");
      loadThickness(category, "thickDropdown");
      loadGroups(category, "groupDropdown");
      loadSubGroups(category, "subDropdown");
    });
  }

  // ============================================================
  // 1️⃣ โหลด Coverage ของ Supplier
  // ============================================================
  if (window.supplierNo) {
    await loadCoverageToForm(window.supplierNo, {
      category: "tgCat",
      brand: "brand",
      group: "group",
      sub: "sub",
      sku: "tgSku"
    });

    // โหลด Group, Sub, Color, Thickness หลังจาก Coverage โหลดเสร็จ
    const catValue = document.getElementById("tgCat")?.value;
    if (catValue) {
      loadGroups(catValue, "groupDropdown");
      loadSubGroups(catValue, "subDropdown");
      loadColors(catValue, "colorDropdown");
      loadThickness(catValue, "thickDropdown");
    }
  }

  // ============================================================
  // Reload GROUP/SUB/COLOR/THICK when Category changes
  // ============================================================
  const catSelect2 = document.getElementById("tgCat");

  if (catSelect2) {
    catSelect2.addEventListener("change", () => {
      const cat = catSelect2.value;
      loadGroups(cat, "groupDropdown");
      loadSubGroups(cat, "subDropdown");
      loadColors(cat, "colorDropdown");
      loadThickness(cat, "thickDropdown");
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

      // multi-select values
      const brandCodes = getSelectedValues("brandDropdown");
      const groupCodes = getSelectedValues("groupDropdown");
      const subCodes   = getSelectedValues("subDropdown");
      const colorCodes = getSelectedValues("colorDropdown");
      const thickCodes = getSelectedValues("thickDropdown");

      // labels for display
      const brandLabels = [...document.querySelectorAll("#brandDropdown .item-checkbox:checked")].map(cb => cb.dataset.label || cb.value);
      const groupLabels = [...document.querySelectorAll("#groupDropdown .item-checkbox:checked")].map(cb => cb.dataset.label || cb.value);
      const subLabels   = [...document.querySelectorAll("#subDropdown .item-checkbox:checked")].map(cb => cb.dataset.label || cb.value);

      const benefitPeriod = document.getElementById("tgBenefit")?.value?.trim();
      const targetType = document.getElementById("tgType")?.value?.trim();
      const targetQty = document.getElementById("tgQty")?.value?.trim();
      const targetUnit = document.getElementById("tgUnit")?.value?.trim();
      const startDate = document.getElementById("tgStart")?.value?.trim();
      const endDate = document.getElementById("tgEnd")?.value?.trim();

      if (!targetName) return showToast("กรุณากรอกชื่อเป้าหมาย", true, "tgName");
      if (!category) return showToast("กรุณาเลือกประเภทสินค้า", true, "tgCat");
      if (brandCodes.length === 0) return showToast("กรุณาเลือกแบรนด์อย่างน้อย 1 รายการ", true);
      if (!benefitPeriod) return showToast("กรุณาเลือกระยะเวลาได้รับผลประโยชน์", true, "tgBenefit");
      if (!targetType) return showToast("กรุณาเลือกประเภทเป้า", true, "tgType");
      if (!targetQty) return showToast("กรุณากรอกเป้าหมาย/หน่วย", true, "tgQty");
      if (!targetUnit) return showToast("กรุณาเลือกหน่วย", true, "tgUnit");
      if (!startDate) return showToast("กรุณาเลือกวันที่เริ่มเป้า", true, "tgStart");
      if (!endDate) return showToast("กรุณาเลือกวันที่สิ้นสุดเป้า", true, "tgEnd");
      const startD = new Date(startDate);
      const endD = new Date(endDate);
      const diffDays = (endD - startD) / (1000 * 60 * 60 * 24);
      if (diffDays < 0) return showToast("วันที่สิ้นสุดต้องเป็นวันที่เดียวกับหรือหลังวันที่เริ่ม", true, "tgEnd");

      const payload = {
        supplier_code: window.supplierNo,
        provider_contact_id: document.getElementById("tgProvider")?.value || null,
        target_name: targetName,
        parent_target_ref: document.getElementById("tgParent")?.value || null,
        region: getSelectedValues("regionDropdown").join(",") || null,
        province: getSelectedValues("provinceDropdown").join(",") || null,
        branch: getSelectedValues("branchDropdown").join(",") || null,
        category: category,

        // multi-value fields — comma-separated codes (null ถ้าไม่เลือก)
        brand_code: brandCodes.length ? brandCodes.join(",") : null,
        brand_name: brandLabels.length ? brandLabels.join(",") : null,
        group_code: groupCodes.length ? groupCodes.join(",") : null,
        group_name: groupLabels.length ? groupLabels.join(",") : null,
        sub_group_code: subCodes.length ? subCodes.join(",") : null,
        sub_group_name: subLabels.length ? subLabels.join(",") : null,
        color: colorCodes.length ? colorCodes.join(",") : null,
        thickness: thickCodes.length ? thickCodes.join(",") : null,

        mold: document.getElementById("tgMold")?.value || "",
        sku: document.getElementById("tgSku")?.value || "",

        benefit_period: benefitPeriod,
        target_type: targetType,
        target_qty: targetQty,
        target_unit: targetUnit,

        start_date: convertToCE(startDate),
        end_date: convertToCE(endDate)
      };

      try {
        const res = await fetch(`${API_BASE}/api/targets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (result.success) {
          showToast("บันทึกเป้าสินค้าสำเร็จ", false);
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          showToast(result.message || "บันทึกไม่สำเร็จ", true);
        }

      } catch (err) {
        console.error("Save Target Error:", err);
        showToast("เกิดข้อผิดพลาด กรุณาลองใหม่", true);
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

document.addEventListener("change", (e) => {

  if (e.target.matches("#regionDropdown input")) {
    _syncCheckboxText("regionDropdown", "regionText");
  }

  if (e.target.matches("#provinceDropdown input")) {
    _syncCheckboxText("provinceDropdown", "provinceText");
  }

  if (e.target.matches("#branchDropdown input")) {
    _syncCheckboxText("branchDropdown", "branchText");
  }

});

  // ============================================================
  // 5️⃣ Initial Table Load
  // ============================================================
if (window.supplierNo) {
    loadTargetTable();
  }
  renderRegionDropdown();
  
  // Hide form loading after all data is loaded
  showFormLoading(false);
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

  // Show loading indicator
  showLoadingIndicator("tgTableBody", "กำลังโหลดข้อมูลเป้าหมาย...");

  try {
const res = await fetch(
  `${API_BASE}/api/targets/${window.supplierNo}?t=${Date.now()}`
);
const data = await res.json();

console.log("🔍 API Response:", data);

const tbody = document.getElementById("tgTableBody");
if (!tbody) return;

// Clear loading indicator
hideLoadingIndicator("tgTableBody");

tbody.innerHTML = "";

if (!Array.isArray(data)) {
  console.error("Invalid data format:", data);
  tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Failed to load data</td></tr>`;
  return;
}

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

  // แจ้งสถานะเมื่อโหลดเสร็จ
  const closedCount = data.filter(i => i.status === "CLOSED").length;
  const openCount = data.filter(i => i.status === "OPEN").length;
  const cancelledCount = data.filter(i => i.status === "CANCELLED").length;
  
  console.log(`สถานะเป้าสินค้า: OPEN=${openCount} | CLOSED=${closedCount} | CANCELLED=${cancelledCount}`);

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

  <!-- Parent/Sub Badge -->
  <div style="margin-bottom:4px;">
    ${
      item.parent_target_ref
        ? `<span style="background:#6c757d;color:#fff;padding:2px 6px;border-radius:8px;font-size:11px;">
             เป้าย่อย → ${item.parent_target_ref}
           </span>`
        : item.has_sub_targets === 1
          ? `<span style="background:#0d6efd;color:#fff;padding:2px 6px;border-radius:8px;font-size:11px;">
               เป้าหลัก
             </span>`
          : ""
    }
  </div>

  <!-- Target -->
  <div style="font-weight:600; font-size:15px;">
    ${Number(item.target_qty || 0).toLocaleString()} ${item.target_unit || ""}
  </div>

  <!-- Actual (ใช้ combined สำหรับเป้าหลัก) -->
  <div style="font-size:14px; margin-top:4px;">

  ${
    item.combined_actual_value != null && item.combined_actual_value !== undefined
      ? `${Number(item.combined_actual_value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${item.target_unit || ""}`
      : "-"
  }

  ${
    item.combined_achievement_percent != null && item.combined_achievement_percent !== undefined
      ? `<span style="font-size:13px; color:#6c757d;">
           (${Number(item.combined_achievement_percent).toFixed(2)}%)
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
// Convert CE (YYYY-MM-DD) to BE (พ.ศ.)
function convertToBE(dateStr) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-");
  const beYear = parseInt(year) + 543;
  return `${beYear}-${month}-${day}`;
}

// Convert BE to CE (พ.ศ. → ค.ศ.)
function convertToCE(dateStr) {
  if (!dateStr) return null;
  let year, month, day;
  
  if (dateStr.includes("/")) {
    // Format: DD/MM/YYYY
    const parts = dateStr.split("/");
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else {
    // Format: YYYY-MM-DD
    const parts = dateStr.split("-");
    year = parts[0];
    month = parts[1];
    day = parts[2];
  }
  
  let ceYear = parseInt(year);
  
  // ถ้าเป็น พ.ศ. (ปี > 2500) ให้แปลงเป็น ค.ศ.
  if (ceYear > 2500) {
    ceYear = ceYear - 543;
  }
  // ถ้าเป็น ค.ศ. เก่า (ปี < 1000) ให้แปลงเป็น พ.ศ.
  else if (ceYear < 1000) {
    ceYear = ceYear + 543;
  }
  return `${ceYear}-${month}-${day}`;
}

// ============================================================
// DATE FORMATTERS
// ============================================================
function formatDate(dateStr) {
  if (!dateStr) return "-";
  // Convert CE to BE for display
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  const beYear = date.getFullYear() + 543;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}/${month}/${beYear}`;
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

  const select = document.getElementById("tgProvider");
  if (!select) return;
  
  // Show loading indicator
  select.innerHTML = `<option value="">กำลังโหลด...</option>`;

  try {

    const res = await fetch(`${API_BASE}/api/suppliers/${window.supplierNo}/contacts`);
    const contacts = await res.json();

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
// LOAD PARENT TARGETS DROPDOWN
// ===================================================
let parentTargetsData = [];

async function loadParentTargets() {
  if (!window.supplierNo) return;

  const select = document.getElementById("tgParent");
  if (!select) return;

  select.innerHTML = `<option value="">- ไม่มี -</option>`;

  try {
    const res = await fetch(`${API_BASE}/api/targets/parents/${window.supplierNo}`);
    const targets = await res.json();

    parentTargetsData = targets;

    targets.forEach(t => {
      const option = document.createElement("option");
      option.value = t.target_ref;
      option.textContent = `${t.target_ref} - ${t.target_name}`;
      option.dataset.scope = JSON.stringify({
        region: t.region,
        province: t.province,
        branch: t.branch,
        category: t.category,
        brand: t.brand_code,       // comma-separated brand codes
        group: t.product_group_code,
        group_name: t.product_group,
        sub_group_code: t.sub_group_code,
        sub_group_name: t.sub_group,
        color: t.color,
        thickness: t.thickness,
        mold: t.mold,
        sku: t.sku
      });
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Load Parent Targets Error:", err);
  }
}

// ===================================================
// ON CHANGE PARENT TARGET -> AUTO FILL SCOPE
// ===================================================
document.getElementById("tgParent")?.addEventListener("change", (e) => {
  const selectedOption = e.target.selectedOptions[0];
  
  if (!selectedOption?.dataset.scope) {
    enableScopeFields();
    return;
  }

  const scope = JSON.parse(selectedOption.dataset.scope);
  disableScopeFields(scope);
});

function disableScopeFields(scope) {
  console.log("🔍 disableScopeFields scope:", scope);
  
  showScopeLoadingIndicator(true);
  
  // disable ปุ่ม toggle ของ dropdown แทน (ไม่มี element id ตรงๆ แล้ว)
  ["brandDropdown","groupDropdown","subDropdown","colorDropdown","thickDropdown"].forEach(id => {
    const toggle = document.querySelector(`[onclick="toggleDropdown('${id}')"]`);
    if (toggle) toggle.style.pointerEvents = "none";
  });
  const catEl = document.getElementById("tgCat");
  if (catEl) catEl.disabled = true;

  if (!window.COVERAGE_DATA || window.COVERAGE_DATA.length === 0) {
    loadCoverageToForm(window.supplierNo, {
      category: "tgCat",
      brand: "brand",
      group: "group",
      sub: "sub",
      sku: "tgSku"
    }).then(() => {
      setScopeValuesWithCategory(scope);
    });
  } else {
    setScopeValuesWithCategory(scope);
  }
}

async function setScopeValuesWithCategory(scope) {
  if (scope.category) {
    const catSelect = document.getElementById("tgCat");
    const foundCat = Array.from(catSelect?.options || []).find(opt => opt.value === scope.category || opt.text === scope.category);
    if (foundCat) {
      catSelect.value = foundCat.value;
      catSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  if (scope.category) {
    loadGroups(scope.category, "groupDropdown");
    loadSubGroups(scope.category, "subDropdown");
    loadColors(scope.category, "colorDropdown");
    loadThickness(scope.category, "thickDropdown");
  }
  
  await new Promise(resolve => setTimeout(resolve, 300));
  
  setScopeFieldValues(scope);
  handleRegionProvinceBranch(scope);
}

function setScopeFieldValues(scope) {
  // helper: set checkboxes in a dropdown by comma-separated value string
  function setCheckboxDropdown(dropdownId, valueStr) {
    if (!valueStr) return;
    const values = valueStr.split(",").map(v => v.trim()).filter(Boolean);
    const container = document.getElementById(dropdownId);
    if (!container) return;
    const textId = dropdownId.replace("Dropdown", "Text");
    container.querySelectorAll(".item-checkbox").forEach(cb => {
      cb.checked = values.includes(cb.value.trim());
    });
    _syncCheckboxText(dropdownId, textId);
    // sync select-all
    const allItems = container.querySelectorAll(".item-checkbox");
    const selectAll = container.querySelector(".select-all-checkbox");
    if (selectAll) selectAll.checked = allItems.length > 0 && [...allItems].every(c => c.checked);
  }

  setCheckboxDropdown("brandDropdown", scope.brand);
  setCheckboxDropdown("groupDropdown", scope.group);
  setCheckboxDropdown("subDropdown", scope.sub_group_code);
  setCheckboxDropdown("colorDropdown", scope.color);
  setCheckboxDropdown("thickDropdown", scope.thickness);

  // Mold
  if (scope.mold) {
    const moldSelect = document.getElementById("tgMold");
    if (moldSelect) {
      const found = Array.from(moldSelect.options).find(opt => opt.value === scope.mold);
      if (found) moldSelect.value = found.value;
    }
  }
  
  // SKU
  if (scope.sku) {
    const skuEl = document.getElementById("tgSku");
    if (skuEl) skuEl.value = scope.sku;
  }
}

function handleRegionProvinceBranch(scope) {
  // Region/Province/Branch Multi-select
  if (scope.region) {
    setMultiSelectValues("regionDropdown", scope.region);
    setTimeout(() => {
      setMultiSelectValues("provinceDropdown", scope.province);
      setTimeout(() => {
        setMultiSelectValues("branchDropdown", scope.branch);
        showScopeLoadingIndicator(false);
      }, 100);
    }, 100);
  } else if (scope.province) {
    renderAllProvinces().then(() => {
      setMultiSelectValues("provinceDropdown", scope.province);
      setTimeout(() => {
        setMultiSelectValues("branchDropdown", scope.branch);
        showScopeLoadingIndicator(false);
      }, 100);
    });
  } else if (scope.branch) {
    setMultiSelectValues("branchDropdown", scope.branch);
    showScopeLoadingIndicator(false);
  } else {
    showScopeLoadingIndicator(false);
  }
}

// Show/hide loading indicator for scope fields
function showScopeLoadingIndicator(show) {
  let loader = document.getElementById("scopeLoadingIndicator");
  
  if (show) {
    if (!loader) {
      loader = document.createElement("div");
      loader.id = "scopeLoadingIndicator";
      loader.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        background: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        border: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        gap: 12px;
      `;
      loader.innerHTML = `
        <svg class="animate-spin" style="width: 24px; height: 24px; color: #2563eb;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span style="color: #374151; font-weight: 500;">กำลังโหลดข้อมูลจากเป้าหลัก...</span>
      `;
      document.body.appendChild(loader);
    }
    loader.style.display = "flex";
  } else {
    if (loader) {
      loader.style.display = "none";
    }
  }
}

async function waitForDataLoad() {
  return new Promise(resolve => {
    // Wait for coverage data to be loaded
    const checkData = () => {
      if (window.COVERAGE_DATA && window.COVERAGE_DATA.length > 0) {
        resolve();
      } else {
        setTimeout(checkData, 50);
      }
    };
    checkData();
  });
}

// Helper to render all provinces (when region is not selected)
async function renderAllProvinces() {
  const provinceContainer = document.getElementById("provinceDropdown");
  if (!provinceContainer) return;
  
  // Get all unique provinces from branchData
  const provinces = [...new Set(branchData.map(b => b.province))];
  
  renderCheckboxList("provinceDropdown",
    provinces.map(p => ({ value: p, label: p }))
  );
}

function enableScopeFields() {
  const catEl = document.getElementById("tgCat");
  if (catEl) catEl.disabled = false;

  ["brandDropdown","groupDropdown","subDropdown","colorDropdown","thickDropdown"].forEach(id => {
    const toggle = document.querySelector(`[onclick="toggleDropdown('${id}')"]`);
    if (toggle) toggle.style.pointerEvents = "auto";
    // clear selections
    const container = document.getElementById(id);
    if (container) {
      container.querySelectorAll("input").forEach(cb => cb.checked = false);
      const textId = id.replace("Dropdown", "Text");
      _syncCheckboxText(id, textId);
    }
  });

  ["regionText", "provinceText", "branchText"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "ทั้งหมด";
  });
  ["regionDropdown", "provinceDropdown", "branchDropdown"].forEach(id => {
    const container = document.getElementById(id);
    if (container) container.querySelectorAll("input").forEach(cb => cb.checked = false);
  });
}

function setSelectValue(selectId, value) {
  const select = document.getElementById(selectId);
  if (select && value) {
    select.value = value;
  }
}

function setMultiSelectValues(dropdownId, valuesStr) {
  if (!valuesStr) return;
  
  const rawValues = valuesStr.split(",").map(v => v.trim()).filter(Boolean);
  const container = document.getElementById(dropdownId);
  const textId = dropdownId.replace("Dropdown", "Text");
  
  if (!container) return;
  
  container.querySelectorAll("input.item-checkbox").forEach(cb => {
    const cbValue = cb.value.trim();
    const isMatch = rawValues.some(v => cbValue === v);
    cb.checked = isMatch;
  });

  // sync select-all
  const allItems = container.querySelectorAll(".item-checkbox");
  const selectAll = container.querySelector(".select-all-checkbox");
  if (selectAll) selectAll.checked = allItems.length > 0 && [...allItems].every(c => c.checked);

  _syncCheckboxText(dropdownId, textId);
}

// ===================================================
// ENSURE DEFAULT OPTIONS — ไม่ใช้แล้ว (checkbox dropdown ไม่ต้องการ)
// ===================================================
function ensureDefaultOptions() {
  // no-op: brand/group/sub/color/thick ใช้ checkbox dropdown แล้ว
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
    <tr>
      <td colspan="100%" class="text-center py-4">
        <div class="flex items-center justify-center gap-2">
          <svg class="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-gray-500">${message}</span>
        </div>
      </td>
    </tr>
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

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showToast(message, isError = false, focusElementId = null) {
  const existingToast = document.getElementById('tgValidationToast');
  if (existingToast) existingToast.remove();

  document.querySelectorAll('.tg-validation-error').forEach(el => {
    el.classList.remove('tg-validation-error', 'ring-2', 'ring-red-500');
  });

  if (focusElementId) {
    const el = document.getElementById(focusElementId);
    if (el) {
      el.classList.add('tg-validation-error', 'ring-2', 'ring-red-500');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const toast = document.createElement('div');
  toast.id = 'tgValidationToast';
  toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in';
  toast.innerHTML = `
    <div class="${isError ? 'bg-red-500' : 'bg-green-500'} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2" style="min-width: 280px;">
      <i class="bi ${isError ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill'}"></i>
      <span class="font-medium">${message}</span>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('animate-fade-in');
    toast.classList.add('animate-fade-out');
    setTimeout(() => {
      toast.remove();
      if (isError) {
        document.querySelectorAll('.tg-validation-error').forEach(el => {
          el.classList.remove('tg-validation-error', 'ring-2', 'ring-red-500');
        });
      }
    }, 300);
  }, 3000);
}

window.showToast = showToast;

/* ===============================
    DEBUG TARGET CALCULATION
============================== */
async function debugTargetCalc(targetId) {
  try {
    const res = await fetch(`${API_BASE}/api/targets/debug-calculation/${targetId}`);
    const data = await res.json();
    
    console.log("🔍 Target Calculation Debug:", data);
    alert(`Target: ${data.target?.target_name}
Category: ${data.target?.category}
Brand: ${data.target?.brand_code}
Pattern: ${data.calculation?.sku_pattern}
Target Qty: ${data.calculation?.target_qty}
Actual Qty: ${data.calculation?.actual_qty}
Actual Amount: ${data.calculation?.actual_amount}
Actual Weight: ${data.calculation?.actual_weight}
Actual Area: ${data.calculation?.actual_area}
Actual Value: ${data.calculation?.actual_value}
Achievement: ${data.calculation?.achievement_percent?.toFixed(2)}%
Records: ${data.calculation?.record_count}

--- RAW DATA CHECK ---
Raw Count: ${data.debug?.raw_count}
Raw Sample: ${JSON.stringify(data.debug?.raw_data_sample, null, 2)}`);
  } catch (err) {
    console.error("Debug Error:", err);
    alert("Debug failed: " + err.message);
  }
}

window.debugTargetCalc = debugTargetCalc;
window.loadTargetTable = loadTargetTable;
