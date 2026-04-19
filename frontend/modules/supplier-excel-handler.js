console.log("supplier-excel-handler.js loaded");

// ===================================================
// EXPORT TO EXCEL
// ===================================================
async function exportToExcel() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: สินค้าที่บริษัทดูแล
  const products = window.collectProductCoverage?.() || [];
  const productData = [
    ["ประเภทสินค้า", "แบรนด์ที่ดูแล", "กลุ่มสินค้า", "กลุ่มย่อย", "SKU"]
  ];
  products.forEach(p => {
    productData.push([
      p.category_name || "",
      p.brand_name || "",
      p.group_name || "",
      p.SUBGROUP_NAME || "",
      p.sku || ""
    ]);
  });
  const wsProducts = XLSX.utils.aoa_to_sheet(productData);
  XLSX.utils.book_append_sheet(wb, wsProducts, "สินค้าที่ดูแล");

  // Sheet 2: เงื่อนไขเครดิต
  const terms = window.collectSpecialTerms?.() || {};
  const finance = terms.finance || {};
  const creditData = [
    ["รูปแบบการวางบิล", finance.billingCycle || ""],
    ["เงื่อนไขเครดิต", finance.creditTerm || ""],
    ["วงเงินเครดิต", finance.creditLimit || ""],
    ["หน่วยวงเงิน", finance.creditLimitUnit || ""]
  ];
  const wsCredit = XLSX.utils.aoa_to_sheet(creditData);
  XLSX.utils.book_append_sheet(wb, wsCredit, "เงื่อนไขเครดิต");

  // Sheet 3: วิธีการชำระเงิน
  const paymentMethods = terms.paymentMethods || [];
  const paymentData = [
    ["วิธีชำระ", "ธนาคาร", "เลขบัญชี", "ชื่อบัญชี"]
  ];
  paymentMethods.forEach(pm => {
    paymentData.push([
      pm.method || "",
      pm.bank || "",
      pm.account || "",
      pm.accountName || ""
    ]);
  });
  const wsPayment = XLSX.utils.aoa_to_sheet(paymentData);
  XLSX.utils.book_append_sheet(wb, wsPayment, "วิธีชำระเงิน");

  // Sheet 4: เงื่อนไขการเคลม/คืนสินค้า
  const claim = terms.claim || {};
  const claimData = [
    ["ระยะเวลารับเคลม", claim.period || ""],
    ["เงื่อนไขการรับเคลม", claim.condition || ""],
    ["หมายเหตุเพิ่มเติม", claim.note || ""]
  ];
  const wsClaim = XLSX.utils.aoa_to_sheet(claimData);
  XLSX.utils.book_append_sheet(wb, wsClaim, "เงื่อนไขเคลม");

  // Sheet 5: ข้อมูลผู้ติดต่อ
  const contactsRes = await fetch(`${window.API_BASE}/api/suppliers/${supplierNo}/contacts`);
  const contacts = contactsRes.ok ? await contactsRes.json() : [];
  const contactData = [
    ["ประเภท", "ชื่อ-นามสกุล", "ตำแหน่ง", "ภาค", "จังหวัด", "แบรนด์", "กลุ่มสินค้า", "วันที่เริ่ม", "อีเมล", "Line ID", "เบอร์โทร"]
  ];
  contacts.forEach(c => {
    contactData.push([
      c.contact_type || c.contactType || "",
      c.name || "",
      c.position || "",
      c.region || "",
      c.province || "",
      c.brand || "",
      c.product_group || c.productGroup || "",
      c.start_date || c.startDate || "",
      c.email || "",
      c.line_id || c.lineId || "",
      c.phones || ""
    ]);
  });
  const wsContact = XLSX.utils.aoa_to_sheet(contactData);
  XLSX.utils.book_append_sheet(wb, wsContact, "ผู้ติดต่อ");

  // Download
  XLSX.writeFile(wb, `Supplier_${supplierNo}_BasicData.xlsx`);
}

