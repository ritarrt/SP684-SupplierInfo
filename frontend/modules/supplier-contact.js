console.log("supplier-contact.js loaded");

let BRANCH_DATA = [];

// ===============================
// LOAD BRANCH MASTER (REGION + PROVINCE)
// ===============================
async function loadBranchMaster() {
  try {
    const res = await fetch(`${API_BASE}/api/master/branches`);
    if (!res.ok) throw new Error("Failed to load branches");
    BRANCH_DATA = await res.json();
    console.log("✅ Branch Data loaded:", BRANCH_DATA.length);
  } catch (err) {
    console.error("Load Branch Error:", err);
  }
}

// ===============================
// GET COVERAGE DATA
// ===============================
function getCoverageData() {
  const brands = new Set();
  const groups = new Set();

  const data = window.COVERAGE_DATA || [];

  data.forEach(item => {
    const brand = item.brand_name || item.brand || item.brandName;
    const group = item.group_name || item.group || item.groupName;

    if (brand) brands.add(brand);
    if (group) groups.add(group);
  });

  return { brands: [...brands], groups: [...groups] };
}

// ===============================
// RENDER BRAND + GROUP
// ===============================
function renderContactDropdowns() {
  const { brands, groups } = getCoverageData();

  // Render Brand dropdown (เริ่มต้นทั้งหมด)
  if (brands.length > 0) {
    renderCheckboxList("ctBrandDropdown", 
      brands.map(b => ({ value: b, label: b }))
    );
    document.getElementById("ctBrandText").textContent = "ทั้งหมด";
    document.querySelectorAll("#ctBrandDropdown .item-checkbox").forEach(cb => cb.checked = true);
  }

  // Render Group dropdown (เริ่มต้นทั้งหมด)
  if (groups.length > 0) {
    renderCheckboxList("ctGroupDropdown", 
      groups.map(g => ({ value: g, label: g }))
    );
    document.getElementById("ctGroupText").textContent = "ทั้งหมด";
    document.querySelectorAll("#ctGroupDropdown .item-checkbox").forEach(cb => cb.checked = true);
  }
}

