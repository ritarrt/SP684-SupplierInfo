console.log("supplier-deal.js loaded");
console.log("Module initialization complete");

// Show/hide loading for Deal form
function showDealFormLoading(show) {
  const form = document.getElementById("dealForm");
  if (!form) return;
  
  let loader = document.getElementById("dealFormLoading");
  
  if (show) {
    if (!loader) {
      loader = document.createElement("div");
      loader.id = "dealFormLoading";
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

// ============================================================
// HELPER FUNCTIONS TO MAP CODES TO NAMES
// ============================================================

function getCategoryName(code) {
  const data = window.COVERAGE_DATA || [];
  const item = data.find(d => d.category === code);
  return item?.category_name || code;
}

function getBrandName(code) {
  const data = window.COVERAGE_DATA || [];
  const item = data.find(d => d.brand === code);
  return item?.brand_name || code;
}

function getGroupName(code) {
  const data = window.COVERAGE_DATA || [];
  const item = data.find(d => d.group === code);
  return item?.group_name || code;
}

function getSubGroupName(code) {
  const data = window.COVERAGE_DATA || [];
  const item = data.find(d => d.subGroup === code);
  return item?.sub_group_name || code;
}

function getBranchName(code) {
  if (!code) return "-";
  const data = window.branchData || [];
  
  // Handle multiple branches separated by comma
  const codes = code.split(',').map(c => c.trim());
  const names = codes.map(c => {
    const item = data.find(d => d.branchCode === c);
    return item?.branchName || c;
  });
  
  return names.join(', ');
}

import { loadColors, loadThickness } from "../modules/master-helper.js";
import { loadCoverageToForm, loadGroups, loadSubGroups } from "../modules/coverage-helper.js";

let dealData = [];
let currentToggleDealId = null;
let currentDealStatus = null;
let branchData = [];
let allProjectPrices = [];

// ============================================================
// PRELOAD ALL PROJECT PRICES
// ============================================================
async function preloadAllProjectPrices() {
  const branches = branchData.map(b => b.branchCode).filter(code => code && code.length >= 4 && code !== 'on');
  console.log("Preloading project prices for", branches.length, "branches");
  
  allProjectPrices = [];
  
  for (const branchCode of branches) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${window.API_BASE}/api/suppliers/project-prices?branch=${branchCode}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const projects = await response.json();
        allProjectPrices.push(...projects.map(p => ({ ...p, branch_code: branchCode })));
        console.log(`Loaded ${projects.length} projects from branch ${branchCode}`);
      }
    } catch (err) {
      console.warn(`Skipping branch ${branchCode}:`, err.name === 'AbortError' ? 'timeout' : err.message);
    }
  }
  
  console.log("Total preloaded projects:", allProjectPrices.length);
}

// ============================================================
// DROPDOWN TOGGLE
// ============================================================
window.toggleDropdown = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden");
};

function getSelectedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)]
    .map(i => i.value)
    .filter(v => v); // กรองค่าว่างออก
}

function renderCheckboxList(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;
  
  const isMultiSelect = containerId.includes("Dropdown");
  
  el.innerHTML = (isMultiSelect && data.length > 0 ? `
    <label class="block text-sm py-1 font-semibold border-b mb-1">
      <input type="checkbox" class="mr-2 select-all-checkbox" data-container="${containerId}">
      ทั้งหมด
    </label>
  ` : '') + data.map(d => `
    <label class="block text-sm py-1">
      <input type="checkbox" value="${d.value}" class="mr-2 item-checkbox" data-container="${containerId}">
      ${d.label}
    </label>
  `).join("");
  
  if (isMultiSelect && data.length > 0) {
    el.querySelector('.select-all-checkbox')?.addEventListener('change', function() {
      const container = this.dataset.container;
      const checkboxes = document.querySelectorAll(`#${container} .item-checkbox`);
      checkboxes.forEach(cb => cb.checked = this.checked);
      updateSelectedText(container, container.replace('Dropdown', 'Text'));
    });
  }
}

function updateSelectedText(containerId, textId) {
  const values = [...document.querySelectorAll(`#${containerId} input:checked`)]
    .map(i => i.parentElement.textContent.trim())
    .filter(t => t !== "ทั้งหมด");

  document.getElementById(textId).innerText =
    values.length ? values.join(", ") : "ทั้งหมด";
}

