console.log("supplier-excel-handler.js loaded");

// ===================================================
// DEAL: EXPORT TO EXCEL (SKU by Branch)
// ===================================================
async function exportDealToExcel() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Get all SKU from StockStatusFact
  let allSkuList = window.cachedSkuData || [];
  console.log("Excel export - cached data:", allSkuList.length);

  if (allSkuList.length === 0) {
    try {
      console.log("Loading SKU data from API...");
      const skuRes = await fetch(`${window.API_BASE}/api/master/sku-by-branch`);
      if (skuRes.ok) {
        allSkuList = await skuRes.json();
        console.log("Loaded SKU:", allSkuList.length);
      } else {
        alert("ไม่สามารถโหลดข้อมูล SKU ได้");
        return;
      }
    } catch (err) {
      alert("ไม่สามารถโหลดข้อมูล SKU ได้: " + err.message);
      return;
    }
  }

  if (allSkuList.length === 0) {
    alert("ไม่พบข้อมูล SKU");
    return;
  }

  // Get selected branch and category from dropdown
  const selectedBranch = document.getElementById("dealBranchSelect")?.value;
  const selectedCategory = document.getElementById("dealCategorySelect")?.value;

  // Fetch existing deals from database
  let existingDeals = [];
  try {
    const dealsRes = await fetch(`${window.API_BASE}/api/suppliers/${supplierNo}/deals-simple`);
    if (dealsRes.ok) {
      existingDeals = await dealsRes.json();
    }
  } catch (err) {
    console.error("Failed to load existing deals:", err);
  }

  // Create map of SKU|branch -> deal data
  const dealMap = {};
  existingDeals.forEach(d => {
    const key = (d.sku || "") + "|" + (d.branch || "");
    dealMap[key] = d;
  });

  // Filter SKU by selected branch and category
  let filteredSkuList = allSkuList;
  if (selectedBranch) {
    filteredSkuList = filteredSkuList.filter(s => s.branchCode === selectedBranch);
  }
  if (selectedCategory) {
    filteredSkuList = filteredSkuList.filter(s => s.category === selectedCategory);
  }

  // Main headers
  const mainHeaders = [
    "สาขา", "ประเภทสินค้า", "SKU", "ชื่อสินค้า", "แบรนด์", "หน่วย",
    "ราคาตั้งต้น", "ชื่อดีลราคา", "Project No",
    "กรอบเงื่อนไข", "Tier", "จาก", "ถึง",
    "ราคาดีล/ส่วนลด", "หน่วย", "ประเภทดีล",
    "วันที่เริ่ม", "วันที่สิ้นสุด",
    "ลงลัง", "Supplier ส่ง", "หมายเหตุ"
  ];

  // Build rows with instructions
  const mainRows = [
    [`📋 สาขา: ${selectedBranch || "ทุกสาขา"} | ประเภท: ${selectedCategory || "ทุกประเภท"}`, ...Array(20).fill("")],
    ["📋 คำแนะนำ: กรอกข้อมูลดีลราคาในตารางด้านล่าง", ...Array(20).fill("")],
    ["1. กรอบเงื่อนไข: ราคาปกติ หรือ ขั้นบันได", ...Array(20).fill("")],
    ["2. ประเภทดีล: ส่วนลด (จำนวนส่วนลด) หรือ ราคาใหม่", ...Array(20).fill("")],
    ["3. ลงลัง/Supplier ส่ง: ใช่ หรือ ไม่", ...Array(20).fill("")],
    Array(21).fill(""),
    mainHeaders
  ];

  // Add SKU rows with existing deal data
  filteredSkuList.forEach(s => {
    const branchCode = selectedBranch || s.branchCode || "";
    const dealKey = (s.sku || "") + "|" + branchCode;
    const deal = dealMap[dealKey] || {};

    mainRows.push([
      branchCode,
      s.category || "",
      s.sku || "",
      s.productName || "",
      s.brandName || "",
      s.baseUnit || "",
      deal.base_price || "",
      deal.deal_name || "",
      deal.project_no || "",
      deal.condition_mode === "stepped" ? "ขั้นบันได" : (deal.condition_mode === "normal" ? "ราคาปกติ" : ""),
      "",  // Tier
      "",  // จาก
      "",  // ถึง
      deal.price_value || "",
      deal.price_unit || "",
      deal.deal_type === "Discount" ? "ส่วนลด" : deal.deal_type === "New Price" ? "ราคาใหม่" : "",
      formatDateForExcel(deal.start_date),
      formatDateForExcel(deal.end_date),
      deal.require_pallet === false ? "ไม่" : (deal.require_pallet === true ? "ใช่" : ""),
      deal.supplier_delivery === false ? "ไม่" : (deal.supplier_delivery === true ? "ส่ง" : ""),
      ""   // หมายเหตุ
    ]);
  });

  const wsMain = XLSX.utils.aoa_to_sheet(mainRows);

  wsMain["!cols"] = [
    { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 35 }, { wch: 15 }, { wch: 8 },
    { wch: 12 }, { wch: 20 }, { wch: 15 },
    { wch: 12 }, { wch: 8 },  { wch: 8 },  { wch: 8 },
    { wch: 12 }, { wch: 8 },  { wch: 12 },
    { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 12 }, { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, wsMain, "ดีลราคา");
  XLSX.writeFile(wb, `ดีลราคา_${supplierNo}.xlsx`);
}

