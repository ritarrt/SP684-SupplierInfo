console.log("supplier-contact.js loaded");

let PROVINCES = [];

// ===============================
// LOAD PROVINCE MASTER
// ===============================
async function loadProvinceMaster() {
  const res = await fetch(`${API_BASE}/api/master/provinces`);
  PROVINCES = await res.json();
}

// ===============================
// MAP REGION (frontend → DB)
// ===============================
function mapRegionToDB(region) {
  switch (region) {
    case "North": return "ภาคเหนือ";
    case "Central": return "ภาคกลาง";
    case "NE": return "ภาคอีสาน";
    case "South": return "ภาคใต้";
    default: return null;
  }
}

// ===============================
// RENDER PROVINCE DROPDOWN
// ===============================
function renderProvinceDropdown(region = null, selectedValue = null) {
  const select = document.getElementById("ctProvince");
  if (!select) return;

  select.innerHTML = `<option value="">- เลือก -</option>`;

  const dbRegion = mapRegionToDB(region);

  PROVINCES
    .filter(p => !dbRegion || p.region === dbRegion)
    .forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.provinceCode;
      opt.textContent = p.provinceName;

      if (selectedValue && selectedValue === p.provinceCode) {
        opt.selected = true;
      }

      select.appendChild(opt);
    });
}

// ===============================
// GET COVERAGE DATA
// ===============================
function getCoverageData() {
  const brands = new Set();
  const groups = new Set();

  const data = window.COVERAGE_DATA || [];

  data.forEach(item => {
    // 🔥 ปรับ field ตามของจริง (ลอง log ดูถ้าไม่ตรง)
    const brand = item.brand_name || item.brand || item.brandName;
    const group = item.group_name || item.group || item.groupName;

    if (brand) {
      brands.add(brand);
    }

    if (group) {
      groups.add(group);
    }
  });

  return {
    brands: [...brands],
    groups: [...groups]
  };
}

// ===============================
// RENDER BRAND + GROUP (🔥 FIX)
// ===============================
function renderContactDropdowns() {
  const { brands, groups } = getCoverageData();

  const brandSelect = document.getElementById("ctBrand");
  const groupSelect = document.getElementById("ctGroup");

  // 🔥 จำค่าปัจจุบันก่อน render
  const currentBrand = brandSelect?.value;
  const currentGroup = groupSelect?.value;

  if (brandSelect) {
    brandSelect.innerHTML = `<option value="">- เลือก -</option>`;

    brands.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;

      if (currentBrand === b) {
        opt.selected = true;
      }

      brandSelect.appendChild(opt);
    });
  }

  if (groupSelect) {
    groupSelect.innerHTML = `<option value="">- เลือก -</option>`;

    groups.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;

      if (currentGroup === g) {
        opt.selected = true;
      }

      groupSelect.appendChild(opt);
    });
  }
}

// ===============================
// INIT
// ===============================
document.addEventListener("DOMContentLoaded", async () => {

  await loadProvinceMaster();
  renderProvinceDropdown();

  renderContactDropdowns();

  const regionEl = document.getElementById("ctRegion");

  if (regionEl) {
    regionEl.addEventListener("change", (e) => {
      const selectedProvince = document.getElementById("ctProvince").value;

      document.getElementById("ctProvince").value = "";
      renderProvinceDropdown(e.target.value, selectedProvince);
    });
  }
});

// ❌ ลบ AUTO CLICK UPDATE ทิ้งไปเลย

// ===============================
// SAVE CONTACT
// ===============================
async function saveSupplierContact() {
  const supplierNo = getSupplierNoFromURL();

  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  const payload = {
    contactType: document.querySelector('input[name="ctType"]:checked')?.value || null,
    name: document.getElementById("ctName")?.value || null,
    position: document.getElementById("ctPosition")?.value || null,
    region: document.getElementById("ctRegion")?.value || null,
    province: document.getElementById("ctProvince")?.value || null,
    brand: document.getElementById("ctBrand")?.value || null,
    productGroup: document.getElementById("ctGroup")?.value || null,
    startDate: document.getElementById("ctStartDate")?.value || null,
    email: document.getElementById("ctEmail")?.value || null,
    lineId: document.getElementById("ctLine")?.value || null,
    phones: collectPhones()
  };

  console.log("CONTACT PAYLOAD =", payload);

  if (!payload.name) {
    alert("กรุณาระบุชื่อผู้ติดต่อ");
    return;
  }

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