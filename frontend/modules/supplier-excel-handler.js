console.log("supplier-excel-handler.js loaded");

// ===================================================
// DEAL: EXPORT TO EXCEL (ExcelJS — รองรับ styling)
// ===================================================
async function exportDealToExcel() {
  const supplierNo = new URLSearchParams(location.search).get("id");
  if (!supplierNo) { alert("ไม่พบ supplierNo"); return; }

  // โหลด SKU
  let allSkuList = window.cachedSkuData || [];
  if (allSkuList.length === 0) {
    try {
      const r = await fetch(`${window.API_BASE}/api/master/sku-by-branch`);
      if (!r.ok) { alert("ไม่สามารถโหลดข้อมูล SKU ได้"); return; }
      allSkuList = await r.json();
    } catch (e) { alert("โหลด SKU ไม่ได้: " + e.message); return; }
  }
  if (allSkuList.length === 0) { alert("ไม่พบข้อมูล SKU"); return; }

  const selectedBranch   = document.getElementById("dealBranchSelect")?.value || "";
  const selectedCategory = document.getElementById("dealCategorySelect")?.value || "";

  // โหลด deals เดิม
  let existingDeals = [];
  try {
    const r = await fetch(`${window.API_BASE}/api/suppliers/${supplierNo}/deals-simple`);
    if (r.ok) existingDeals = await r.json();
  } catch (e) { console.error("Load deals error:", e); }

  // map SKU|branch → [deal, ...]
  const dealMap = {};
  existingDeals.forEach(d => {
    const key = (d.sku || "") + "|" + (d.branch || "");
    if (!dealMap[key]) dealMap[key] = [];
    dealMap[key].push(d);
  });

  // filter SKU
  let skuList = allSkuList;
  if (selectedBranch)   skuList = skuList.filter(s => s.branchCode === selectedBranch);
  if (selectedCategory) skuList = skuList.filter(s => s.category   === selectedCategory);

  // ===== ExcelJS =====
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ดีลราคา");

  const headers = [
    "สาขา","ประเภทสินค้า","SKU","ชื่อสินค้า","แบรนด์","หน่วย",
    "ราคาตั้งต้น","ชื่อดีลราคา","Project No",
    "กรอบเงื่อนไข","Tier","จาก","ถึง",
    "ราคาดีล/ส่วนลด","หน่วย","ประเภทดีล",
    "วันที่เริ่ม","วันที่สิ้นสุด",
    "ลงลัง","Supplier ส่ง","หมายเหตุ"
  ];
  const NCOLS = headers.length;

  // --- style helpers ---
  const fillInstruction = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
  const fillHeader      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1565C0" } };
  const fillExample     = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  const fontInstruction = { bold: true,  color: { argb: "FF5D4037" }, name: "Sarabun", size: 10 };
  const fontHeader      = { bold: true,  color: { argb: "FFFFFFFF" }, name: "Sarabun", size: 10 };
  const fontExample     = { bold: true, italic: true, color: { argb: "FF1B5E20" }, name: "Sarabun", size: 10 };
  const fontData        = { name: "Sarabun", size: 10 };
  const borderThin      = { style: "thin", color: { argb: "FFBDBDBD" } };
  const allBorders      = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };

  const applyRowStyle = (row, fill, font) => {
    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill   = fill;
      cell.font   = font;
      cell.border = allBorders;
      cell.alignment = { vertical: "middle", wrapText: false };
    });
  };

  // --- คำแนะนำ row 1-6 ---
  const instructions = [
    `📋 สาขา: ${selectedBranch || "ทุกสาขา"} | ประเภท: ${selectedCategory || "ทุกประเภท"}`,
    "📋 คำแนะนำ: กรอกข้อมูลดีลราคาในตารางด้านล่าง",
    "1. กรอบเงื่อนไข: ราคาปกติ หรือ ขั้นบันได",
    "2. ประเภทดีล: ส่วนลด (จำนวนส่วนลด) หรือ ราคาใหม่",
    "3. ลงลัง/Supplier ส่ง: ใช่ หรือ ไม่",
    "4. ขั้นบันได: ใส่ SKU และชื่อดีลเดียวกันซ้ำหลายแถว แต่ละแถวคือ 1 tier",
    "5. หน่วย (คอลัมน์ก่อนประเภทดีล): หน่วยของราคาดีล เช่น บาท, บาท/ชิ้น, บาท/ตัน, %"
  ];
  instructions.forEach(text => {
    const r = ws.addRow([text, ...Array(NCOLS - 1).fill("")]);
    applyRowStyle(r, fillInstruction, fontInstruction);
    r.height = 18;
  });

  // --- header row 7 ---
  const headerRow = ws.addRow(headers);
  applyRowStyle(headerRow, fillHeader, fontHeader);
  headerRow.eachCell(cell => { cell.alignment = { horizontal: "center", vertical: "middle" }; });
  headerRow.height = 20;

  // --- ตัวอย่าง row 8-10 ---
  const examples = [
    ["⬇ ตัวอย่าง: ราคาปกติ","Glass","GL-001-CLR-6","กระจกใส 6mm","AGC","แผ่น",250,"ดีลกระจก Q2/68","","ราคาปกติ","","","",10,"บาท","ส่วนลด","2025-04-01","2025-06-30","ใช่","ส่ง",""],
    ["⬇ ตัวอย่าง: ขั้นบันได tier 1","Glass","GL-002-CLR-8","กระจกใส 8mm","AGC","แผ่น",320,"ดีลขั้นบันได Q2/68","","ขั้นบันได",1,1,100,15,"บาท","ส่วนลด","2025-04-01","2025-06-30","ใช่","ส่ง",""],
    ["⬇ ตัวอย่าง: ขั้นบันได tier 2","Glass","GL-002-CLR-8","กระจกใส 8mm","AGC","แผ่น",320,"ดีลขั้นบันได Q2/68","","ขั้นบันได",2,101,999,25,"บาท","ส่วนลด","2025-04-01","2025-06-30","ใช่","ส่ง",""]
  ];
  examples.forEach(data => {
    const r = ws.addRow(data);
    applyRowStyle(r, fillExample, fontExample);
    r.height = 18;
  });

  // --- ข้อมูลจริง ---
  skuList.forEach(s => {
    const branchCode = selectedBranch || s.branchCode || "";
    const key   = (s.sku || "") + "|" + branchCode;
    const deals = dealMap[key] || [{}];

    deals.forEach(deal => {
      const isActive = deal.status === "OPEN" || deal.status === "USE";
      if (deal.deal_id && !isActive) return;

      let dataRows = [];
      if (deal.condition_mode === "stepped" && deal.steps?.length > 0) {
        deal.steps.forEach(step => {
          dataRows.push([
            branchCode, s.category||"", s.sku||"", s.productName||"", s.brandName||"", s.baseUnit||"",
            deal.base_price ?? "", deal.deal_name||"", deal.project_no||"",
            "ขั้นบันได", step.step_number??"", step.from_qty??"", step.to_qty??"",
            step.price_value??"", step.price_unit||deal.price_unit||"",
            deal.deal_type === "Discount" ? "ส่วนลด" : deal.deal_type === "New Price" ? "ราคาใหม่" : "",
            formatDateForExcel(deal.start_date), formatDateForExcel(deal.end_date),
            deal.require_pallet    === false ? "ไม่" : "ใช่",
            deal.supplier_delivery === false ? "ไม่" : "ส่ง",
            deal.note||""
          ]);
        });
      } else {
        dataRows.push([
          branchCode, s.category||"", s.sku||"", s.productName||"", s.brandName||"", s.baseUnit||"",
          deal.base_price ?? "", deal.deal_name||"", deal.project_no||"",
          deal.condition_mode === "normal" ? "ราคาปกติ" : "", "", "", "",
          deal.price_value ?? "", deal.price_unit||"",
          deal.deal_type === "Discount" ? "ส่วนลด" : deal.deal_type === "New Price" ? "ราคาใหม่" : "",
          formatDateForExcel(deal.start_date), formatDateForExcel(deal.end_date),
          deal.require_pallet    === false ? "ไม่" : (deal.require_pallet    === true ? "ใช่" : ""),
          deal.supplier_delivery === false ? "ไม่" : (deal.supplier_delivery === true ? "ส่ง"  : ""),
          deal.note||""
        ]);
      }

      dataRows.forEach(rowData => {
        const r = ws.addRow(rowData);
        r.eachCell({ includeEmpty: true }, cell => {
          cell.font   = fontData;
          cell.border = allBorders;
          cell.alignment = { vertical: "middle" };
        });
        r.height = 16;
      });
    });
  });

  // --- column widths ---
  const colWidths = [18,14,22,36,16,8,12,22,14,14,8,8,8,14,8,12,12,12,8,12,24];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // --- freeze panes: แถว 1-7 คำแนะนำ + แถว 8 header + แถว 9-11 ตัวอย่าง ---
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 11 }];

  // --- download ---
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `ดีลราคา_${supplierNo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===================================================
// DEAL: IMPORT FROM EXCEL (ยังใช้ SheetJS เหมือนเดิม)
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
      const msg = `นำเข้าสำเร็จ ${result.successCount} รายการ (ใหม่ ${result.insertedCount} | อัปเดต ${result.updatedCount})${result.errorCount > 0 ? ` | ผิดพลาด ${result.errorCount} รายการ` : ""}`;
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
  let insertedCount = 0;
  let updatedCount = 0;
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

      // ข้ามแถวตัวอย่าง (column สาขาขึ้นต้นด้วย ⬇)
      if (branchRaw.startsWith("⬇")) continue;
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
        const data = await res.json();
        successCount++;
        if (data.action === "updated") updatedCount++;
        else insertedCount++;
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

  return { successCount, insertedCount, updatedCount, errorCount, errors };
}

// ===================================================
// EXPOSE
// ===================================================
window.exportDealToExcel = exportDealToExcel;
window.importDealFromExcel = importDealFromExcel;
