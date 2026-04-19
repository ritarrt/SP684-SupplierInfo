// supplier-deal-limit.js - Module for Deal Limit Tab
console.log("supplier-deal-limit.js loaded");

import { loadColors, loadThickness } from "./master-helper.js";
import { loadCoverageToForm, loadGroups, loadSubGroups } from "./coverage-helper.js";

let dealLimitData = [];
let branchData = [];
let editingDealLimitId = null;

async function loadBranchMaster() {
  try {
    const res = await fetch(`${window.API_BASE}/api/master/branches`);
    if (!res.ok) throw new Error(await res.text());
    branchData = await res.json();
  } catch (err) {
    console.error("❌ Load branch master error:", err);
  }
}

function getSelectedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)]
    .map(i => i.value)
    .filter(v => v && v !== "on");
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

function getBranchName(code) {
  if (!code) return "-";
  const data = branchData || [];
  const codes = code.split(',').map(c => c.trim());
  const names = codes.map(c => {
    const item = data.find(d => d.branchCode === c);
    return item?.branchName || c;
  });
  return names.join(', ');
}

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

function formatThaiDate(dateStr) {
  if (!dateStr) return "-";
  let fixedDate;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      fixedDate = new Date(year, month, day);
    }
  } else {
    fixedDate = new Date(dateStr.replace("T", " ").replace("Z", ""));
  }
  if (!fixedDate || isNaN(fixedDate.getTime())) return "-";
  return fixedDate.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatThaiDateTime(dateStr) {
  if (!dateStr) return "-";
  const clean = dateStr.replace("T", " ").substring(0, 19);
  const [datePart, timePart] = clean.split(" ");
  if (!datePart) return "-";
  const d = new Date(datePart);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH") + (timePart ? ` ${timePart.substring(0,5)}` : "");
}

function showLoadingIndicator(containerId, message = "กำลังโหลด...") {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Show simple loading text
  container.innerHTML = `<tr><td colspan="100%" class="text-center py-4 text-gray-500">${message}</td></tr>`;
}

function hideLoadingIndicator(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
}

window.updateDealLimitDiscountDisplay = function() {
  const discount = parseFloat(document.getElementById("dealLimitDiscount")?.value) || 0;
  const discountUnit = document.getElementById("dealLimitDiscountUnit")?.value || "บาท";
  const limitedType = document.getElementById("dealLimitType")?.value || "amount";
  const displayEl = document.getElementById("dealLimitDiscountDisplay");
  
  if (discount <= 0) {
    displayEl.textContent = "-";
    return;
  }

  if (limitedType === "amount") {
    displayEl.textContent = `ราคา ${discount.toLocaleString()} ${discountUnit}`;
  } else {
    displayEl.textContent = `ราคา ลด ${discount}%`;
  }
};

async function loadDealLimitList(supplierNo) {
  const tbody = document.getElementById("dealLimitTableBody");
  if (!tbody) return;

  showLoadingIndicator("dealLimitTableBody", "กำลังโหลดข้อมูลจำกัดดีลราคา...");

  try {
    const res = await fetch(`${window.API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/deals?condition=limited`);
    if (!res.ok) throw new Error(await res.text());
    dealLimitData = await res.json();
    renderDealLimitTable();
  } catch (err) {
    console.error("❌ Load deal limit error", err);
    hideLoadingIndicator("dealLimitTableBody");
  }
}