// ===================================================
// DEAL: IMPORT FROM EXCEL
// ===================================================

// แปลง ISO date string → yyyy-MM-dd สำหรับใส่ใน Excel cell
function formatDateForExcel(dateStr) {
  if (!dateStr) return "";
  const datePart = String(dateStr).split("T")[0].split(" ")[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : (datePart || "");
}

// แปลง Excel serial date หรือ string date → yyyy-MM-dd
function parseExcelDate(val) {
  if (!val) return "";
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (!date) return "";
    return `${date.y}-${String(date.m).padStart(2,"0")}-${String(date.d).padStart(2,"0")}`;
  }
  const s = String(val).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return s;
}

async function importDealFromExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) {
    alert("ไม่พบ supplierNo");
    return;
  }

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { cellDates: false });

    // หา sheet "ดีลราคา" ก่อน ถ้าไม่มีใช้ sheet แรก
    const sheetName = wb.SheetNames.includes("ดีลราคา") ? "ดีลราคา" : wb.SheetNames[0];
    const dealSheet = wb.Sheets[sheetName];

    if (!dealSheet) {
      alert("ไม่พบข้อมูลใน Excel");
      return;
    }

    const jsonData = XLSX.utils.sheet_to_json(dealSheet, { header: 1, defval: "" });
    console.log("Sheet:", sheetName, "| Rows:", jsonData.length);

    // หา header row — row ที่มี cell เป็น "SKU"
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(jsonData.length, 15); i++) {
      if (jsonData[i] && jsonData[i].some(cell => String(cell).trim() === "SKU")) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      alert("ไม่พบ header row (ต้องมีคอลัมน์ 'SKU') กรุณาใช้ไฟล์ที่ Export จากระบบ");
      return;
    }

    const header = jsonData[headerRowIdx].map(h => String(h).trim());
    const dataRows = jsonData.slice(headerRowIdx + 1).filter(r => r.some(cell => cell !== ""));

    console.log("Header:", header);
    console.log("Data rows:", dataRows.length);

    if (dataRows.length === 0) {
      alert("ไม่พบข้อมูลในไฟล์ Excel");
      return;
    }

    const result = await processImportedDealRows(dataRows, header, supplierNo);

    if (result.successCount > 0 || result.errorCount > 0) {
      const msg = `นำเข้าสำเร็จ ${result.successCount} รายการ${result.errorCount > 0 ? ` | ผิดพลาด ${result.errorCount} รายการ` : ""}`;
      window.showSaveMessage ? window.showSaveMessage(msg) : alert(msg);
      if (window.loadDealList) window.loadDealList(supplierNo);
    } else {
      alert("ไม่พบแถวที่มีข้อมูลดีล (ต้องกรอก 'ชื่อดีลราคา' หรือ 'ราคาดีล/ส่วนลด')");
    }

  } catch (err) {
    console.error("Import Deal error:", err);
    alert("เกิดข้อผิดพลาด: " + err.message);
  }

  event.target.value = "";
}