// ===============================
// RENDER CHECKBOX DROPDOWNS
// ===============================
function renderCheckboxList(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;
  
  const isMultiSelect = containerId.includes("Dropdown");
  
  el.innerHTML = (isMultiSelect && data.length > 0 ? `
    <label class="block text-sm py-1 font-semibold border-b mb-1">
      <input type="checkbox" class="mr-2 select-all-checkbox" data-container="${containerId}" value="">
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

  const textEl = document.getElementById(textId);
  if (textEl) {
    textEl.innerText = values.length ? values.join(", ") : "ทั้งหมด";
  }
}

function getSelectedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)]
    .map(i => i.value)
    .filter(v => v);
}

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {

  await loadBranchMaster();
  renderContactDropdowns();

  // Render Region dropdown (เริ่มต้นแสดง "ทั้งหมด")
  const uniqueRegions = [...new Set(BRANCH_DATA.map(b => b.region).filter(Boolean))];
  renderCheckboxList("ctRegionDropdown", 
    uniqueRegions.map(r => ({ value: r, label: r }))
  );
  document.getElementById("ctRegionText").textContent = "ทั้งหมด";

  // Render Province dropdown (เริ่มต้นแสดง "ทั้งหมด")
  const allProvinces = [...new Set(BRANCH_DATA.map(b => b.province).filter(Boolean))];
  renderCheckboxList("ctProvinceDropdown",
    allProvinces.map(p => ({ value: p, label: p }))
  );
  document.getElementById("ctProvinceText").textContent = "ทั้งหมด";

  // ทั้งหมดเริ่มต้น
  document.querySelectorAll("#ctRegionDropdown .item-checkbox").forEach(cb => cb.checked = true);
  document.querySelectorAll("#ctProvinceDropdown .item-checkbox").forEach(cb => cb.checked = true);

  // Close dropdowns when clicking outside
  document.addEventListener("click", (e) => {
    const dropdowns = ["ctRegionDropdown", "ctProvinceDropdown", "ctBrandDropdown", "ctGroupDropdown"];
    dropdowns.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!el.contains(e.target) && !e.target.closest(`[onclick*="${id}"]`)) {
        el.classList.add("hidden");
      }
    });
  });

  // Region change → filter provinces
  document.addEventListener("change", (e) => {
    if (e.target.matches("#ctRegionDropdown input")) {
      const selectedRegions = getSelectedValues("ctRegionDropdown");
      
      const provinces = [...new Set(
        BRANCH_DATA
          .filter(b => selectedRegions.includes(b.region))
          .map(b => b.province)
      )];
      
      renderCheckboxList("ctProvinceDropdown", 
        provinces.map(p => ({ value: p, label: p }))
      );
      
      // ทั้งหมดเมื่อ region เปลี่ยน
      document.querySelectorAll("#ctProvinceDropdown .item-checkbox").forEach(cb => cb.checked = true);
      
      updateSelectedText("ctRegionDropdown", "ctRegionText");
      updateSelectedText("ctProvinceDropdown", "ctProvinceText");
    }
  });

  // Province change → update text
  document.addEventListener("change", (e) => {
    if (e.target.matches("#ctProvinceDropdown input")) {
      updateSelectedText("ctProvinceDropdown", "ctProvinceText");
    }
  });
});

// ===============================
// SAVE CONTACT
// ===============================
async function saveSupplierContact() {
  const supplierNo = getSupplierNoFromURL();

  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  // Validate required fields (ชื่อ, ตำแหน่ง, เบอร์โทร, วันที่เริ่มติดต่อ)
  const name = document.getElementById("ctName")?.value?.trim();
  const position = document.getElementById("ctPosition")?.value?.trim();
  const startDate = document.getElementById("ctStartDate")?.value;
  const phones = collectPhones();

  // Clear previous error styles
  document.querySelectorAll('.border-red-500').forEach(el => el.classList.remove('border-red-500'));
  document.querySelectorAll('.text-red-500').forEach(el => el.classList.remove('text-red-500'));

  let isValid = true;

  if (!name) {
    document.getElementById('ctName')?.classList.add('border-red-500');
    isValid = false;
  }
  if (!position) {
    document.getElementById('ctPosition')?.classList.add('border-red-500');
    isValid = false;
  }
  if (!phones) {
    document.querySelectorAll('.phone-input').forEach(el => el.classList.add('border-red-500'));
    isValid = false;
  }
  if (!startDate) {
    document.getElementById('ctStartDate')?.classList.add('border-red-500');
    isValid = false;
  }

  if (!isValid) {
    showValidationToast("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
    return;
  }

  // Helper: get values, return empty string if all selected
  function getSelectedOrAll(containerId) {
    const allCheckboxes = document.querySelectorAll(`#${containerId} .item-checkbox`);
    const checkedCheckboxes = document.querySelectorAll(`#${containerId} .item-checkbox:checked`);
    
    // If all are checked, return empty (meaning "all")
    if (allCheckboxes.length > 0 && allCheckboxes.length === checkedCheckboxes.length) {
      return "";
    }
    return getSelectedValues(containerId).join(",");
  }

  const payload = {
    contactType: document.querySelector('input[name="ctType"]:checked')?.value || null,
    name: name,
    position: position,
    region: getSelectedOrAll("ctRegionDropdown"),
    province: getSelectedOrAll("ctProvinceDropdown"),
    brand: getSelectedOrAll("ctBrandDropdown"),
    productGroup: getSelectedOrAll("ctGroupDropdown"),
    startDate: startDate,
    email: document.getElementById("ctEmail")?.value || null,
    lineId: document.getElementById("ctLine")?.value || null,
    phones: phones
  };

  console.log("CONTACT PAYLOAD =", payload);

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/contacts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  if (!res.ok) throw new Error("save failed");

  showSaveMessage("บันทึกข้อมูลผู้ติดต่อสำเร็จ");
  window.loadContactHistory?.(supplierNo);

  setTimeout(() => {
    window.location.href = window.location.pathname + "?id=" + supplierNo;
  }, 1000);
}

// ===============================
// PHONE
// ===============================
function collectPhones() {
  return Array.from(document.querySelectorAll(".phone-input"))
    .map(el => el.value.trim())
    .filter(Boolean)
    .join(", ");
}

// expose
window.saveSupplierContact = saveSupplierContact;
window.renderContactDropdowns = renderContactDropdowns;

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function showValidationToast(message) {
  const existingToast = document.getElementById('validationToast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.id = 'validationToast';
  toast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in';
  toast.innerHTML = `
    <div class="bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span class="font-medium">${message}</span>
    </div>
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('animate-fade-in');
    toast.classList.add('animate-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