// ===================================================
// IMPORT FROM EXCEL
// ===================================================
async function importFromExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);

    // 1. Import สินค้าที่บริษัทดูแล
    const productsSheet = wb.Sheets["สินค้าที่ดูแล"];
    if (productsSheet) {
      const products = XLSX.utils.sheet_to_json(productsSheet, { header: 1 });
      if (products.length > 1) {
        await applyImportedProducts(products.slice(1));
      }
    }

    // 2. Import เงื่อนไขเครดิต
    const creditSheet = wb.Sheets["เงื่อนไขเครดิต"];
    if (creditSheet) {
      const creditData = XLSX.utils.sheet_to_json(creditSheet, { header: 1 });
      applyImportedCredit(creditData);
    }

    // 3. Import วิธีการชำระเงิน
    const paymentSheet = wb.Sheets["วิธีชำระเงิน"];
    if (paymentSheet) {
      const paymentData = XLSX.utils.sheet_to_json(paymentSheet, { header: 1 });
      if (paymentData.length > 1) {
        applyImportedPaymentMethods(paymentData.slice(1));
      }
    }

    // 4. Import เงื่อนไขการเคลม
    const claimSheet = wb.Sheets["เงื่อนไขเคลม"];
    if (claimSheet) {
      const claimData = XLSX.utils.sheet_to_json(claimSheet, { header: 1 });
      applyImportedClaim(claimData);
    }

    // 5. Import ข้อมูลผู้ติดต่อ
    const contactSheet = wb.Sheets["ผู้ติดต่อ"];
    if (contactSheet) {
      const contacts = XLSX.utils.sheet_to_json(contactSheet, { header: 1 });
      if (contacts.length > 1) {
        applyImportedContacts(contacts.slice(1));
      }
    }

    showSaveMessage("นำเข้าข้อมูลจาก Excel เรียบร้อยแล้ว");

  } catch (err) {
    console.error("Import error:", err);
    alert("เกิดข้อผิดพลาดในการนำเข้าข้อมูล: " + err.message);
  }

  event.target.value = "";
}

// ===================================================
// APPLY IMPORTED DATA TO FORM
// ===================================================
async function applyImportedProducts(products) {
  if (!products.length) return;

  // ล้างแถวเดิม
  const container = document.getElementById("productCoverageContainer");
  const firstRow = container.querySelector(".product-row");
  container.innerHTML = "";
  container.appendChild(firstRow.cloneNode(true));

  const categoryMap = {
    "กระจก": "Glass",
    "อลูมิเนียม": "Aluminum",
    "ยิปซัม": "Gypsum",
    "อุปกรณ์": "Accessories",
    "ซีลาย": "C-Line",
    "กาวยาแนว": "Sealant"
  };

  for (let i = 0; i < products.length; i++) {
    if (i > 0) window.addProductRow?.();

    const row = document.querySelectorAll(".product-row")[i];
    if (!row) continue;

    const [catName, brandName, groupName, subGroupName, sku] = products[i];

    // Category
    if (catName) {
      const cat = categoryMap[catName] || catName;
      row.dataset.category = cat;
      row.querySelector(".category-display span").textContent = catName;

      // Load brands/groups
      await window.loadBrandsForRow?.(row);
      await window.loadGroupsForRow?.(row);
      await window.loadSubGroupsForRow?.(row);
    }

    // Brand
    if (brandName) {
      const brandDD = row.querySelector(".brand-dropdown");
      const brandInput = brandDD?.querySelector(`input[value="${brandName}"]`);
      if (brandInput) {
        row.dataset.brand = brandName;
        row.querySelector(".brand-display span").textContent = brandName;
      }
    }

    // Group
    if (groupName) {
      const groupDD = row.querySelector(".group-dropdown");
      const groupInput = groupDD?.querySelector(`input[value="${groupName}"]`);
      if (groupInput) {
        row.dataset.group = groupName;
        row.querySelector(".group-display span").textContent = groupName;
      }
    }

    // SubGroup
    if (subGroupName) {
      const subDD = row.querySelector(".subgroup-dropdown");
      const subInput = subDD?.querySelector(`input[value="${subGroupName}"]`);
      if (subInput) {
        row.dataset.subGroup = subGroupName;
        row.querySelector(".subgroup-display span").textContent = subGroupName;
      }
    }

    // SKU
    if (sku) {
      row.querySelector(".sku-input").value = sku;
    }
  }
}

function applyImportedCredit(creditData) {
  creditData.forEach(([label, value]) => {
    if (!value) return;

    if (label === "รูปแบบการวางบิล") {
      document.getElementById("spBillingCycle").value = value;
    } else if (label === "เงื่อนไขเครดิต") {
      document.getElementById("spCreditTerm").value = value;
    } else if (label === "วงเงินเครดิต") {
      document.getElementById("spCreditLimit").value = value;
    } else if (label === "หน่วยวงเงิน") {
      document.getElementById("spCreditLimitUnit").value = value;
    }
  });
}