async function loadBranchMaster() {
  try {
    const res = await fetch(`${window.API_BASE}/api/master/branches`);
    if (!res.ok) throw new Error(await res.text());
    branchData = await res.json();
    console.log("✅ branchData loaded:", branchData.length);
  } catch (err) {
    console.error("❌ Load branch master error:", err);
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


/* ===============================
   INIT
 =============================== */
document.addEventListener("DOMContentLoaded", async () => {

  const supplierNo = window.supplierNo;
  if (!supplierNo) return;

  // Show form loading
  showDealFormLoading(true);

  // 🔥 โหลด branch master ก่อนใช้งาน
  await loadBranchMaster();
  
  // 🔥 โหลด project prices จากทุกสาขาไว้ล่วงหน้า
  preloadAllProjectPrices();

  // Set default start date to current date
  const today = new Date();
  const dealStart = document.getElementById("dealStart");
  if (dealStart && !dealStart.value) {
    dealStart.value = today.toISOString().split("T")[0];
  }

  // ============================================================
  // 1️⃣ โหลด Coverage ของ Supplier
  // ============================================================
  if (window.supplierNo) {
    await loadCoverageToForm(window.supplierNo, {
      category: "dealCat",
      brand: "dealBrand",
      group: "dealGroup",
      sub: "dealSub",
      color: "dealColor",
      thickness: "dealThick",
      sku: "dealSku"
    });
  }

  // ============================================================
  // Reload GROUP when Category / Brand change
  // ============================================================
  const catSelect = document.getElementById("dealCat");
  const brandSelect = document.getElementById("dealBrand");

  if (catSelect) {
    catSelect.addEventListener("change", () => {
      loadGroups(catSelect.value, "dealGroup");
      loadColors(catSelect.value, "dealColor");
      loadThickness(catSelect.value, "dealThick");
    });

    // โหลด group เมื่อ category เปลี่ยน
    loadGroups(catSelect.value, "dealGroup");
  }

  const groupSelect = document.getElementById("dealGroup");

  if (groupSelect) {
    groupSelect.addEventListener("change", () => {
      loadSubGroups(
        catSelect.value,
        "dealSub"
      );
    });
  }

  // ============================================================
  // 🔥 Auto-set condition mode to limited when project_no is filled
  // ============================================================
  const projectNoInput = document.getElementById("dealProjectNo");
  const conditionModeSelect = document.getElementById("dealConditionMode");

  if (projectNoInput && conditionModeSelect) {
    projectNoInput.addEventListener("input", () => {
      if (projectNoInput.value.trim()) {
        // When project_no is filled, set condition mode to limited
        conditionModeSelect.value = "limited";
        toggleDealConditionMode();
        // Disable condition mode selector
        conditionModeSelect.disabled = true;
      } else {
        // When project_no is cleared, enable condition mode selector
        conditionModeSelect.disabled = false;
      }
    });

    // ============================================================
    // 🔥 Autocomplete for Project No. using API
    // ============================================================
    let projectSearchTimeout = null;
    const projectDropdownId = "dealProjectNoDropdown";

    // Create dropdown container if not exists
    let projectDropdown = document.getElementById(projectDropdownId);
    if (!projectDropdown) {
      projectDropdown = document.createElement("div");
      projectDropdown.id = projectDropdownId;
      projectDropdown.className = "absolute z-50 bg-white border rounded-lg shadow w-full max-h-56 overflow-y-auto hidden";
      projectNoInput.parentElement.style.position = "relative";
      projectNoInput.parentElement.appendChild(projectDropdown);
    }

    projectNoInput.addEventListener("input", async (e) => {
      const searchText = e.target.value.trim();

      // Clear previous timeout
      if (projectSearchTimeout) clearTimeout(projectSearchTimeout);

      if (searchText.length < 2) {
        projectDropdown.classList.add("hidden");
        projectDropdown.innerHTML = "";
        return;
      }

      // Debounce search
      projectSearchTimeout = setTimeout(async () => {
        // Use preloaded data
        const allProjects = allProjectPrices;
        console.log("Using preloaded projects:", allProjects.length);

        if (allProjects.length === 0) {
          projectDropdown.innerHTML = '<div class="p-2 text-sm text-gray-500">กำลังโหลดข้อมูลโปรเจค...</div>';
          projectDropdown.classList.remove("hidden");
          return;
        }

        // Filter by search text
        const filteredProjects = allProjects.filter(p =>
          (p.project_code && p.project_code.toLowerCase().includes(searchText.toLowerCase())) ||
          (p.project_name && p.project_name.toLowerCase().includes(searchText.toLowerCase()))
        );

        if (filteredProjects.length === 0) {
          projectDropdown.innerHTML = '<div class="p-2 text-sm text-gray-500">ไม่พบข้อมูลโปรเจค</div>';
        } else {
          projectDropdown.innerHTML = filteredProjects.map(p => `
            <div class="p-2 hover:bg-gray-100 cursor-pointer project-option"
                 data-project-code="${p.project_code || ''}"
                 data-project-name="${p.project_name || ''}">
              <div class="font-semibold">${p.project_code || '-'}</div>
              <div class="text-sm text-gray-600">${p.project_name || '-'}</div>
            </div>
          `).join("");
        }
        projectDropdown.classList.remove("hidden");

          // Add click handlers
          projectDropdown.querySelectorAll(".project-option").forEach(option => {
            option.addEventListener("click", () => {
              projectNoInput.value = option.dataset.projectCode;
              projectDropdown.classList.add("hidden");
              projectDropdown.innerHTML = "";
            });
          });

      }, 300);
    });

    // Hide dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!projectNoInput.contains(e.target) && !projectDropdown.contains(e.target)) {
        projectDropdown.classList.add("hidden");
      }
    });
  }

  // ============================================================
  // Initialize stepped pricing
  // ============================================================
  toggleDealConditionMode();

  loadDealList(supplierNo);
  renderDealRegionDropdown();
  loadDealProviderOptions(supplierNo);
  
  // Hide form loading after all data is loaded
  showDealFormLoading(false);

  // ============================================================
  // 🔥 CLOSE DROPDOWNS WHEN CLICKING OUTSIDE
  // ============================================================
  document.addEventListener("click", (e) => {
    const dropdowns = ["dealRegionDropdown", "dealProvinceDropdown", "dealBranchDropdown"];

    dropdowns.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;

      if (!el.contains(e.target) && !e.target.closest(`[onclick*="${id}"]`)) {
        el.classList.add("hidden");
      }
    });
  });

  /* ===============================
     🔥 SAVE DEAL BUTTON
  ================================ */
  const btn = document.getElementById("submitDealBtn");

  if (btn) {
    btn.addEventListener("click", async () => {

      const conditionMode = document.getElementById("dealConditionMode")?.value || "limited";

      // Validate required fields
      const dealName = document.getElementById("dealName")?.value;
      const region = getSelectedValues("dealRegionDropdown").filter(v => v !== "on").join(",");
      const province = getSelectedValues("dealProvinceDropdown").filter(v => v !== "on").join(",");
      const branch = getSelectedValues("dealBranchDropdown").filter(v => v !== "on").join(",");
      const category = document.getElementById("dealCat")?.value;
      const brand = document.getElementById("dealBrand")?.value;
      const productGroup = document.getElementById("dealGroup")?.value;
      const dealType = document.getElementById("dealType")?.value;
      const priceValue = parseFloat(document.getElementById("dealPrice")?.value);
      const priceUnit = document.getElementById("dealUnit")?.value;

      if (!dealName) {
        showSaveMessage("กรุณากรอกชื่อดีลราคา", true);
        return;
      }

      if (!region) {
        showSaveMessage("กรุณาเลือกภาค", true);
        return;
      }

      if (!province) {
        showSaveMessage("กรุณาเลือกจังหวัด", true);
        return;
      }

      if (!branch) {
        showSaveMessage("กรุณาเลือกสาขา", true);
        return;
      }

      if (!category) {
        showSaveMessage("กรุณาเลือกประเภทสินค้า", true);
        return;
      }

      if (!brand) {
        showSaveMessage("กรุณาเลือกแบรนด์", true);
        return;
      }

      if (!productGroup || productGroup === "-") {
        showSaveMessage("กรุณาเลือกกลุ่มสินค้า", true);
        return;
      }

      if (!dealType) {
        showSaveMessage("กรุณาเลือกประเภทดีล", true);
        return;
      }

      const dealStart = document.getElementById("dealStart")?.value;
      const dealEnd = document.getElementById("dealEnd")?.value;

      if (!dealStart) {
        showSaveMessage("กรุณาเลือกวันที่เริ่มดีลราคา", true);
        return;
      }
      if (!dealEnd) {
        showSaveMessage("กรุณาเลือกวันที่สิ้นสุดดีลราคา", true);
        return;
      }
      const startD = new Date(dealStart);
      const endD = new Date(dealEnd);
      const diffDays = (endD - startD) / (1000 * 60 * 60 * 24);
      if (diffDays < 0) {
        showSaveMessage("วันที่สิ้นสุดต้องเป็นวันที่เดียวกับหรือหลังวันที่เริ่ม", true);
        return;
      }

      // Validate based on condition mode
      if (conditionMode === "normal") {
        // Normal mode - validate price
        if (isNaN(priceValue) || priceValue < 0) {
          showSaveMessage("กรุณากรอกราคาที่ถูกต้อง", true);
          return;
        }
        if (!priceUnit) {
          showSaveMessage("กรุณาเลือกหน่วยราคา", true);
          return;
        }
      } else if (conditionMode === "limited") {
        // Limited mode - validate limited_qty
        const limitedQty = parseFloat(document.getElementById("dealLimitedQty")?.value);
        if (isNaN(limitedQty) || limitedQty <= 0) {
          showSaveMessage("กรุณากรอกจำนวนจำกัดที่ถูกต้อง", true);
          return;
        }
      } else if (conditionMode === "stepped") {
        // Stepped mode - validate steps
        const steps = getDealSteps();
        if (steps.length === 0) {
          showSaveMessage("กรุณาเพิ่มขั้นบันได้อย่างน้อย 1 ขั้น", true);
          return;
        }

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (step.from_qty >= step.to_qty) {
            showSaveMessage(`จำนวนเริ่มต้นต้องน้อยกว่าจำนวนสิ้นสุด (ขั้นที่ ${i + 1})`, true);
            return;
          }
          if (step.price_value < 0) {
            showSaveMessage(`ราคาต้องไม่ติดลบ (ขั้นที่ ${i + 1})`, true);
            return;
          }
        }
      }

      const payload = {
        deal_name: dealName,
        contact_person: document.getElementById("dealProvider")?.value,
        project_no: document.getElementById("dealProjectNo")?.value || null,
        region: region || null,
        province: province || null,
        branch: branch || null,
        category: category,
        brand: brand,
        product_group: productGroup,
        sub_group: document.getElementById("dealSub")?.value,
        color: document.getElementById("dealColor")?.value,
        thickness: document.getElementById("dealThick")?.value,
        mold: document.getElementById("dealMold")?.value,
        sku: document.getElementById("dealSku")?.value,
        deal_type: dealType,
        price_value: (conditionMode === "normal" || conditionMode === "limited") ? priceValue : null,
        price_unit: (conditionMode === "normal" || conditionMode === "limited") ? priceUnit : null,
        condition_mode: conditionMode,
        limited_qty: conditionMode === "limited" ? parseFloat(document.getElementById("dealLimitedQty")?.value) || 0 : null,
        limited_unit: conditionMode === "limited" ? document.getElementById("dealLimitedUnit")?.value : null,
        limited_type: conditionMode === "limited" ? document.getElementById("dealLimitedType")?.value : null,
        limited_discount_value: conditionMode === "limited" ? parseFloat(document.getElementById("dealLimitedDiscount")?.value) || 0 : null,
        limited_discount_unit: conditionMode === "limited" ? document.getElementById("dealLimitedDiscountUnit")?.value : null,
        steps: conditionMode === "stepped" ? getDealSteps() : null,
        start_date: document.getElementById("dealStart")?.value || null,
        end_date: document.getElementById("dealEnd")?.value || null,
        note: document.getElementById("dealNote")?.value
      };

      try {

        // Check if we're in edit mode
        const isEditMode = btn.dataset.editMode === "true";
        const dealId = window.editingDealId;
        const isReopening = window.isReopeningDeal;

        let res;
        if (isReopening) {
          // Reopen cancelled deal as new deal
          res = await fetch(
            `${window.API_BASE}/api/suppliers/${supplierNo}/deals`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, is_reopen: true, old_deal_id: isReopening })
            }
          );
        } else if (isEditMode && dealId) {
          // Update existing deal
          res = await fetch(
            `${window.API_BASE}/api/suppliers/${supplierNo}/deals/${dealId}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }
          );
        } else {
          // Create new deal
          res = await fetch(
            `${window.API_BASE}/api/suppliers/${supplierNo}/deals`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }
          );
        }

        if (!res.ok) throw new Error(await res.text());

        const resData = await res.json().catch(() => ({}));
        if (isReopening) {
          showSaveMessage("ทำซ้ำรายการสำเร็จ (ดีลเดิมถูกยกเลิก)");
        } else {
          showSaveMessage(isEditMode ? "แก้ไขดีลสำเร็จ" : "บันทึกดีลสำเร็จ");
        }

        // Reset form and button
        if (isEditMode || isReopening) {
          btn.innerHTML = '<i class="bi bi-save"></i> บันทึก';
          btn.dataset.editMode = "false";
          window.editingDealId = null;
          window.isReopeningDeal = null;
        }

        // Hide cancel button after save
        const cancelBtn = document.getElementById("cancelDealEditBtn");
        if (cancelBtn) {
          cancelBtn.classList.add("hidden");
        }

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
  const btnOpen = document.getElementById("dealStatusOpenBtn");
  const btnUse = document.getElementById("dealStatusUseBtn");
  const btnCancel = document.getElementById("dealStatusCancelBtn");

  if (btnNo) {
    btnNo.addEventListener("click", () => {
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      currentToggleDealId = null;
    });
  }

  async function updateDealStatus(status) {
    const supplierNo = window.supplierNo;
    if (!supplierNo || !currentToggleDealId) return;

    try {
      const res = await fetch(
        `${window.API_BASE}/api/suppliers/${supplierNo}/deals/${currentToggleDealId}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.error || await res.text();
        throw new Error(errorMessage);
      }

      const resData = await res.json().catch(() => ({}));

      // If reopening (creating new deal), redirect to edit the new deal
      if (resData.is_reopen && resData.new_deal_id) {
        showSaveMessage("ทำซ้ำดีลสำเร็จ กรุณาแก้ไขวันที่และบันทึก");
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        openEditDealModal(resData.new_deal_id);
        return;
      }

      showSaveMessage("เปลี่ยนสถานะดีลสำเร็จ");

      modal.classList.add("hidden");
      modal.classList.remove("flex");

      await loadDealList(supplierNo);

    } catch (err) {
      console.error("❌ Update deal status error", err);
      showSaveMessage("ไม่สามารถเปลี่ยนสถานะได้", true);
    }
  }

  // 🔥 Direct status change without confirmation delay

  function handleStatusClick(status, btn) {
    // Direct status update without delay
    updateDealStatus(status);
  }

  if (btnOpen) {
    btnOpen.addEventListener("click", () => handleStatusClick("OPEN", btnOpen));
  }

  if (btnUse) {
    btnUse.addEventListener("click", () => handleStatusClick("USE", btnUse));
  }

  if (btnCancel) {
    btnCancel.addEventListener("click", () => handleStatusClick("CANCELLED", btnCancel));
  }

  // Cancel edit button
  const cancelEditBtn = document.getElementById("cancelDealEditBtn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      cancelDealEdit();
    });
  }

});