function renderDealLimitTable() {
  const tbody = document.getElementById("dealLimitTableBody");
  const countEl = document.getElementById("dealLimitRecordCount");

  if (!tbody) return;
  hideLoadingIndicator("dealLimitTableBody");

  const filterValue = document.querySelector("input[name='dealLimitFilter']:checked")?.value;

  let rows = [...dealLimitData];

  if (filterValue === "active") {
    rows = rows.filter(r => r.status === "OPEN" || r.status === "USE");
  } else if (filterValue === "closed") {
    rows = rows.filter(r => r.status === "CLOSED");
  } else if (filterValue === "cancelled") {
    rows = rows.filter(r => r.status === "CANCELLED");
  }

  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="100%" class="text-center py-4 text-muted">
          <i class="bi bi-inbox text-gray-400 d-block mb-2" style="font-size: 2rem;"></i>
          ไม่พบข้อมูล
        </td>
      </tr>
    `;
    if (countEl) countEl.textContent = "0 รายการ";
    return;
  }

  rows.forEach((r, idx) => {
    const limitQty = r.limited_qty || 0;
    const limitUnit = r.limited_unit || "ชิ้น";
    const actualValue = r.actual_value || 0;
    const achievementPercent = r.achievement_percent || 0;
    const isLimitReached = r.is_limit_reached || false;
    const isLimitExceeded = r.is_limit_exceeded || false;

    let actualDisplay = "";
    if (limitUnit === 'ตัน' || limitUnit === 'ton') {
      actualDisplay = `${Number(actualValue).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} ตัน`;
    } else if (limitUnit === 'บาท') {
      actualDisplay = `${Number(actualValue).toLocaleString()} บาท`;
    } else if (limitUnit === 'ตร.ฟ.' || limitUnit === 'sqft') {
      actualDisplay = `${Number(actualValue).toLocaleString()} ตร.ฟ.`;
    } else {
      actualDisplay = `${Number(actualValue).toLocaleString()} ${limitUnit}`;
    }

    const statusStyle = r.status === "OPEN" ? "background:#198754;color:#fff;" : r.status === "USE" ? "background:#ffc107;color:#000;" : r.status === "CLOSED" ? "background:#0d6efd;color:#fff;" : "background:#dc3545;color:#fff;";
    const canEdit = (r.status === 'OPEN' && !r.has_been_used) || ((r.status === 'CANCELLED' || r.status === 'CLOSED') && r.has_been_used);
    const overAmount = isLimitExceeded ? (Number(actualValue) - Number(limitQty)).toLocaleString() : '';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-center">${idx + 1}</td>
      <td class="text-center">
        <span class="badge deal-status-badge" style="cursor:pointer;${statusStyle}padding:4px 12px;border-radius:12px;font-weight:600;font-size:12px;" data-deal-id="${r.deal_id}">
          ${r.status}
        </span>
        ${r.require_pallet === false ? `<br><span class="badge bg-warning text-dark mt-1" style="font-size:10px;">ไม่ลงลัง</span>` : ''}
      </td>
      <td>
        ${canEdit ? `<button class="btn btn-sm btn-outline-primary mb-1" data-deal-id="${r.deal_id}"><i class="bi bi-pencil"></i></button><br>` : ''}
        <div class="fw-bold">${r.deal_ref || '-'}</div>
        <div class="small text-muted">${r.deal_name || '-'}</div>
        ${r.project_no ? `<div class="small">Project: ${r.project_no}</div>` : ''}
        <div class="small text-muted">${r.contact_person || '-'}</div>
      </td>
      <td class="small">
        <div><strong>${r.region || '-'} / ${r.province || '-'} / ${getBranchName(r.branch) || '-'}</strong></div>
        <div>${getCategoryName(r.category) || '-'} / ${getBrandName(r.brand) || '-'}</div>
        <div>${r.color || '-'} / ${r.thickness || '-'}</div>
      </td>
      <td class="text-center">
        <div class="fw-bold text-primary">${limitQty.toLocaleString()} ${limitUnit}</div>
        <div class="small text-muted">${r.limited_type === 'percent' ? `ส่วนลด ${r.limited_discount_value}%` : 'ราคาพิเศษ'}</div>
      </td>
      <td>
        <div class="mb-1">
          <div class="d-flex justify-content-between small">
            <span>ความคืบหน้า</span>
            <span class="fw-bold">${achievementPercent > 100 ? `<span class="text-danger">${achievementPercent.toFixed(0)}%</span>` : `${achievementPercent.toFixed(0)}%`}</span>
          </div>
          <div class="progress" style="height: 14px; border-radius: 7px;">
            <div class="progress-bar" style="width: ${Math.min(achievementPercent, 100)}%; background: ${isLimitExceeded ? '#dc3545' : isLimitReached ? '#198754' : achievementPercent >= 80 ? '#ffc107' : '#0d6efd'};"></div>
          </div>
        </div>
        <div class="small">ใช้ไป: <span class="fw-bold">${actualDisplay}</span></div>
        ${isLimitExceeded ? `<div class="small text-danger fw-bold">⚠️ เกิน ${overAmount} ${limitUnit}</div>` : ''}
      </td>
      <td class="small">
        <div>เริ่ม: ${formatThaiDate(r.start_date)}</div>
        <div>สิ้นสุด: ${formatThaiDate(r.end_date)}</div>
        <div class="text-muted">${formatThaiDateTime(r.updated_at || r.created_at)}</div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-deal-id]').forEach(btn => {
    btn.addEventListener('click', function() {
      const dealId = this.dataset.dealId;
      openEditDealLimitModal(dealId);
    });
  });

  // Event delegation for status badge click
  tbody.addEventListener('click', function(e) {
    const badge = e.target.closest('.deal-status-badge');
    if (badge) {
      const dealId = badge.dataset.dealId;
      const deal = dealLimitData.find(d => d.deal_id == dealId);
      if (deal && window.openDealModal) {
        window.openDealModal(dealId, deal.status, deal.has_been_used);
      }
    }
  });

  if (countEl) {
    countEl.textContent = `${rows.length} รายการ`;
  }
}

function openEditDealLimitModal(dealId) {
  const deal = dealLimitData.find(d => d.deal_id == dealId);
  if (!deal) {
    window.showSaveMessage("ไม่พบดีลที่ต้องการ", true);
    return;
  }

  if (deal.status === 'USE') {
    window.showSaveMessage("ไม่สามารถแก้ไขได้ เนื่องจากดีลกำลังถูกใช้งาน", true);
    return;
  }

  document.getElementById("dealLimitName").value = deal.deal_name || '';
  document.getElementById("dealLimitProvider").value = deal.contact_person || '';
  document.getElementById("dealLimitProjectNo").value = deal.project_no || '';
  document.getElementById("dealLimitType").value = deal.deal_type || '';
  document.getElementById("dealLimitQty").value = deal.limited_qty || '';
  document.getElementById("dealLimitUnit").value = deal.limited_unit || 'ชิ้น';
  document.getElementById("dealLimitType").value = deal.deal_type || 'Discount';
  document.getElementById("dealLimitDiscountType").value = deal.limited_type || 'amount';
  document.getElementById("dealLimitDiscount").value = deal.limited_discount_value || '';
  document.getElementById("dealLimitDiscountUnit").value = deal.limited_discount_unit || 'บาท';
  document.getElementById("dealLimitStart").value = convertDateFormat(deal.start_date);
  document.getElementById("dealLimitEnd").value = convertDateFormat(deal.end_date);
  document.getElementById("dealLimitNote").value = deal.note || '';
  document.getElementById("dealLimitRequirePallet").checked = deal.require_pallet !== false;

  if (deal.category) document.getElementById("dealLimitCat").value = deal.category;
  if (deal.brand) document.getElementById("dealLimitBrand").value = deal.brand;
  
  setTimeout(() => {
    if (deal.product_group) document.getElementById("dealLimitGroup").value = deal.product_group;
  }, 100);
  
  setTimeout(() => {
    if (deal.sub_group) document.getElementById("dealLimitSub").value = deal.sub_group;
  }, 200);
  
  if (deal.color) document.getElementById("dealLimitColor").value = deal.color;
  if (deal.thickness) document.getElementById("dealLimitThick").value = deal.thickness;
  if (deal.mold) document.getElementById("dealLimitMold").value = deal.mold;
  if (deal.sku) document.getElementById("dealLimitSku").value = deal.sku;

  if (deal.region) {
    const regionCheckboxes = document.querySelectorAll('#dealLimitRegionDropdown input[type="checkbox"]');
    regionCheckboxes.forEach(cb => {
      cb.checked = deal.region.split(',').includes(cb.value);
    });
    updateSelectedText('dealLimitRegionDropdown', 'dealLimitRegionText');
  }

  setTimeout(() => {
    if (deal.province) {
      const provinceCheckboxes = document.querySelectorAll('#dealLimitProvinceDropdown input[type="checkbox"]');
      provinceCheckboxes.forEach(cb => {
        cb.checked = deal.province.split(',').includes(cb.value);
      });
      updateSelectedText('dealLimitProvinceDropdown', 'dealLimitProvinceText');
    }
  }, 100);

  setTimeout(() => {
    if (deal.branch) {
      const branchCheckboxes = document.querySelectorAll('#dealLimitBranchDropdown input[type="checkbox"]');
      branchCheckboxes.forEach(cb => {
        cb.checked = deal.branch.split(',').includes(cb.value);
      });
      updateSelectedText('dealLimitBranchDropdown', 'dealLimitBranchText');
    }
  }, 200);

  editingDealLimitId = dealId;

  const submitBtn = document.getElementById("submitDealLimitBtn");
  const cancelBtn = document.getElementById("cancelDealLimitEditBtn");
  if (submitBtn) submitBtn.textContent = "บันทึกการแก้ไข";
  if (cancelBtn) cancelBtn.classList.remove("hidden");

  window.showSaveMessage("กำลังแก้ไขดีลจำกัด: " + deal.deal_name);
  window.updateDealLimitDiscountDisplay();
}

function cancelDealLimitEdit() {
  const form = document.getElementById("dealLimitForm");
  if (form) form.reset();
  
  document.getElementById("dealLimitRegionText").textContent = "ทั้งหมด";
  document.getElementById("dealLimitProvinceText").textContent = "ทั้งหมด";
  document.getElementById("dealLimitBranchText").textContent = "ทั้งหมด";
  document.getElementById("dealLimitDiscountDisplay").textContent = "-";
  document.getElementById("dealLimitRequirePallet").checked = true;
  
  editingDealLimitId = null;
  
  const submitBtn = document.getElementById("submitDealLimitBtn");
  const cancelBtn = document.getElementById("cancelDealLimitEditBtn");
  if (submitBtn) submitBtn.innerHTML = '<i class="bi bi-save"></i> บันทึก';
  if (cancelBtn) cancelBtn.classList.add("hidden");
  
  window.showSaveMessage("ยกเลิกการแก้ไขแล้ว");
}

window.cancelDealLimitEdit = cancelDealLimitEdit;

function convertDateFormat(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('-') && dateStr.length === 10) return dateStr;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  const day = parts[0].padStart(2, '0');
  const month = parts[1].padStart(2, '0');
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

function renderDealLimitRegionDropdown() {
  const regions = [...new Set(branchData.map(b => b.region))].filter(Boolean);
  renderCheckboxList("dealLimitRegionDropdown", regions.map(r => ({ value: r, label: r })));
}

// ============================================================
// DEAL LIMIT: REGION → PROVINCE (MULTI)
// ============================================================
document.addEventListener("change", (e) => {
  if (e.target.matches("#dealLimitRegionDropdown input")) {
    const selectedRegions = [...document.querySelectorAll("#dealLimitRegionDropdown input:checked")].map(i => i.value).filter(v => v && v !== "on");
    
    let provinces = [];
    selectedRegions.forEach(r => {
      const filtered = branchData.filter(b => b.region === r);
      provinces = provinces.concat(filtered.map(b => b.province));
    });
    provinces = [...new Set(provinces)].filter(Boolean);

    renderCheckboxList("dealLimitProvinceDropdown", provinces.map(p => ({ value: p, label: p })));
    renderCheckboxList("dealLimitBranchDropdown", []);
  }

  if (e.target.matches("#dealLimitRegionDropdown .item-checkbox") || 
      e.target.matches("#dealLimitProvinceDropdown .item-checkbox") ||
      e.target.matches("#dealLimitBranchDropdown .item-checkbox")) {
    const container = e.target.dataset.container;
    const selectAll = document.querySelector(`#${container} .select-all-checkbox`);
    const itemCheckboxes = document.querySelectorAll(`#${container} .item-checkbox`);
    if (selectAll) {
      selectAll.checked = itemCheckboxes.length > 0 && [...itemCheckboxes].every(cb => cb.checked);
    }
  }

  if (e.target.matches("#dealLimitRegionDropdown input")) {
    updateSelectedText("dealLimitRegionDropdown", "dealLimitRegionText");
    const selectAll = document.querySelector('#dealLimitRegionDropdown .select-all-checkbox');
    const items = document.querySelectorAll('#dealLimitRegionDropdown .item-checkbox');
    if (selectAll && items.length > 0) {
      selectAll.checked = [...items].every(cb => cb.checked);
    }
  }
});