function applyImportedPaymentMethods(paymentData) {
  const container = document.getElementById("paymentMethodContainer");
  const template = container.querySelector(".payment-row");

  // ล้างแถวเก่า (ยกเว้น template)
  Array.from(container.querySelectorAll(".payment-row")).slice(1).forEach(r => r.remove());

  paymentData.forEach((pm, idx) => {
    const [method, bank, account, accountName] = pm;
    if (!method && !bank) return;

    if (idx === 0) {
      template.querySelector(".payment-method-select").value = method || "";
      template.querySelector(".bank-input").value = bank || "";
      template.querySelector(".account-input").value = account || "";
      template.querySelector(".account-name-input").value = accountName || "";
    } else {
      window.addPaymentMethodRow?.({
        method: method || "",
        bank: bank || "",
        account: account || "",
        accountName: accountName || ""
      });
    }
  });
}

function applyImportedClaim(claimData) {
  claimData.forEach(([label, value]) => {
    if (!value) return;

    if (label === "ระยะเวลารับเคลม") {
      document.getElementById("spClaimPeriod").value = value;
    } else if (label === "เงื่อนไขการรับเคลม") {
      document.getElementById("spClaimCondition").value = value;
    } else if (label === "หมายเหตุเพิ่มเติม") {
      document.getElementById("spClaimNote").value = value;
    }
  });
}

function applyImportedContacts(contacts) {
  // สำหรับ contacts จะใส่ใน form แถวแรกเท่านั้น (ตาม UI ปัจจุบัน)
  if (!contacts.length) return;

  const [c] = contacts;
  const [type, name, position, region, province, brand, productGroup, startDate, email, lineId, phones] = c;

  if (name) document.getElementById("ctName").value = name;
  if (position) document.getElementById("ctPosition").value = position;
  if (startDate) document.getElementById("ctStartDate").value = startDate;
  if (email) document.getElementById("ctEmail").value = email;
  if (lineId) document.getElementById("ctLine").value = lineId;
  if (phones) {
    document.getElementById("phoneContainer").innerHTML = `
      <div class="phone-row">
        <input type="text" class="form-control phone-input" value="${phones}">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="this.parentElement.remove()">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `;
  }

  if (type === "บริษัท") {
    document.getElementById("ctTypeCompany").checked = true;
  } else {
    document.getElementById("ctTypePerson").checked = true;
  }
}

// ===================================================
// EXPOSE
// ===================================================
window.exportToExcel = exportToExcel;
window.importFromExcel = importFromExcel;