/* ===============================
   LOAD DEAL LIST
================================ */
async function loadDealList(supplierNo) {

  // Show loading indicator
  showLoadingIndicator("dealTableBody", "กำลังโหลดข้อมูลดีล...");

  try {

    const res = await fetch(
      `${window.API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/deals`
    );

    if (!res.ok) throw new Error(await res.text());

    dealData = await res.json();
    renderDealTable();

  } catch (err) {
    console.error("❌ Load deal error", err);
    // Hide loading indicator on error
    hideLoadingIndicator("dealTableBody");
  }
}


/* ===============================
    RENDER TABLE
 =============================== */

function renderDealTable() {
  const tbody = document.getElementById("dealTableBody");
  const countEl = document.getElementById("dealRecordCount");

  if (!tbody) return;
  
  // Clear loading indicator
  hideLoadingIndicator("dealTableBody");

  const filterValue =
    document.querySelector("input[name='dealFilter']:checked")?.value;

  let rows = [...dealData];

  if (filterValue === "active") {
    rows = rows.filter(r => r.status === "OPEN" || r.status === "USE");
  }

  if (filterValue === "closed") {
    rows = rows.filter(r => r.status === "CLOSED");
  }

  if (filterValue === "cancelled") {
    rows = rows.filter(r => r.status === "CANCELLED");
  }

  tbody.innerHTML = "";

  rows.forEach((r, idx) => {

    const tr = document.createElement("tr");

    // Build condition text
    let conditionText = "";
    if (r.condition_mode === "normal") {
      conditionText = `<div class="text-muted">ราคาปกติ</div>`;
    } else if (r.condition_mode === "limited") {
      const limitQty = r.limited_qty || 0;
      const limitUnit = r.limited_unit || "ชิ้น";
      
      // Only show actual values if deal status is 'USE'
      if (r.status === 'USE') {
        const actualValue = r.actual_value || 0;
        const achievementPercent = r.achievement_percent || 0;
        const isLimitReached = r.is_limit_reached || false;
        const isLimitExceeded = r.is_limit_exceeded || false;
        
        // Format actual value based on unit (same logic as target module)
        let actualDisplay = "";
        if (limitUnit === 'ตัน' || limitUnit === 'ton') {
          // Use actual_value which is already converted to tons by backend
          actualDisplay = `${Number(r.actual_value || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ตัน`;
        } else if (limitUnit === 'บาท') {
          // Use actual_value which is already set to actual_amount by backend
          actualDisplay = `${Number(r.actual_value || 0).toLocaleString()} บาท`;
        } else {
          // Default: use actual_value which is already set to actual_qty by backend
          actualDisplay = `${Number(r.actual_value || 0).toLocaleString()} ${limitUnit}`;
        }
        
        // Status badge
        const statusBadge = isLimitExceeded
          ? `<span style="background:#dc3545;color:#fff;padding:2px 6px;border-radius:8px;font-size:11px;margin-left:4px;">เกิน</span>`
          : isLimitReached
            ? `<span style="background:#198754;color:#fff;padding:2px 6px;border-radius:8px;font-size:11px;margin-left:4px;">ครบแล้ว</span>`
            : achievementPercent >= 80
              ? `<span style="background:#ffc107;color:#000;padding:2px 6px;border-radius:8px;font-size:11px;margin-left:4px;">ใกล้ครบ</span>`
              : '';
        
        conditionText = `
          <div class="text-muted">จำกัด: ${limitQty.toLocaleString()} ${limitUnit}</div>
          <div style="font-size:13px;margin-top:2px;">
            รับแล้ว: ${actualDisplay}
            ${achievementPercent !== null && achievementPercent !== undefined ? `<span style="color:#6c757d;font-size:12px;">(${Number(achievementPercent).toFixed(0)}%)</span>` : ''}
            ${statusBadge}
          </div>
          ${isLimitExceeded ? `<div style="font-size:11px;color:#dc3545;margin-top:2px;">⚠️ รับมาเกิน ${(Number(actualValue) - Number(limitQty)).toLocaleString()} ${limitUnit}</div>` : ''}
        `;
      } else {
        // Deal is not in USE status, show 'ยังไม่เปิดใช้งาน'
        conditionText = `
          <div class="text-muted">จำกัด: ${limitQty.toLocaleString()} ${limitUnit}</div>
          <div style="font-size:13px;margin-top:2px;color:#6c757d;">
            ยังไม่เปิดใช้งาน
          </div>
        `;
      }
    } else if (r.condition_mode === "stepped" && r.steps && r.steps.length > 0) {
      const stepParts = r.steps.map((step, stepIdx) =>
        `<span class="text-muted">${step.from_qty}-${step.to_qty}${step.unit || "ชิ้น"}</span> <span class="fw-bold text-success">${step.price_value}${step.price_unit}</span>`
      );
      
      // Only show actual values if deal status is 'USE'
      if (r.status === 'USE') {
        const actualQty = r.actual_qty || 0;
        conditionText = `
          <div class="text-muted small">ขั้นบันได: ${stepParts.join(" | ")}</div>
          <div style="font-size:13px;margin-top:2px;">
            รับแล้ว: ${Number(actualQty).toLocaleString()} ชิ้น
          </div>
        `;
      } else {
        // Deal is not in USE status, show 'ยังไม่เปิดใช้งาน'
        conditionText = `
          <div class="text-muted small">ขั้นบันได: ${stepParts.join(" | ")}</div>
          <div style="font-size:13px;margin-top:2px;color:#6c757d;">
            ยังไม่เปิดใช้งาน
          </div>
        `;
      }
    }

    tr.innerHTML = `
      <td>${idx + 1}</td>

      <td>
        ${(() => {
          const isExpired = r.end_date && new Date() > new Date(r.end_date);
          const statusStyle = r.status === "OPEN" 
            ? isExpired ? "background:#0d6efd;color:#fff;" : "background:#198754;color:#fff;" 
            : r.status === "USE" 
              ? isExpired ? "background:#0d6efd;color:#fff;" : "background:#ffc107;color:#000;" 
              : r.status === "CLOSED" 
                ? "background:#0d6efd;color:#fff;" 
                : "background:#dc3545;color:#fff;";
          const isClosedAndExpired = r.status === "CLOSED" && isExpired;
          return `
            <span
              class="badge"
              style="cursor:pointer;${statusStyle}padding:6px 16px;border-radius:20px;font-weight:600;font-size:13px;display:inline-block;"
              data-deal-id="${r.deal_id}"
              data-deal-status="${r.status}"
              data-has-been-used="${r.has_been_used ? '1' : '0'}"
            >
              ${r.status}
            </span>
            ${isClosedAndExpired ? `
              <span style="background:#0d6efd;color:#fff;padding:3px 8px;border-radius:12px;font-size:12px;margin-left:4px;display:inline-block;">
                ปิดแล้ว
              </span>
            ` : ''}
          `;
        })()}
      </td>

      <td>
        ${(() => {
          const isExpired = r.end_date && new Date() > new Date(r.end_date);
          const canEdit = 
            (r.status === 'OPEN' && !r.has_been_used && !isExpired) ||
            ((r.status === 'CANCELLED' || r.status === 'CLOSED') && (r.has_been_used || isExpired));
          
          return canEdit ? `
            <button
              class="btn btn-sm btn-outline-primary edit-deal-btn d-flex align-items-center gap-1"
              data-deal-id="${r.deal_id}"
              title="แก้ไขดีล"
              style="font-size: 0.75rem; padding: 0.25rem 0.5rem;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
              </svg>
              <span>แก้ไข</span>
            </button>
          ` : '';
        })()}
      </td>

      <td>
        <div class="fw-bold">${r.deal_ref || "-"}</div>
        <div class="text-muted small">${r.deal_name || "-"}</div>
        ${r.project_no ? `<div class="text-muted small">Project: ${r.project_no}</div>` : ""}
      </td>

      <td class="small">
  <div><strong>${r.region || "-"} / ${r.province || "-"} / ${getBranchName(r.branch) || "-"}</strong></div>

  <div>
    ${getCategoryName(r.category) || "-"} / ${getBrandName(r.brand) || "-"}
  </div>

  <div>
    ${getGroupName(r.product_group) || "-"} / ${getSubGroupName(r.sub_group) || "-"}
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
  ${r.condition_mode === 'normal' ? `<div class="fw-bold">
    ${r.price_value || 0} ${r.price_unit || ""}
  </div>` : ''}

  <div>
    ประเภทดีล: ${r.deal_type || "-"}
  </div>

  ${conditionText}

  <div>
    เริ่ม: ${formatThaiDate(r.start_date)}
  </div>

  <div>
    สิ้นสุด: ${formatThaiDate(r.end_date)}${(() => {
      const isExpired = r.end_date && new Date() > new Date(r.end_date);
      return r.status === "CLOSED" && isExpired ? ` <span style="background:#0d6efd;color:#fff;padding:2px 6px;border-radius:8px;font-size:11px;">ปิดแล้ว</span>` : '';
    })()}
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

  // Add click event listeners for status badges (XSS prevention)
  tbody.querySelectorAll('.badge').forEach(badge => {
    badge.addEventListener('click', function() {
      const dealId = this.dataset.dealId;
      const dealStatus = this.dataset.dealStatus;
      const hasBeenUsed = this.dataset.hasBeenUsed === '1';
      openDealModal(dealId, dealStatus, hasBeenUsed);
    });
  });

  // Add click event listeners for edit buttons (XSS prevention)
  tbody.querySelectorAll('.edit-deal-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const dealId = this.dataset.dealId;
      openEditDealModal(dealId);
    });
  });
}


/* ===============================
   OPEN DEAL MODAL
================================ */
function openDealModal(dealId, status, hasBeenUsed = false) {

  currentToggleDealId = dealId;
  currentDealStatus = status;

  // Get deal data to check expiration
  const deal = dealData.find(d => d.deal_id == dealId);
  const isExpired = deal?.end_date && new Date() > new Date(deal.end_date);

  const modal = document.getElementById("cancelDealModal");
  const message = document.getElementById("dealModalMessage");
  const btnOpen = document.getElementById("dealStatusOpenBtn");
  const btnUse = document.getElementById("dealStatusUseBtn");
  const btnCancel = document.getElementById("dealStatusCancelBtn");

  if (!modal) return;

  // Show all buttons first
  btnOpen?.classList.remove("hidden");
  btnUse?.classList.remove("hidden");
  btnCancel?.classList.remove("hidden");

  // Hide the button that matches the current status and set appropriate message
  if (status === "OPEN") {
    btnOpen?.classList.add("hidden");
    message.innerHTML =
      "ดีลราคากำลังเปิดใช้งาน<br>ต้องการเปลี่ยนสถานะหรือไม่?";
  } else if (status === "USE") {
    btnUse?.classList.add("hidden");
    // Also hide OPEN button since USE cannot be changed back to OPEN
    btnOpen?.classList.add("hidden");
    message.innerHTML =
      "ดีลราคาถูกใช้งานอยู่<br>ต้องการเปลี่ยนสถานะหรือไม่?";
  } else if (status === "CANCELLED") {
    btnCancel?.classList.add("hidden");
    // Hide USE button - cancelled deals must be OPEN first before USE
    btnUse?.classList.add("hidden");
    // For deals that have been used before OR have expired, require changing dates via edit
    if (hasBeenUsed || isExpired) {
      btnOpen?.classList.add("hidden");
      window.pendingReopenDeal = { dealId, hasBeenUsed };
      message.innerHTML =
        "ดีลราคาถูกยกเลิกแล้ว<br>⚠️ ดีลนี้เคยใช้งานมาก่อน กรุณาคลิกปุ่ม <strong>แก้ไข</strong> เพื่อเปลี่ยนวันที่และทำซ้ำรายการ";
    } else {
      message.innerHTML =
        "ดีลราคาถูกยกเลิกแล้ว<br>ต้องการทำซ้ำรายการหรือไม่?";
    }
  } else if (status === "CLOSED") {
    btnCancel?.classList.add("hidden");
    // Hide USE button - closed deals must be OPEN first before USE
    btnUse?.classList.add("hidden");
    // For deals that have been used before OR have expired, require changing dates via edit
    if (hasBeenUsed || isExpired) {
      btnOpen?.classList.add("hidden");
      window.pendingReopenDeal = { dealId, hasBeenUsed };
      message.innerHTML =
        "ดีลราคาปิดแล้ว<br>⚠️ ดีลนี้เคยใช้งานมาก่อน กรุณาคลิกปุ่ม <strong>แก้ไข</strong> เพื่อเปลี่ยนวันที่และทำซ้ำรายการ";
    } else {
      message.innerHTML =
        "ดีลราคาปิดแล้ว<br>ต้องการทำซ้ำรายการหรือไม่?";
    }
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}


/* ===============================
   OPEN EDIT DEAL MODAL
================================ */
function openEditDealModal(dealId) {
  const deal = dealData.find(d => d.deal_id == dealId);
  if (!deal) {
    showSaveMessage("ไม่พบดีลที่ต้องการ", true);
    return;
  }

  // Only allow editing if status is OPEN and has not been used, or CANCELLED/CLOSED (for reopening)
  if (deal.status === 'USE') {
    showSaveMessage("ไม่สามารถแก้ไขได้ เนื่องจากดีลกำลังถูกใช้งาน", true);
    return;
  }

  // For CANCELLED/CLOSED deals that have been used or have expired, require changing dates
  const isReopening = (deal.status === 'CANCELLED' || deal.status === 'CLOSED') && (deal.has_been_used || (deal.end_date && new Date() > new Date(deal.end_date)));
  if (isReopening) {
    const isExpired = deal.end_date && new Date() > new Date(deal.end_date);
    showSaveMessage(isExpired ? "⚠️ ดีลหมดอายุแล้ว กรุณาเปลี่ยนวันที่เริ่มใช้ราคาและวันสิ้นสุดให้ต่างจากเดิม" : "⚠️ กรุณาเปลี่ยนวันที่เริ่มใช้ราคาและวันสิ้นสุดให้ต่างจากเดิม", false);
  }

  // Populate form with deal data
  document.getElementById("dealName").value = deal.deal_name || '';
  document.getElementById("dealProvider").value = deal.contact_person || '';
  document.getElementById("dealProjectNo").value = deal.project_no || '';
  document.getElementById("dealType").value = deal.deal_type || '';
  document.getElementById("dealConditionMode").value = deal.condition_mode || 'limited';
  document.getElementById("dealPrice").value = deal.price_value || '';
  document.getElementById("dealUnit").value = deal.price_unit || '';
  document.getElementById("dealLimitedQty").value = deal.limited_qty || '';
  document.getElementById("dealLimitedUnit").value = deal.limited_unit || '';
  document.getElementById("dealStart").value = convertDateFormat(deal.start_date);
  document.getElementById("dealEnd").value = convertDateFormat(deal.end_date);
  document.getElementById("dealNote").value = deal.note || '';

  // Set category, brand, group, sub, color, thickness, mold, sku
  if (deal.category) {
    document.getElementById("dealCat").value = deal.category;
    // Trigger change event to load groups and colors/thickness
    const catChangeEvent = new Event('change', { bubbles: true });
    document.getElementById("dealCat").dispatchEvent(catChangeEvent);
  }
  if (deal.brand) {
    document.getElementById("dealBrand").value = deal.brand;
    // Trigger change event to load groups
    const brandChangeEvent = new Event('change', { bubbles: true });
    document.getElementById("dealBrand").dispatchEvent(brandChangeEvent);
  }
  
  // Wait a bit for groups to load, then set group value
  setTimeout(() => {
    if (deal.product_group) {
      document.getElementById("dealGroup").value = deal.product_group;
      // Trigger change event to load sub-groups
      const groupChangeEvent = new Event('change', { bubbles: true });
      document.getElementById("dealGroup").dispatchEvent(groupChangeEvent);
    }
  }, 100);
  
  // Wait a bit for sub-groups to load, then set sub-group value
  setTimeout(() => {
    if (deal.sub_group) {
      document.getElementById("dealSub").value = deal.sub_group;
    }
  }, 200);
  
  if (deal.color) document.getElementById("dealColor").value = deal.color;
  if (deal.thickness) document.getElementById("dealThick").value = deal.thickness;
  if (deal.mold) document.getElementById("dealMold").value = deal.mold;
  if (deal.sku) document.getElementById("dealSku").value = deal.sku;

  // Set region, province, branch
  if (deal.region) {
    const regionCheckboxes = document.querySelectorAll('#dealRegionDropdown input[type="checkbox"]');
    regionCheckboxes.forEach(cb => {
      cb.checked = deal.region.split(',').includes(cb.value);
      // Trigger change event on each checkbox to load provinces
      const changeEvent = new Event('change', { bubbles: true });
      cb.dispatchEvent(changeEvent);
    });
    updateSelectedText('dealRegionDropdown', 'dealRegionText');
  }

  // Wait a bit for provinces to load, then set province values
  setTimeout(() => {
    if (deal.province) {
      const provinceCheckboxes = document.querySelectorAll('#dealProvinceDropdown input[type="checkbox"]');
      provinceCheckboxes.forEach(cb => {
        cb.checked = deal.province.split(',').includes(cb.value);
        // Trigger change event on each checkbox to load branches
        const changeEvent = new Event('change', { bubbles: true });
        cb.dispatchEvent(changeEvent);
      });
      updateSelectedText('dealProvinceDropdown', 'dealProvinceText');
    }
  }, 100);

  // Wait a bit for branches to load, then set branch values
  setTimeout(() => {
    if (deal.branch) {
      const branchCheckboxes = document.querySelectorAll('#dealBranchDropdown input[type="checkbox"]');
      branchCheckboxes.forEach(cb => {
        cb.checked = deal.branch.split(',').includes(cb.value);
      });
      updateSelectedText('dealBranchDropdown', 'dealBranchText');
    }
  }, 200);

  // Toggle condition mode
  toggleDealConditionMode();

  // Store deal ID for update
  window.editingDealId = dealId;
  window.isReopeningDeal = isReopening ? dealId : null;

  // Change button text and show cancel button
  const submitBtn = document.getElementById("submitDealBtn");
  const cancelBtn = document.getElementById("cancelDealEditBtn");
  if (submitBtn) {
    submitBtn.textContent = isReopening ? "ทำซ้ำรายการนี้" : "บันทึกการแก้ไข";
    submitBtn.dataset.editMode = "true";
  }
  if (cancelBtn) {
    cancelBtn.classList.remove("hidden");
  }

  // Scroll to form
  document.getElementById("dealForm")?.scrollIntoView({ behavior: 'smooth' });

  showSaveMessage("กำลังแก้ไขดีล: " + deal.deal_name);
}

// Cancel edit function
function cancelDealEdit() {
  const submitBtn = document.getElementById("submitDealBtn");
  const cancelBtn = document.getElementById("cancelDealEditBtn");
  const form = document.getElementById("dealForm");
  
  if (submitBtn) {
    submitBtn.innerHTML = '<i class="bi bi-save"></i> บันทึก';
    submitBtn.dataset.editMode = "false";
  }
  if (cancelBtn) {
    cancelBtn.classList.add("hidden");
  }
  
  window.editingDealId = null;
  window.isReopeningDeal = null;
  
  if (form) {
    form.reset();
  }
  
  // Reset dropdowns text
  document.getElementById("dealRegionText").textContent = "ทั้งหมด";
  document.getElementById("dealProvinceText").textContent = "ทั้งหมด";
  document.getElementById("dealBranchText").textContent = "ทั้งหมด";
  
  // Reset category/brand/group dropdowns
  const catSelect = document.getElementById("dealCat");
  if (catSelect) catSelect.value = "";
  const brandSelect = document.getElementById("dealBrand");
  if (brandSelect) brandSelect.value = "";
  const groupSelect = document.getElementById("dealGroup");
  if (groupSelect) groupSelect.value = "";
  const subSelect = document.getElementById("dealSub");
  if (subSelect) subSelect.value = "";
  const colorSelect = document.getElementById("dealColor");
  if (colorSelect) colorSelect.value = "";
  const thickSelect = document.getElementById("dealThick");
  if (thickSelect) thickSelect.value = "";
  
  showSaveMessage("ยกเลิกการแก้ไขแล้ว");
}

// Make cancelDealEdit globally available
window.cancelDealEdit = cancelDealEdit;

// Helper function to convert dd/MM/yyyy to yyyy-MM-dd for HTML date inputs
function convertDateFormat(dateStr) {
  if (!dateStr) return '';
  
  // If already in yyyy-MM-dd format, return as is
  if (dateStr.includes('-') && dateStr.length === 10) {
    return dateStr;
  }
  
  // Convert from dd/MM/yyyy to yyyy-MM-dd
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];
  
  return `${year}-${month}-${day}`;
}

function formatThaiDate(dateStr) {

  if (!dateStr) return "-";

  let fixedDate;
  
  // Handle dd/MM/yyyy format (from backend)
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const year = parseInt(parts[2], 10);
      fixedDate = new Date(year, month, day);
    }
  } else {
    // Handle ISO format (yyyy-MM-dd or with time)
    fixedDate = new Date(
      dateStr.replace("T", " ").replace("Z", "")
    );
  }

  if (!fixedDate || isNaN(fixedDate.getTime())) {
    return "-";
  }

  return fixedDate.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatThaiDateTime(dateStr) {
  if (!dateStr) return "-";

  // ทำความสะอาด string
  const clean = dateStr.replace("T", " ").substring(0, 19);

  const [datePart, timePart] = clean.split(" ");
  if (!datePart || !timePart) return "-";

  // ตรวจสอบรูปแบบวันที่
  let day, month, year;
  
  if (datePart.includes("/")) {
    // รูปแบบ dd/MM/yyyy (จาก backend)
    [day, month, year] = datePart.split("/");
  } else if (datePart.includes("-")) {
    // รูปแบบ yyyy-MM-dd
    [year, month, day] = datePart.split("-");
  } else {
    return "-";
  }

  const [hour, minute, second] = timePart.split(":");

  // 🔥 logic เดียวกับ Target - แปลงปี ค.ศ. เป็น พ.ศ.
  if (parseInt(year) > 2400) {
    year = parseInt(year);
  } else {
    year = parseInt(year) + 543;
  }

  return `
    <div class="leading-tight">
      <div class="font-medium">
        ${day}/${month}/${year}
      </div>
      <div class="text-xs text-gray-400">
        ${hour}:${minute}:${second}
      </div>
    </div>
  `;
}



// ============================================================
// 🔥 DEAL REGION → PROVINCE (MULTI)
// ============================================================
document.addEventListener("change", (e) => {
  if (e.target.matches("#dealRegionDropdown input")) {
    const selectedRegions = getSelectedValues("dealRegionDropdown");
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

    renderCheckboxList("dealProvinceDropdown",
      provinces.map(p => ({ value: p, label: p }))
    );

    renderCheckboxList("dealBranchDropdown", []);
  }

  // Handle select-all checkbox state when individual items change
  if (e.target.matches("#dealRegionDropdown .item-checkbox") || 
      e.target.matches("#dealProvinceDropdown .item-checkbox") ||
      e.target.matches("#dealBranchDropdown .item-checkbox")) {
    const container = e.target.dataset.container;
    const selectAll = document.querySelector(`#${container} .select-all-checkbox`);
    const itemCheckboxes = document.querySelectorAll(`#${container} .item-checkbox`);
    if (selectAll) {
      selectAll.checked = itemCheckboxes.length > 0 && [...itemCheckboxes].every(cb => cb.checked);
    }
  }
});

