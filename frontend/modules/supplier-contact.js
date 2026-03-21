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
// RENDER PROVINCE
// ===============================
function renderProvinceDropdown(region = null) {
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
      select.appendChild(opt);
    });
}

// ===============================
// GET COVERAGE DATA (SAFE)
// ===============================
function getCoverageData() {
  const rows = document.querySelectorAll(".product-row");

  // 🔥 debug สำคัญ
  console.log("FOUND product-row:", rows.length);

  if (!rows.length) {
    return { brands: [], groups: [] };
  }

  const brands = new Set();
  const groups = new Set();

  rows.forEach(row => {
    const brand = row.querySelector(".brand-display span")?.textContent?.trim();
    const group = row.querySelector(".group-display span")?.textContent?.trim();

    if (brand && !brand.includes("เลือก")) brands.add(brand);
    if (group && !group.includes("เลือก")) groups.add(group);
  });

  return {
    brands: [...brands],
    groups: [...groups]
  };
}

// ===============================
// RENDER DROPDOWN (SAFE)
// ===============================
function renderContactDropdowns() {
  const { brands, groups } = getCoverageData();

  console.log("RENDER:", brands, groups);

  const brandSelect = document.getElementById("ctBrand");
  const groupSelect = document.getElementById("ctGroup");

  if (brandSelect) {
    const current = brandSelect.value;

    brandSelect.innerHTML = `<option value="">- เลือก -</option>`;

    brands.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      if (b === current) opt.selected = true;
      brandSelect.appendChild(opt);
    });
  }

  if (groupSelect) {
    const current = groupSelect.value;

    groupSelect.innerHTML = `<option value="">- เลือก -</option>`;

    groups.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      if (g === current) opt.selected = true;
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

  const regionEl = document.getElementById("ctRegion");

  if (regionEl) {
    regionEl.addEventListener("change", (e) => {
      document.getElementById("ctProvince").value = "";
      renderProvinceDropdown(e.target.value);
    });
  }

  // 🔥 IMPORTANT: รอ product-row มาก่อน
  const interval = setInterval(() => {
    const rows = document.querySelectorAll(".product-row");

    if (rows.length > 0) {
      console.log("✅ FOUND PRODUCT → render dropdown");
      renderContactDropdowns();
      clearInterval(interval);
    }
  }, 300);
});

// ❌ ลบ click listener ทิ้งไปเลย

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

    // 🔥 FIX REGION
    region: mapRegionToDB(document.getElementById("ctRegion")?.value) || null,

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

window.saveSupplierContact = saveSupplierContact;