// ===================================================
// TARGET: EXPORT TO EXCEL
// ===================================================
async function exportTargetToExcel() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: ข้อมูลเป้าหมาย (Form Data)
  const targetFormData = collectTargetFormData();
  const formData = [
    ["สถานะ", targetFormData.status || ""],
    ["ผู้ให้เป้า", targetFormData.provider || ""],
    ["ชื่อเป้าหมาย", targetFormData.name || ""],
    ["เป้าหลัก (Parent)", targetFormData.parent || ""],
    ["", ""],
    ["--- ขอบเขตเป้าหมาย (Scope) ---", ""],
    ["ภาค", targetFormData.region || ""],
    ["จังหวัด", targetFormData.province || ""],
    ["สาขา", targetFormData.branch || ""],
    ["ประเภทสินค้า", targetFormData.category || ""],
    ["แบรนด์", targetFormData.brand || ""],
    ["กลุ่มสินค้า", targetFormData.group || ""],
    ["กลุ่มย่อย", targetFormData.subgroup || ""],
    ["สีของสินค้า", targetFormData.color || ""],
    ["ความหนา", targetFormData.thickness || ""],
    ["รหัสแม่พิมพ์", targetFormData.mold || ""],
    ["SKU", targetFormData.sku || ""],
    ["", ""],
    ["--- เงื่อนไขในการให้เป้าหมาย ---", ""],
    ["ระยะเวลาได้รับผลประโยชน์", targetFormData.benefit || ""],
    ["ประเภทเป้า", targetFormData.type || ""],
    ["เป้าหมาย", targetFormData.qty || ""],
    ["หน่วย", targetFormData.unit || ""],
    ["วันที่เริ่มเป้า", targetFormData.startDate || ""],
    ["วันที่สิ้นสุดเป้า", targetFormData.endDate || ""]
  ];
  const wsForm = XLSX.utils.aoa_to_sheet(formData);
  XLSX.utils.book_append_sheet(wb, wsForm, "ข้อมูลเป้าหมาย");

  // Sheet 2: รายการเป้าที่บันทึกแล้ว
  const targetsRes = await fetch(`${window.API_BASE}/api/suppliers/${supplierNo}/targets?status=OPEN`);
  const targets = targetsRes.ok ? await targetsRes.json() : [];
  const targetListData = [
    ["สถานะ", "ชื่อเป้าหมาย", "ผู้ให้เป้า", "Scope", "ประเภท", "เป้าหมาย", "หน่วย", "วันที่เริ่ม", "วันที่สิ้นสุด"]
  ];
  targets.forEach(t => {
    targetListData.push([
      t.status || "",
      t.name || "",
      t.provider || "",
      t.scope || "",
      t.type || "",
      t.qty || "",
      t.unit || "",
      t.startDate || "",
      t.endDate || ""
    ]);
  });
  const wsList = XLSX.utils.aoa_to_sheet(targetListData);
  XLSX.utils.book_append_sheet(wb, wsList, "รายการเป้า");

  // Download
  XLSX.writeFile(wb, `Supplier_${supplierNo}_Target.xlsx`);
}

function collectTargetFormData() {
  return {
    status: document.getElementById("tgStatusText")?.textContent || "",
    provider: document.getElementById("tgProvider")?.value || "",
    name: document.getElementById("tgName")?.value || "",
    parent: document.getElementById("tgParent")?.value || "",
    region: document.getElementById("regionText")?.textContent || "",
    province: document.getElementById("provinceText")?.textContent || "",
    branch: document.getElementById("branchText")?.textContent || "",
    category: document.getElementById("tgCat")?.value || "",
    brand: document.getElementById("tgBrand")?.value || "",
    group: document.getElementById("tgGroup")?.value || "",
    subgroup: document.getElementById("tgSub")?.value || "",
    color: document.getElementById("tgColor")?.value || "",
    thickness: document.getElementById("tgThick")?.value || "",
    mold: document.getElementById("tgMold")?.value || "",
    sku: document.getElementById("tgSku")?.value || "",
    benefit: document.getElementById("tgBenefit")?.value || "",
    type: document.getElementById("tgType")?.value || "",
    qty: document.getElementById("tgQty")?.value || "",
    unit: document.getElementById("tgUnit")?.value || "",
    startDate: document.getElementById("tgStart")?.value || "",
    endDate: document.getElementById("tgEnd")?.value || ""
  };
}

// ===================================================
// TARGET: IMPORT FROM EXCEL
// ===================================================
async function importTargetFromExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);

    // Import ข้อมูลเป้าหมาย
    const formSheet = wb.Sheets["ข้อมูลเป้าหมาย"];
    if (formSheet) {
      const formData = XLSX.utils.sheet_to_json(formSheet, { header: 1 });
      applyImportedTargetForm(formData);
    }

    showSaveMessage("นำเข้าข้อมูลเป้าหมายจาก Excel เรียบร้อยแล้ว");

  } catch (err) {
    console.error("Import Target error:", err);
    alert("เกิดข้อผิดพลาดในการนำเข้าข้อมูล: " + err.message);
  }

  event.target.value = "";
}