// ============================================================
// 🔥 DEAL PROVINCE → BRANCH (MULTI)
// ============================================================
document.addEventListener("change", (e) => {
  if (e.target.matches("#dealProvinceDropdown input")) {
    const selectedProvinces = getSelectedValues("dealProvinceDropdown");
    let branches = [];

    selectedProvinces.forEach(p => {
      const filtered = branchData.filter(b => b.province === p);
      branches = branches.concat(filtered);
    });

    renderCheckboxList("dealBranchDropdown",
      branches.map(b => ({
        value: b.branchCode,
        label: `${b.branchCode} - ${b.branchName}`
      }))
    );
  }
});

// ============================================================
// 🔥 DEAL DROPDOWN TEXT UPDATE
// ============================================================
document.addEventListener("change", (e) => {
  if (e.target.matches("#dealRegionDropdown input")) {
    updateSelectedText("dealRegionDropdown", "dealRegionText");
    // Update select-all checkbox state
    const selectAll = document.querySelector('#dealRegionDropdown .select-all-checkbox');
    const items = document.querySelectorAll('#dealRegionDropdown .item-checkbox');
    if (selectAll && items.length > 0) {
      selectAll.checked = [...items].every(cb => cb.checked);
    }
  }

  if (e.target.matches("#dealProvinceDropdown input")) {
    updateSelectedText("dealProvinceDropdown", "dealProvinceText");
    const selectAll = document.querySelector('#dealProvinceDropdown .select-all-checkbox');
    const items = document.querySelectorAll('#dealProvinceDropdown .item-checkbox');
    if (selectAll && items.length > 0) {
      selectAll.checked = [...items].every(cb => cb.checked);
    }
  }

  if (e.target.matches("#dealBranchDropdown input")) {
    updateSelectedText("dealBranchDropdown", "dealBranchText");
    const selectAll = document.querySelector('#dealBranchDropdown .select-all-checkbox');
    const items = document.querySelectorAll('#dealBranchDropdown .item-checkbox');
    if (selectAll && items.length > 0) {
      selectAll.checked = [...items].every(cb => cb.checked);
    }
  }
});