async function processImportedDealRows(rows, header, supplierNo) {
  const idx = {};
  header.forEach((h, i) => { if (h) idx[h] = i; });

  if (idx["SKU"] === undefined) {
    console.error("ไม่พบคอลัมน์ SKU ใน header:", header);
    return { successCount: 0, errorCount: 0, errors: ["ไม่พบคอลัมน์ SKU"] };
  }

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (const row of rows) {
    const sku      = String(row[idx["SKU"]] ?? "").trim();
    const dealName = String(row[idx["ชื่อดีลราคา"]] ?? "").trim();
    const priceVal = row[idx["ราคาดีล/ส่วนลด"]];

    // ข้ามแถวที่ไม่มีข้อมูลดีล
    if (!sku || (!dealName && (priceVal === "" || priceVal == null))) continue;

    try {
      const branchRaw        = String(row[idx["สาขา"]] ?? "").trim();
      const conditionModeRaw = String(row[idx["กรอบเงื่อนไข"]] ?? "").trim();
      const conditionMode    = conditionModeRaw === "ขั้นบันได" ? "stepped" : "normal";
      const dealTypeRaw      = String(row[idx["ประเภทดีล"]] ?? "").trim();
      const dealType         = dealTypeRaw === "ราคาใหม่" ? "New Price" : "Discount";
      const requirePallet    = String(row[idx["ลงลัง"]] ?? "ใช่").trim() !== "ไม่";
      const supplierDelivery = String(row[idx["Supplier ส่ง"]] ?? "ส่ง").trim() !== "ไม่";
      const startDate        = parseExcelDate(row[idx["วันที่เริ่ม"]]);
      const endDate          = parseExcelDate(row[idx["วันที่สิ้นสุด"]]);

      const payload = {
        sku,
        branch:            branchRaw,
        base_price:        parseFloat(row[idx["ราคาตั้งต้น"]]) || 0,
        deal_name:         dealName,
        project_no:        String(row[idx["Project No"]] ?? "").trim(),
        note:              String(row[idx["หมายเหตุ"]] ?? "").trim(),
        condition_mode:    conditionMode,
        deal_type:         dealType,
        price_value:       parseFloat(priceVal) || 0,
        price_unit:        String(row[idx["หน่วย"]] ?? "บาท").trim() || "บาท",
        start_date:        startDate || null,
        end_date:          endDate || null,
        require_pallet:    requirePallet,
        supplier_delivery: supplierDelivery
      };

      if (conditionMode === "stepped") {
        payload.steps = [{
          tier:        parseInt(row[idx["Tier"]]) || 1,
          from_qty:    parseFloat(row[idx["จาก"]]) || 0,
          to_qty:      parseFloat(row[idx["ถึง"]]) || 0,
          price_value: parseFloat(priceVal) || 0,
          price_unit:  payload.price_unit
        }];
      }

      const res = await fetch(
        `${window.API_BASE}/api/suppliers/${encodeURIComponent(supplierNo)}/deals-simple`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      );

      if (res.ok) {
        successCount++;
      } else {
        const errText = await res.text();
        errorCount++;
        errors.push(`SKU ${sku} (${branchRaw}): ${errText}`);
        console.error("Import row error:", errText, payload);
      }
    } catch (err) {
      errorCount++;
      errors.push(`SKU ${sku}: ${err.message}`);
      console.error("Import row exception:", err);
    }
  }

  return { successCount, errorCount, errors };
}

// ===================================================
// EXPOSE
// ===================================================
window.exportDealToExcel = exportDealToExcel;
window.importDealFromExcel = importDealFromExcel;