function applyImportedTargetForm(formData) {
  const map = {};
  formData.forEach(([key, value]) => {
    if (key) map[key] = value;
  });

  // ผู้ให้เป้า
  if (map["ผู้ให้เป้า"]) {
    const providerSelect = document.getElementById("tgProvider");
    const option = Array.from(providerSelect.options).find(opt => opt.text === map["ผู้ให้เป้า"]);
    if (option) providerSelect.value = option.value;
  }

  // ชื่อเป้าหมาย
  if (map["ชื่อเป้าหมาย"]) {
    document.getElementById("tgName").value = map["ชื่อเป้าหมาย"];
  }

  // เป้าหลัก
  if (map["เป้าหลัก (Parent)"]) {
    document.getElementById("tgParent").value = map["เป้าหลัก (Parent)"];
  }

  // Scope
  if (map["ประเภทสินค้า"]) {
    document.getElementById("tgCat").value = map["ประเภทสินค้า"];
  }
  if (map["แบรนด์"]) {
    document.getElementById("tgBrand").value = map["แบรนด์"];
  }
  if (map["กลุ่มสินค้า"]) {
    document.getElementById("tgGroup").value = map["กลุ่มสินค้า"];
  }
  if (map["กลุ่มย่อย"]) {
    document.getElementById("tgSub").value = map["กลุ่มย่อย"];
  }
  if (map["สีของสินค้า"]) {
    document.getElementById("tgColor").value = map["สีของสินค้า"];
  }
  if (map["ความหนา"]) {
    document.getElementById("tgThick").value = map["ความหนา"];
  }
  if (map["รหัสแม่พิมพ์"]) {
    document.getElementById("tgMold").value = map["รหัสแม่พิมพ์"];
  }
  if (map["SKU"]) {
    document.getElementById("tgSku").value = map["SKU"];
  }

  // เงื่อนไข
  if (map["ระยะเวลาได้รับผลประโยชน์"]) {
    document.getElementById("tgBenefit").value = map["ระยะเวลาได้รับผลประโยชน์"];
  }
  if (map["ประเภทเป้า"]) {
    document.getElementById("tgType").value = map["ประเภทเป้า"];
  }
  if (map["เป้าหมาย"]) {
    document.getElementById("tgQty").value = map["เป้าหมาย"];
  }
  if (map["หน่วย"]) {
    document.getElementById("tgUnit").value = map["หน่วย"];
  }
  if (map["วันที่เริ่มเป้า"]) {
    document.getElementById("tgStart").value = map["วันที่เริ่มเป้า"];
  }
  if (map["วันที่สิ้นสุดเป้า"]) {
    document.getElementById("tgEnd").value = map["วันที่สิ้นสุดเป้า"];
  }
}

// Expose Target functions
window.exportTargetToExcel = exportTargetToExcel;
window.importTargetFromExcel = importTargetFromExcel;

// ===================================================
// MOQ: EXPORT TO EXCEL
// ===================================================
async function exportMoqToExcel() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: ข้อมูล MOQ (Form Data)
  const moqFormData = collectMoqFormData();
  const formData = [
    ["สถานะ", moqFormData.status || ""],
    ["ชื่อเงื่อนไข", moqFormData.name || ""],
    ["", ""],
    ["--- ขอบเขตของเงื่อนไข (Scope) ---", ""],
    ["ภาค", moqFormData.region || ""],
    ["สาขา", moqFormData.branch || ""],
    ["ประเภทสินค้า", moqFormData.category || ""],
    ["แบรนด์", moqFormData.brand || ""],
    ["กลุ่มสินค้า", moqFormData.group || ""],
    ["กลุ่มย่อย", moqFormData.subgroup || ""],
    ["สีของสินค้า", moqFormData.color || ""],
    ["รหัสแม่พิมพ์", moqFormData.mold || ""],
    ["ความหนา", moqFormData.thickness || ""],
    ["SKU", moqFormData.sku || ""],
    ["", ""],
    ["--- เงื่อนไขในการสั่งสินค้า ---", ""],
    ["ประเภทเงื่อนไข", moqFormData.type || ""],
    ["ประเภทรถ", moqFormData.vehicle || ""],
    ["ประเภทตัววัด", moqFormData.measure || ""],
    ["จำนวน", moqFormData.qty || ""],
    ["หน่วย", moqFormData.unit || ""]
  ];
  const wsForm = XLSX.utils.aoa_to_sheet(formData);
  XLSX.utils.book_append_sheet(wb, wsForm, "ข้อมูล MOQ");

  // Sheet 2: รายการ MOQ ที่บันทึกแล้ว
  const moqsRes = await fetch(`${window.API_BASE}/api/suppliers/${supplierNo}/moqs?status=active`);
  const moqs = moqsRes.ok ? await moqsRes.json() : [];
  const moqListData = [
    ["สถานะ", "ชื่อเงื่อนไข", "Scope", "ประเภท", "จำนวน", "หน่วย"]
  ];
  moqs.forEach(m => {
    moqListData.push([
      m.status || "",
      m.name || "",
      m.scope || "",
      m.type || "",
      m.qty || "",
      m.unit || ""
    ]);
  });
  const wsList = XLSX.utils.aoa_to_sheet(moqListData);
  XLSX.utils.book_append_sheet(wb, wsList, "รายการ MOQ");

  // Download
  XLSX.writeFile(wb, `Supplier_${supplierNo}_MOQ.xlsx`);
}