// ============================================================
// 🔥 LOAD CONTACTS FOR PROVIDER DROPDOWN
// ============================================================
async function loadDealProviderOptions(supplierNo) {
  try {
    const res = await fetch(`${window.API_BASE}/api/suppliers/${supplierNo}/contacts`);
    if (!res.ok) throw new Error("Failed to load contacts");
    const contacts = await res.json();
    
    const select = document.getElementById("dealProvider");
    if (!select) return;
    
    // Keep the first option
    select.innerHTML = '<option value="">- เลือกผู้ติดต่อ -</option>';
    
    contacts.forEach(contact => {
      const option = document.createElement("option");
      option.value = contact.name;
      option.textContent = contact.name;
      select.appendChild(option);
    });
    
    console.log("✅ dealProvider loaded:", contacts.length);
  } catch (err) {
    console.error("❌ Load contacts error:", err);
  }
}

function renderDealRegionDropdown() {
  const regions = [...new Set(branchData.map(b => b.region))];
  renderCheckboxList("dealRegionDropdown",
    regions.map(r => ({
      value: r,
      label: r
    }))
  );
  console.log("✅ deal region loaded:", regions);
}

// ============================================================
// 🔥 TOGGLE DEAL CONDITION MODE
// ============================================================
window.toggleDealConditionMode = function() {
  const mode = document.getElementById("dealConditionMode")?.value;
  const normalDiv = document.getElementById("dealNormalMode");
  const limitedDiv = document.getElementById("dealLimitedMode");
  const steppedDiv = document.getElementById("dealSteppedMode");

  // Hide all modes first
  normalDiv?.classList.add("hidden");
  limitedDiv?.classList.add("hidden");
  steppedDiv?.classList.add("hidden");

  // Show selected mode
  if (mode === "normal") {
    normalDiv?.classList.remove("hidden");
  } else if (mode === "limited") {
    limitedDiv?.classList.remove("hidden");
  } else if (mode === "stepped") {
    steppedDiv?.classList.remove("hidden");
  }
}