// ============================================================
// DEAL LIMIT: PROVINCE → BRANCH (MULTI)
// ============================================================
document.addEventListener("change", (e) => {
  if (e.target.matches("#dealLimitProvinceDropdown input")) {
    const selectedProvinces = [...document.querySelectorAll("#dealLimitProvinceDropdown input:checked")].map(i => i.value).filter(v => v && v !== "on");
    
    let branches = [];
    selectedProvinces.forEach(p => {
      const filtered = branchData.filter(b => b.province === p);
      branches = branches.concat(filtered);
    });

    renderCheckboxList("dealLimitBranchDropdown",
      branches.map(b => ({ value: b.branchCode, label: `${b.branchCode} - ${b.branchName}` }))
    );
  }

  if (e.target.matches("#dealLimitProvinceDropdown input")) {
    updateSelectedText("dealLimitProvinceDropdown", "dealLimitProvinceText");
    const selectAll = document.querySelector('#dealLimitProvinceDropdown .select-all-checkbox');
    const items = document.querySelectorAll('#dealLimitProvinceDropdown .item-checkbox');
    if (selectAll && items.length > 0) {
      selectAll.checked = [...items].every(cb => cb.checked);
    }
  }

  if (e.target.matches("#dealLimitBranchDropdown input")) {
    updateSelectedText("dealLimitBranchDropdown", "dealLimitBranchText");
    const selectAll = document.querySelector('#dealLimitBranchDropdown .select-all-checkbox');
    const items = document.querySelectorAll('#dealLimitBranchDropdown .item-checkbox');
    if (selectAll && items.length > 0) {
      selectAll.checked = [...items].every(cb => cb.checked);
    }
  }
});