function collectMoqFormData() {
  return {
    status: document.getElementById("moqStatusText")?.textContent || "",
    name: document.getElementById("moqName")?.value || "",
    region: document.getElementById("moqRegionText")?.textContent || "",
    branch: document.getElementById("moqBranchText")?.textContent || "",
    category: document.getElementById("moqCat")?.value || "",
    brand: document.getElementById("moqBrand")?.value || "",
    group: document.getElementById("moqGroup")?.value || "",
    subgroup: document.getElementById("moqSub")?.value || "",
    color: document.getElementById("moqColor")?.value || "",
    mold: document.getElementById("moqMold")?.value || "",
    thickness: document.getElementById("moqThick")?.value || "",
    sku: document.getElementById("moqSku")?.value || "",
    type: document.getElementById("moqType")?.value || "",
    vehicle: document.getElementById("moqVehicle")?.value || "",
    measure: document.getElementById("moqMeasure")?.value || "",
    qty: document.getElementById("moqQty")?.value || "",
    unit: document.getElementById("moqUnit")?.value || ""
  };
}

// ===================================================
// MOQ: IMPORT FROM EXCEL
// ===================================================
async function importMoqFromExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);

    // Import ข้อมูล MOQ
    const formSheet = wb.Sheets["ข้อมูล MOQ"];
    if (formSheet) {
      const formData = XLSX.utils.sheet_to_json(formSheet, { header: 1 });
      applyImportedMoqForm(formData);
    }

    showSaveMessage("นำเข้าข้อมูล MOQ จาก Excel เรียบร้อยแล้ว");

  } catch (err) {
    console.error("Import MOQ error:", err);
    alert("เกิดข้อผิดพลาดในการนำเข้าข้อมูล: " + err.message);
  }

  event.target.value = "";
}

function applyImportedMoqForm(formData) {
  const map = {};
  formData.forEach(([key, value]) => {
    if (key) map[key] = value;
  });

  // ชื่อเงื่อนไข
  if (map["ชื่อเงื่อนไข"]) {
    document.getElementById("moqName").value = map["ชื่อเงื่อนไข"];
  }

  // Scope
  if (map["ประเภทสินค้า"]) {
    document.getElementById("moqCat").value = map["ประเภทสินค้า"];
  }
  if (map["แบรนด์"]) {
    document.getElementById("moqBrand").value = map["แบรนด์"];
  }
  if (map["กลุ่มสินค้า"]) {
    document.getElementById("moqGroup").value = map["กลุ่มสินค้า"];
  }
  if (map["กลุ่มย่อย"]) {
    document.getElementById("moqSub").value = map["กลุ่มย่อย"];
  }
  if (map["สีของสินค้า"]) {
    document.getElementById("moqColor").value = map["สีของสินค้า"];
  }
  if (map["รหัสแม่พิมพ์"]) {
    document.getElementById("moqMold").value = map["รหัสแม่พิมพ์"];
  }
  if (map["ความหนา"]) {
    document.getElementById("moqThick").value = map["ความหนา"];
  }
  if (map["SKU"]) {
    document.getElementById("moqSku").value = map["SKU"];
  }

  // เงื่อนไขการสั่ง
  if (map["ประเภทเงื่อนไข"]) {
    document.getElementById("moqType").value = map["ประเภทเงื่อนไข"];
  }
  if (map["ประเภทรถ"]) {
    document.getElementById("moqVehicle").value = map["ประเภทรถ"];
  }
  if (map["ประเภทตัววัด"]) {
    document.getElementById("moqMeasure").value = map["ประเภทตัววัด"];
  }
  if (map["จำนวน"]) {
    document.getElementById("moqQty").value = map["จำนวน"];
  }
  if (map["หน่วย"]) {
    document.getElementById("moqUnit").value = map["หน่วย"];
  }
}

// Expose MOQ functions
window.exportMoqToExcel = exportMoqToExcel;
window.importMoqFromExcel = importMoqFromExcel;