window.updateLimitedDiscountDisplay = function() {
  const discount = parseFloat(document.getElementById("dealLimitedDiscount")?.value) || 0;
  const discountUnit = document.getElementById("dealLimitedDiscountUnit")?.value || "บาท";
  const limitedType = document.getElementById("dealLimitedType")?.value || "amount";
  const displayEl = document.getElementById("dealLimitedDiscountDisplay");
  
  if (discount <= 0) {
    displayEl.textContent = "-";
    return;
  }

  if (limitedType === "amount") {
    displayEl.textContent = `ราคา ${discount.toLocaleString()} ${discountUnit}`;
  } else {
    displayEl.textContent = `ราคา ลด ${discount}%`;
  }
}

// ============================================================
// 🔥 ADD DEAL STEP
// ============================================================
window.addDealStep = function() {
  const container = document.getElementById("dealStepsContainer");
  if (!container) return;

  const stepCount = container.children.length + 1;

  const stepDiv = document.createElement("div");
  stepDiv.className = "border rounded p-2 bg-white shadow-sm mb-2";
  stepDiv.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="badge bg-primary text-white rounded-pill px-2 py-1 fw-bold small">ขั้น ${stepCount}</span>
      <input type="number" class="form-control form-control-sm deal-step-from" placeholder="เริ่มต้น" style="width: 70px;">
      <span class="text-muted">-</span>
      <input type="number" class="form-control form-control-sm deal-step-to" placeholder="สิ้นสุด" style="width: 70px;">
      <select class="form-select form-select-sm deal-step-unit" style="width: 60px;">
        <option value="ชิ้น">ชิ้น</option>
        <option value="แผ่น">แผ่น</option>
        <option value="ตัน">ตัน</option>
        <option value="เส้น">เส้น</option>
        <option value="บาท">บาท</option>
      </select>
      <input type="number" class="form-control form-control-sm deal-step-price flex-1" placeholder="ราคาพิเศษ" step="0.01" style="min-width: 80px;">
      <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.closest('.border').remove()" title="ลบขั้นนี้">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `;

  container.appendChild(stepDiv);
}

// ============================================================
// 🔥 GET DEAL STEPS
// ============================================================
function getDealSteps() {
  const container = document.getElementById("dealStepsContainer");
  if (!container) return [];

  const steps = [];
  const stepDivs = container.querySelectorAll(".border");

  stepDivs.forEach(div => {
    const fromQty = div.querySelector(".deal-step-from")?.value;
    const toQty = div.querySelector(".deal-step-to")?.value;
    const unit = div.querySelector(".deal-step-unit")?.value;
    const price = div.querySelector(".deal-step-price")?.value;

    if (fromQty && toQty && price) {
      steps.push({
        from_qty: Number(fromQty),
        to_qty: Number(toQty),
        unit: unit || "ชิ้น",
        price_value: Number(price),
        price_unit: document.getElementById("dealUnit")?.value || "บาท"
      });
    }
  });

  return steps;
}

// Expose renderDealTable to global scope for onchange handlers
window.renderDealTable = renderDealTable;

// Mark module as loaded
window.dealModuleLoaded = true;