document.addEventListener("click", (e) => {
  const dropdowns = ["dealLimitRegionDropdown", "dealLimitProvinceDropdown", "dealLimitBranchDropdown"];
  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.contains(e.target) && !e.target.closest(`[onclick*="${id}"]`)) {
      el.classList.add("hidden");
    }
  });
});

async function loadDealLimitProviderOptions(supplierNo) {
  try {
    const res = await fetch(`${window.API_BASE}/api/suppliers/${supplierNo}/contacts`);
    if (!res.ok) throw new Error("Failed to load contacts");
    const contacts = await res.json();
    
    const select = document.getElementById("dealLimitProvider");
    if (!select) return;
    
    select.innerHTML = '<option value="">- เลือกผู้ติดต่อ -</option>';
    contacts.forEach(contact => {
      const option = document.createElement("option");
      option.value = contact.name;
      option.textContent = contact.name;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("❌ Load contacts error:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const supplierNo = window.supplierNo;
  if (!supplierNo) return;

  await loadBranchMaster();
  
  const today = new Date();
  const dealLimitStart = document.getElementById("dealLimitStart");
  if (dealLimitStart && !dealLimitStart.value) {
    dealLimitStart.value = today.toISOString().split("T")[0];
  }

  if (window.supplierNo) {
    await loadCoverageToForm(window.supplierNo, {
      category: "dealLimitCat",
      brand: "dealLimitBrand",
      group: "dealLimitGroup",
      sub: "dealLimitSub",
      color: "dealLimitColor",
      thickness: "dealLimitThick",
      sku: "dealLimitSku"
    });
  }

  const catSelect = document.getElementById("dealLimitCat");
  const brandSelect = document.getElementById("dealLimitBrand");

  if (catSelect) {
    catSelect.addEventListener("change", () => {
      loadGroups(catSelect.value, "dealLimitGroup");
      loadColors(catSelect.value, "dealLimitColor");
      loadThickness(catSelect.value, "dealLimitThick");
    });
    loadGroups(catSelect.value, "dealLimitGroup");
  }

  const groupSelect = document.getElementById("dealLimitGroup");
  if (groupSelect) {
    groupSelect.addEventListener("change", () => {
      loadSubGroups(catSelect.value, "dealLimitSub");
    });
  }

  renderDealLimitRegionDropdown();
  loadDealLimitProviderOptions(supplierNo);
  loadDealLimitList(supplierNo);

  const saveBtn = document.getElementById("submitDealLimitBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const dealName = document.getElementById("dealLimitName")?.value;
      const region = getSelectedValues("dealLimitRegionDropdown").join(",");
      const province = getSelectedValues("dealLimitProvinceDropdown").join(",");
      const branch = getSelectedValues("dealLimitBranchDropdown").join(",");
      const category = document.getElementById("dealLimitCat")?.value;
      const brand = document.getElementById("dealLimitBrand")?.value;
      const productGroup = document.getElementById("dealLimitGroup")?.value;
      const dealType = document.getElementById("dealLimitType")?.value;
      const limitedQty = parseFloat(document.getElementById("dealLimitQty")?.value);
      const limitedUnit = document.getElementById("dealLimitUnit")?.value;
      const limitedType = document.getElementById("dealLimitDiscountType")?.value;
      const limitedDiscountValue = parseFloat(document.getElementById("dealLimitDiscount")?.value) || 0;
      const limitedDiscountUnit = document.getElementById("dealLimitDiscountUnit")?.value;
      const dealStart = document.getElementById("dealLimitStart")?.value;
      const dealEnd = document.getElementById("dealLimitEnd")?.value;
      const requirePallet = document.getElementById("dealLimitRequirePallet")?.checked ?? true;
      const note = document.getElementById("dealLimitNote")?.value;

      // dealType = ประเภทดีล (Discount/New Price), limitedType = ประเภทจำกัดจำนวน (amount/percent)

      if (!dealName) { window.showSaveMessage("กรุณากรอกชื่อดีลจำกัดราคา", true); return; }
      if (!region) { window.showSaveMessage("กรุณาเลือกภาค", true); console.log("region value:", region); return; }
      if (!province) { window.showSaveMessage("กรุณาเลือกจังหวัด", true); console.log("province value:", province); return; }
      if (!branch) { window.showSaveMessage("กรุณาเลือกสาขา", true); console.log("branch value:", branch); return; }
      if (!category) { window.showSaveMessage("กรุณาเลือกประเภทสินค้า", true); return; }
      if (!brand) { window.showSaveMessage("กรุณาเลือกแบรนด์", true); return; }
      if (!productGroup || productGroup === "-") { window.showSaveMessage("กรุณาเลือกกลุ่มสินค้า", true); return; }
      if (!dealType) { window.showSaveMessage("กรุณาเลือกประเภทดีล", true); return; }
      if (!limitedType) { window.showSaveMessage("กรุณาเลือกประเภทจำกัดจำนวน", true); return; }
      if (!limitedQty || limitedQty <= 0) { window.showSaveMessage("กรุณากรอกจำนวนจำกัดที่ถูกต้อง", true); return; }
      if (!dealStart || !dealEnd) { window.showSaveMessage("กรุณาเลือกวันที่", true); return; }

      const payload = {
        deal_name: dealName,
        contact_person: document.getElementById("dealLimitProvider")?.value || null,
        project_no: document.getElementById("dealLimitProjectNo")?.value || null,
        region: region || null,
        province: province || null,
        branch: branch || null,
        category: category,
        brand: brand,
        product_group: productGroup,
        sub_group: document.getElementById("dealLimitSub")?.value || null,
        color: document.getElementById("dealLimitColor")?.value || null,
        thickness: document.getElementById("dealLimitThick")?.value || null,
        mold: document.getElementById("dealLimitMold")?.value || null,
        sku: document.getElementById("dealLimitSku")?.value || null,
        deal_type: dealType,
        condition_mode: "limited",
        limited_qty: limitedQty,
        limited_unit: limitedUnit,
        limited_type: limitedType,
        limited_discount_value: limitedDiscountValue,
        limited_discount_unit: limitedDiscountUnit,
        start_date: dealStart,
        end_date: dealEnd,
        note: note,
        require_pallet: requirePallet
      };

      try {
        console.log("Saving deal limit with payload:", payload);
        let res;
        if (editingDealLimitId) {
          res = await fetch(
            `${window.API_BASE}/api/suppliers/${supplierNo}/deals/${editingDealLimitId}`,
            { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
          );
        } else {
          res = await fetch(
            `${window.API_BASE}/api/suppliers/${supplierNo}/deals`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
          );
        }

        console.log("Response status:", res.status);
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }

        window.showSaveMessage(editingDealLimitId ? "✅ แก้ไขดีลจำกัดสำเร็จ" : "✅ บันทึกดีลจำกัดสำเร็จ");

        cancelDealLimitEdit();
        await loadDealLimitList(supplierNo);

      } catch (err) {
        console.error("❌ Save deal limit error:", err);
        window.showSaveMessage("❌ บันทึดดีลจำกัดไม่สำเร็จ: " + err.message, true);
      }
    });
  }

  const cancelBtn = document.getElementById("cancelDealLimitEditBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", cancelDealLimitEdit);
  }
});

window.renderDealLimitTable = renderDealLimitTable;