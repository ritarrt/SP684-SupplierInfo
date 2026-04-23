// supplier-target-excel.js — Export Template + Import สำหรับหน้าเป้าสินค้า

// ============================================================
// BUILD LOOKUP MAPS
// ============================================================
async function buildAllLookups(supplierNo) {
  // โหลด coverage + branch master พร้อมกัน
  var coverageRes = await fetch(API_BASE + "/api/suppliers/" + supplierNo + "/coverage");
  var branchRes   = await fetch(API_BASE + "/api/master/branches");

  var coverageItems = coverageRes.ok ? await coverageRes.json() : [];
  var branchItems   = branchRes.ok   ? await branchRes.json()   : [];

  // --- branch lookup ---
  var branchMap = {}, provinceMap = {};
  branchItems.forEach(function(b) {
    var code = String(b.branchCode || "").trim();
    var name = String(b.branchName || "").trim();
    var obj  = { branchCode: code, branchName: name, province: b.province || "", region: b.region || "" };
    if (code) branchMap[code.toUpperCase()] = obj;
    if (name) branchMap[name.toLowerCase()]  = obj;
    var prov = String(b.province || "").trim();
    var reg  = String(b.region   || "").trim();
    if (prov && reg) provinceMap[prov.toLowerCase()] = reg;
  });

  // --- coverage lookups (brand / group / sub) ---
  var brandMap = {}, groupMap = {}, subMap = {};
  var catSet = {};  // category ที่ supplier มี

  coverageItems.forEach(function(item) {
    var cat = item.category || "";
    if (cat) catSet[cat] = true;

    if (item.brand_no != null && item.brand_name) {
      var no   = String(item.brand_no).trim();
      var name = String(item.brand_name).trim().toLowerCase();
      var obj  = { brand_no: no, brand_name: item.brand_name };
      brandMap[cat + "|" + name] = obj;
      brandMap[cat + "|" + no]   = obj;
    }
    if (item.group_code != null && item.group_name) {
      var code = String(item.group_code).trim();
      var name = String(item.group_name).trim().toLowerCase();
      var obj  = { group_code: code, group_name: item.group_name };
      groupMap[cat + "|" + name] = obj;
      groupMap[cat + "|" + code] = obj;
    }
    if (item.subGroup != null && item.sub_group_name) {
      var code = String(item.subGroup).trim();
      var name = String(item.sub_group_name).trim().toLowerCase();
      var obj  = { sub_code: code, sub_name: item.sub_group_name };
      subMap[cat + "|" + name] = obj;
      subMap[cat + "|" + code] = obj;
    }
  });

  // --- color / thickness: ดึงจาก master API ตาม category จริง ---
  var colorMap = {}, thickMap = {};
  var colorRawByCat = {}, thickRawByCat = {};  // เก็บ raw สำหรับ sheet อ้างอิง

  var categories = Object.keys(catSet);
  var colorCats = ["Glass", "Aluminum", "Gypsum", "C-Line", "Sealant", "Accessories"];
  var thickCats = ["Glass", "Aluminum", "Gypsum", "C-Line"];

  // โหลด color ทุก category ที่ supplier มี (parallel)
  var colorFetches = categories
    .filter(function(c) { return colorCats.indexOf(c) >= 0; })
    .map(function(cat) {
      return fetch(API_BASE + "/api/master/colors/" + encodeURIComponent(cat))
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(items) {
          colorRawByCat[cat] = items;
          items.forEach(function(item) {
            var no   = String(item.COLOR_NO || "").trim();
            var name = String(item.COLOR_NAME || "").trim().toLowerCase();
            if (no) {
              colorMap[cat + "|" + name] = no;
              colorMap[cat + "|" + no]   = no;
            }
          });
        });
    });

  // โหลด thickness ทุก category ที่ supplier มี (parallel)
  var thickFetches = categories
    .filter(function(c) { return thickCats.indexOf(c) >= 0; })
    .map(function(cat) {
      return fetch(API_BASE + "/api/master/thickness/" + encodeURIComponent(cat))
        .then(function(r) { return r.ok ? r.json() : []; })
        .then(function(items) {
          thickRawByCat[cat] = items;
          items.forEach(function(item) {
            var no   = String(item.THICKNESS_NO || "").trim().padStart(2, "0");
            var name = String(item.THICKNESS_NAME || "").trim().toLowerCase();
            if (no) {
              thickMap[cat + "|" + name] = no;
              thickMap[cat + "|" + no]   = no;
              thickMap[cat + "|" + String(item.THICKNESS_NO || "").trim()] = no;
            }
          });
        });
    });

  await Promise.all(colorFetches.concat(thickFetches));

  return {
    brandMap: brandMap, groupMap: groupMap, subMap: subMap,
    colorMap: colorMap, thickMap: thickMap,
    branchMap: branchMap, provinceMap: provinceMap,
    branchItems: branchItems,
    catSet: catSet,
    colorRawByCat: colorRawByCat,
    thickRawByCat: thickRawByCat
  };
}

// ============================================================
// EXPORT TEMPLATE
// ============================================================
window.exportTargetTemplate = async function exportTargetTemplate() {
  var supplierNo = window.supplierNo;
  if (!supplierNo) { alert("ไม่พบรหัส Supplier"); return; }

  var lookup;
  try {
    lookup = await buildAllLookups(supplierNo);
  } catch(e) {
    lookup = { branchItems: [] };
    console.warn("โหลด lookup ไม่ได้:", e);
  }

  var wb = new ExcelJS.Workbook();
  var ws = wb.addWorksheet("เป้าสินค้า");

  var fillYellow = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9C4" } };
  var fillBlue   = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1565C0" } };
  var fillGreen  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5E9" } };
  var fillGray   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
  var fontInst   = { bold: true, color: { argb: "FF5D4037" }, name: "Sarabun", size: 10 };
  var fontHead   = { bold: true, color: { argb: "FFFFFFFF" }, name: "Sarabun", size: 10 };
  var fontEx     = { bold: true, italic: true, color: { argb: "FF1B5E20" }, name: "Sarabun", size: 10 };
  var fontData   = { name: "Sarabun", size: 10 };
  var border     = { style: "thin", color: { argb: "FFBDBDBD" } };
  var allBorders = { top: border, bottom: border, left: border, right: border };

  function styleRow(row, fill, font) {
    row.eachCell({ includeEmpty: true }, function(cell) {
      cell.fill = fill; cell.font = font;
      cell.border = allBorders;
      cell.alignment = { vertical: "middle", wrapText: false };
    });
  }

  var headers = [
    "ชื่อเป้าหมาย*", "เป้าหลัก (target_ref)",
    "ภาค", "จังหวัด", "สาขา (branchCode)",
    "ประเภทสินค้า*", "แบรนด์* (คั่นด้วย ,)",
    "กลุ่มสินค้า (คั่นด้วย ,)", "กลุ่มย่อย (คั่นด้วย ,)",
    "สีของสินค้า (คั่นด้วย ,)", "ความหนา (คั่นด้วย ,)", "รหัสแม่พิมพ์", "SKU",
    "ระยะเวลาผลประโยชน์*", "ประเภทเป้า*",
    "เป้าหมาย*", "หน่วย*",
    "วันที่เริ่ม* (YYYY-MM-DD)", "วันที่สิ้นสุด* (YYYY-MM-DD)"
  ];
  var NCOLS = headers.length;

  var instructions = [
    "📋 Supplier: " + supplierNo + " | Template นำเข้าเป้าสินค้า",
    "📋 คำแนะนำ: กรอกข้อมูลในตารางด้านล่าง (คอลัมน์ที่มี * จำเป็นต้องกรอก)",
    "1. ประเภทสินค้า: เลือกจาก dropdown (1 ค่าเท่านั้น)",
    "2. แบรนด์ / กลุ่มสินค้า / กลุ่มย่อย / สี / ความหนา: เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น AGC,YKK",
    "3. ภาค / จังหวัด / สาขา: เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น BKK01,CNX01",
    "4. ระยะเวลาผลประโยชน์: ทุกสิ้นเดือน | ทุกสิ้นไตรมาส | สิ้นปี  (เลือกจาก dropdown)",
    "5. ประเภทเป้า: น้ำหนัก | มูลค่ารวมในการซื้อ | จำนวน | เป้าพื้นที่  (เลือกจาก dropdown)",
    "6. หน่วย: บาท | ตัน | ชิ้น | ตร.ฟุต  |  วันที่: YYYY-MM-DD เช่น 2025-01-01"
  ];

  instructions.forEach(function(text) {
    var r = ws.addRow([text].concat(Array(NCOLS - 1).fill("")));
    ws.mergeCells(r.number, 1, r.number, NCOLS);
    styleRow(r, fillYellow, fontInst);
    r.height = 18;
  });

  var headerRow = ws.addRow(headers);
  styleRow(headerRow, fillBlue, fontHead);
  headerRow.eachCell(function(cell) { cell.alignment = { horizontal: "center", vertical: "middle" }; });
  headerRow.height = 22;

  var examples = [
    ["⬇ ตัวอย่าง: เป้ากระจก Q2/68", "", "ภาคกลาง", "กรุงเทพมหานคร", "BKK01", "Glass", "AGC", "กระจกใส", "", "", "6", "", "", "ทุกสิ้นไตรมาส", "เป้าพื้นที่", "50000", "ตร.ฟุต", "2025-04-01", "2025-06-30"],
    ["⬇ ตัวอย่าง: หลายแบรนด์+หลายสี", "", "ภาคกลาง,ภาคเหนือ", "", "", "Aluminum", "YKK,AGC", "อลูมิเนียมบาร์", "", "ขาว,เงิน", "", "", "", "ทุกสิ้นเดือน", "น้ำหนัก", "200", "ตัน", "2025-01-01", "2025-12-31"]
  ];
  examples.forEach(function(data) {
    var r = ws.addRow(data);
    styleRow(r, fillGreen, fontEx);
    r.height = 18;
  });

  var colWidths = [28,20,14,20,18,16,16,16,14,12,10,14,16,22,20,12,10,22,22];
  colWidths.forEach(function(w, i) { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 9 }];

  // ============================================================
  // DATA VALIDATION — สร้าง lookup sheet ก่อน แล้วค่อย validate
  // ============================================================

  // --- sheet Lookup (hidden) สำหรับ validation lists ---
  var wsLookup = wb.addWorksheet("_Lookup");

  // column A: ประเภทสินค้า
  var catList = Object.keys(lookup.catSet || {}).sort();
  wsLookup.getCell("A1").value = "ประเภทสินค้า";
  catList.forEach(function(v, i) { wsLookup.getCell("A" + (i + 2)).value = v; });

  // column B: ภาค (unique จาก branchData)
  var regionList = [...new Set((lookup.branchItems || []).map(function(b) { return b.region; }).filter(Boolean))].sort();
  wsLookup.getCell("B1").value = "ภาค";
  regionList.forEach(function(v, i) { wsLookup.getCell("B" + (i + 2)).value = v; });

  // column C: จังหวัด
  var provinceList = [...new Set((lookup.branchItems || []).map(function(b) { return b.province; }).filter(Boolean))].sort();
  wsLookup.getCell("C1").value = "จังหวัด";
  provinceList.forEach(function(v, i) { wsLookup.getCell("C" + (i + 2)).value = v; });

  // column D: branchCode
  var branchList = (lookup.branchItems || []).map(function(b) { return b.branchCode; }).filter(Boolean);
  wsLookup.getCell("D1").value = "สาขา";
  branchList.forEach(function(v, i) { wsLookup.getCell("D" + (i + 2)).value = v; });

  // column E: แบรนด์ (ชื่อ unique ทุก category)
  var brandNameList = [];
  var seenBrandName = {};
  Object.keys(lookup.brandMap).forEach(function(key) {
    var info = lookup.brandMap[key];
    var parts = key.split("|"); var val = parts[1];
    if (isNaN(val) && val && info.brand_name && !seenBrandName[info.brand_name]) {
      seenBrandName[info.brand_name] = true;
      brandNameList.push(info.brand_name);
    }
  });
  brandNameList.sort();
  wsLookup.getCell("E1").value = "แบรนด์";
  brandNameList.forEach(function(v, i) { wsLookup.getCell("E" + (i + 2)).value = v; });

  // column F: กลุ่มสินค้า
  var groupNameList = [];
  var seenGroupName = {};
  Object.keys(lookup.groupMap).forEach(function(key) {
    var info = lookup.groupMap[key];
    var parts = key.split("|"); var val = parts[1];
    if (isNaN(val) && val && info.group_name && !seenGroupName[info.group_name]) {
      seenGroupName[info.group_name] = true;
      groupNameList.push(info.group_name);
    }
  });
  groupNameList.sort();
  wsLookup.getCell("F1").value = "กลุ่มสินค้า";
  groupNameList.forEach(function(v, i) { wsLookup.getCell("F" + (i + 2)).value = v; });

  // column G: กลุ่มย่อย
  var subNameList = [];
  var seenSubName = {};
  Object.keys(lookup.subMap).forEach(function(key) {
    var info = lookup.subMap[key];
    var parts = key.split("|"); var val = parts[1];
    if (isNaN(val) && val && info.sub_name && !seenSubName[info.sub_name]) {
      seenSubName[info.sub_name] = true;
      subNameList.push(info.sub_name);
    }
  });
  subNameList.sort();
  wsLookup.getCell("G1").value = "กลุ่มย่อย";
  subNameList.forEach(function(v, i) { wsLookup.getCell("G" + (i + 2)).value = v; });

  // column H: สี (ชื่อ unique ทุก category)
  var colorNameList = [];
  var seenColorName = {};
  Object.keys(lookup.colorRawByCat || {}).forEach(function(cat) {
    (lookup.colorRawByCat[cat] || []).forEach(function(item) {
      var name = String(item.COLOR_NAME || "").trim();
      if (name && !seenColorName[name]) { seenColorName[name] = true; colorNameList.push(name); }
    });
  });
  colorNameList.sort();
  wsLookup.getCell("H1").value = "สี";
  colorNameList.forEach(function(v, i) { wsLookup.getCell("H" + (i + 2)).value = v; });

  // column I: ความหนา
  var thickNameList = [];
  var seenThickName = {};
  Object.keys(lookup.thickRawByCat || {}).forEach(function(cat) {
    (lookup.thickRawByCat[cat] || []).forEach(function(item) {
      var name = String(item.THICKNESS_NAME || "").trim();
      if (name && !seenThickName[name]) { seenThickName[name] = true; thickNameList.push(name); }
    });
  });
  thickNameList.sort();
  wsLookup.getCell("I1").value = "ความหนา";
  thickNameList.forEach(function(v, i) { wsLookup.getCell("I" + (i + 2)).value = v; });

  // column J: ระยะเวลาผลประโยชน์ (ตายตัว)
  ["ทุกสิ้นเดือน","ทุกสิ้นไตรมาส","สิ้นปี"].forEach(function(v, i) {
    wsLookup.getCell("J" + (i + 2)).value = v;
  });

  // column K: ประเภทเป้า (ตายตัว)
  ["น้ำหนัก","มูลค่ารวมในการซื้อ","จำนวน","เป้าพื้นที่"].forEach(function(v, i) {
    wsLookup.getCell("K" + (i + 2)).value = v;
  });

  // column L: หน่วย (ตายตัว)
  ["บาท","ตัน","ชิ้น","ตร.ฟุต"].forEach(function(v, i) {
    wsLookup.getCell("L" + (i + 2)).value = v;
  });

  // ซ่อน sheet _Lookup
  wsLookup.state = "veryHidden";

  // helper: สร้าง range reference สำหรับ validation
  function makeRef(col, count) {
    return "_Lookup!$" + col + "$2:$" + col + "$" + (count + 1);
  }

  // header row อยู่ที่ row 8 (7 instruction rows + 1 header)
  // data rows เริ่มที่ row 10 (หลัง 2 example rows)
  // ใส่ validation rows 10-1000
  var DATA_START = 10;
  var DATA_END   = 1000;

  // map: column index (1-based) → lookup ref
  // headers: 1=ชื่อเป้า 2=เป้าหลัก 3=ภาค 4=จังหวัด 5=สาขา 6=ประเภทสินค้า 7=แบรนด์
  //          8=กลุ่มสินค้า 9=กลุ่มย่อย 10=สี 11=ความหนา 12=แม่พิมพ์ 13=SKU
  //          14=ระยะเวลา 15=ประเภทเป้า 16=เป้าหมาย 17=หน่วย 18=วันเริ่ม 19=วันสิ้นสุด
  var validations = [
    { col: 3,  ref: makeRef("B", regionList.length),    prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น ภาคกลาง,ภาคเหนือ" },
    { col: 4,  ref: makeRef("C", provinceList.length),  prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น กรุงเทพมหานคร,เชียงใหม่" },
    { col: 5,  ref: makeRef("D", branchList.length),    prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น BKK01,CNX01" },
    { col: 6,  ref: makeRef("A", catList.length),       prompt: "เลือกประเภทสินค้า (1 ค่าเท่านั้น)" },
    { col: 7,  ref: makeRef("E", brandNameList.length), prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น AGC,YKK" },
    { col: 8,  ref: makeRef("F", groupNameList.length), prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น กระจกใส,กระจกสี" },
    { col: 9,  ref: makeRef("G", subNameList.length),   prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย ," },
    { col: 10, ref: makeRef("H", colorNameList.length), prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น ขาว,เงิน,ดำ" },
    { col: 11, ref: makeRef("I", thickNameList.length), prompt: "เลือกจาก dropdown หรือพิมพ์หลายค่าคั่นด้วย , เช่น 6,8,10" },
    { col: 14, ref: '"ทุกสิ้นเดือน,ทุกสิ้นไตรมาส,สิ้นปี"',           prompt: "เลือก 1 ค่า", inline: true },
    { col: 15, ref: '"น้ำหนัก,มูลค่ารวมในการซื้อ,จำนวน,เป้าพื้นที่"', prompt: "เลือก 1 ค่า", inline: true },
    { col: 17, ref: '"บาท,ตัน,ชิ้น,ตร.ฟุต"',                          prompt: "เลือก 1 ค่า", inline: true },
  ];

  // ใส่ validation ทีละ column
  // col 6=ประเภทสินค้า, 14=ระยะเวลา, 15=ประเภทเป้า, 17=หน่วย → strict (1 ค่า)
  // ที่เหลือ → showErrorMessage: false (พิมพ์หลายค่าคั่น , ได้)
  var strictCols = { 6: true, 14: true, 15: true, 17: true };

  validations.forEach(function(v) {
    var colLetter = ws.getColumn(v.col).letter;
    var isStrict  = !!strictCols[v.col];
    for (var row = DATA_START; row <= DATA_END; row++) {
      ws.getCell(colLetter + row).dataValidation = {
        type: "list",
        allowBlank: true,
        showDropDown: false,
        formulae: [v.inline ? v.ref : v.ref],
        showErrorMessage: isStrict,
        error: isStrict ? "กรุณาเลือกค่าจากรายการเท่านั้น" : undefined,
        errorTitle: isStrict ? "ค่าไม่ถูกต้อง" : undefined,
        showInputMessage: true,
        promptTitle: isStrict ? "📌 เลือก 1 ค่า" : "💡 เลือกหรือพิมพ์หลายค่า",
        prompt: v.prompt,
      };
    }
  });

  // --- sheet 2: รายการสาขา ---
  var wsBranch = wb.addWorksheet("รายการสาขา");
  var branchHeaders = ["branchCode", "ชื่อสาขา", "จังหวัด", "ภาค"];
  var bh = wsBranch.addRow(branchHeaders);
  bh.eachCell(function(cell) {
    cell.fill = fillBlue; cell.font = fontHead;
    cell.border = allBorders;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  bh.height = 20;

  (lookup.branchItems || []).forEach(function(b) {
    var r = wsBranch.addRow([b.branchCode, b.branchName, b.province, b.region]);
    r.eachCell({ includeEmpty: true }, function(cell) {
      cell.font = fontData; cell.border = allBorders;
      cell.alignment = { vertical: "middle" };
    });
    r.height = 16;
  });
  [10, 24, 20, 16].forEach(function(w, i) { wsBranch.getColumn(i + 1).width = w; });
  wsBranch.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];


  // --- sheet 3: ข้อมูลอ้างอิง ---
  var wsRef = wb.addWorksheet("ข้อมูลอ้างอิง");

  function writeRefSection(title, colHeaders, rows, titleFill) {
    var titleRow = wsRef.addRow([title]);
    wsRef.mergeCells(titleRow.number, 1, titleRow.number, colHeaders.length);
    titleRow.getCell(1).fill = titleFill;
    titleRow.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Sarabun", size: 10 };
    titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    titleRow.height = 20;

    var hRow = wsRef.addRow(colHeaders);
    hRow.eachCell(function(cell) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.font = { bold: true, name: "Sarabun", size: 10 };
      cell.border = allBorders;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    hRow.height = 18;

    rows.forEach(function(rowData) {
      var r = wsRef.addRow(rowData);
      r.eachCell({ includeEmpty: true }, function(cell) {
        cell.font = fontData; cell.border = allBorders;
        cell.alignment = { vertical: "middle" };
      });
      r.height = 16;
    });
    wsRef.addRow([]);
  }

  // สร้าง unique lists สำหรับ sheet อ้างอิง
  var brandRows = [], groupRows = [], subRows = [], colorRows = [], thickRows = [];
  var seenBrand = {}, seenGroup = {}, seenSub = {};

  Object.keys(lookup.brandMap).forEach(function(key) {
    var parts = key.split("|"); var cat = parts[0]; var val = parts[1];
    var info = lookup.brandMap[key];
    if (isNaN(val) && val && info.brand_no) {
      var uid = cat + "|" + info.brand_no;
      if (!seenBrand[uid]) { seenBrand[uid] = true; brandRows.push([cat, info.brand_name, info.brand_no]); }
    }
  });
  Object.keys(lookup.groupMap).forEach(function(key) {
    var parts = key.split("|"); var cat = parts[0]; var val = parts[1];
    var info = lookup.groupMap[key];
    if (isNaN(val) && val && info.group_code) {
      var uid = cat + "|" + info.group_code;
      if (!seenGroup[uid]) { seenGroup[uid] = true; groupRows.push([cat, info.group_name, info.group_code]); }
    }
  });
  Object.keys(lookup.subMap).forEach(function(key) {
    var parts = key.split("|"); var cat = parts[0]; var val = parts[1];
    var info = lookup.subMap[key];
    if (isNaN(val) && val && info.sub_code) {
      var uid = cat + "|" + info.sub_code;
      if (!seenSub[uid]) { seenSub[uid] = true; subRows.push([cat, info.sub_name, info.sub_code]); }
    }
  });

  // color/thickness: ใช้ raw data จาก master API (ครบตาม dropdown จริง)
  Object.keys(lookup.colorRawByCat || {}).forEach(function(cat) {
    (lookup.colorRawByCat[cat] || []).forEach(function(item) {
      var no   = String(item.COLOR_NO   || "").trim();
      var name = String(item.COLOR_NAME || "").trim();
      if (no && name) colorRows.push([cat, name, no]);
    });
  });
  Object.keys(lookup.thickRawByCat || {}).forEach(function(cat) {
    (lookup.thickRawByCat[cat] || []).forEach(function(item) {
      var no   = String(item.THICKNESS_NO   || "").trim().padStart(2, "0");
      var name = String(item.THICKNESS_NAME || "").trim();
      if (no && name) thickRows.push([cat, name, no]);
    });
  });

  function sortByCat(a, b) { return a[0].localeCompare(b[0]); }
  brandRows.sort(sortByCat); groupRows.sort(sortByCat); subRows.sort(sortByCat);
  colorRows.sort(sortByCat); thickRows.sort(sortByCat);

  // catSet จาก lookup
  var catSet = lookup.catSet || {};

  var mkFill = function(argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; };

  writeRefSection("ประเภทสินค้า → นำไปกรอกในคอลัมน์ 'ประเภทสินค้า'", ["ประเภทสินค้า"],
    Object.keys(catSet).sort().map(function(c) { return [c]; }), mkFill("FF1B5E20"));

  writeRefSection("แบรนด์ → นำ 'ชื่อแบรนด์' ไปกรอกในคอลัมน์ 'แบรนด์'", ["ประเภทสินค้า", "ชื่อแบรนด์ ← กรอกค่านี้", "brand_code (อ้างอิง)"],
    brandRows, mkFill("FF1565C0"));

  writeRefSection("กลุ่มสินค้า → นำ 'ชื่อกลุ่ม' ไปกรอกในคอลัมน์ 'กลุ่มสินค้า'", ["ประเภทสินค้า", "ชื่อกลุ่ม ← กรอกค่านี้", "group_code (อ้างอิง)"],
    groupRows, mkFill("FF6A1B9A"));

  writeRefSection("กลุ่มย่อย → นำ 'ชื่อกลุ่มย่อย' ไปกรอกในคอลัมน์ 'กลุ่มย่อย'", ["ประเภทสินค้า", "ชื่อกลุ่มย่อย ← กรอกค่านี้", "sub_code (อ้างอิง)"],
    subRows, mkFill("FF4A148C"));

  writeRefSection("สีของสินค้า → นำ 'ชื่อสี' ไปกรอกในคอลัมน์ 'สีของสินค้า'", ["ประเภทสินค้า", "ชื่อสี ← กรอกค่านี้", "color_no (อ้างอิง)"],
    colorRows, mkFill("FFB71C1C"));

  writeRefSection("ความหนา → นำ 'ชื่อความหนา' ไปกรอกในคอลัมน์ 'ความหนา'", ["ประเภทสินค้า", "ชื่อความหนา ← กรอกค่านี้", "thickness_no (อ้างอิง)"],
    thickRows, mkFill("FFE65100"));

  writeRefSection("รหัสแม่พิมพ์ → นำไปกรอกในคอลัมน์ 'รหัสแม่พิมพ์'", ["รหัสแม่พิมพ์ ← กรอกค่านี้"],
    [["M-001"], ["M-002"], ["A-101"]], mkFill("FF37474F"));

  writeRefSection("ระยะเวลาผลประโยชน์ → นำไปกรอกในคอลัมน์ 'ระยะเวลาผลประโยชน์'", ["ค่าที่ใช้ได้ ← กรอกค่านี้"],
    [["ทุกสิ้นเดือน"], ["ทุกสิ้นไตรมาส"], ["สิ้นปี"]], mkFill("FF00695C"));

  writeRefSection("ประเภทเป้า → นำไปกรอกในคอลัมน์ 'ประเภทเป้า'", ["ค่าที่ใช้ได้ ← กรอกค่านี้"],
    [["น้ำหนัก"], ["มูลค่ารวมในการซื้อ"], ["จำนวน"], ["เป้าพื้นที่"]], mkFill("FF00695C"));

  writeRefSection("หน่วย → นำไปกรอกในคอลัมน์ 'หน่วย'", ["ค่าที่ใช้ได้ ← กรอกค่านี้"],
    [["บาท"], ["ตัน"], ["ชิ้น"], ["ตร.ฟุต"]], mkFill("FF00695C"));

  wsRef.getColumn(1).width = 20;
  wsRef.getColumn(2).width = 38;
  wsRef.getColumn(3).width = 14;

  // download
  var buf  = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href = url; a.download = "Target_Template_" + supplierNo + ".xlsx";
  a.click(); URL.revokeObjectURL(url);
};

// ============================================================
// IMPORT FROM EXCEL
// ============================================================
window.importTargetFromExcel = async function importTargetFromExcel(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;

  var supplierNo = window.supplierNo;
  if (!supplierNo) { alert("ไม่พบรหัส Supplier"); return; }

  try {
    // 1. โหลด lookup ทั้งหมดก่อน
    var lookup;
    try {
      lookup = await buildAllLookups(supplierNo);
      console.log("Coverage lookup:", Object.keys(lookup.brandMap).length, "brands |",
                  Object.keys(lookup.branchMap).length, "branches");
    } catch(e) {
      lookup = { brandMap:{}, groupMap:{}, subMap:{}, colorMap:{}, thickMap:{}, branchMap:{}, provinceMap:{} };
      console.warn("โหลด lookup ไม่ได้:", e);
    }

    // 2. อ่านไฟล์
    var data = await file.arrayBuffer();
    var wb   = XLSX.read(data, { cellDates: false });
    var sheetName = wb.SheetNames.indexOf("เป้าสินค้า") >= 0 ? "เป้าสินค้า" : wb.SheetNames[0];
    var ws = wb.Sheets[sheetName];
    if (!ws) { alert("ไม่พบข้อมูลใน Excel"); return; }

    var jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    // หา header row
    var headerRowIdx = -1;
    for (var i = 0; i < Math.min(jsonData.length, 15); i++) {
      if (jsonData[i] && jsonData[i].some(function(c) { return String(c).indexOf("ชื่อเป้าหมาย") >= 0; })) {
        headerRowIdx = i; break;
      }
    }
    if (headerRowIdx === -1) { alert("ไม่พบ header row กรุณาใช้ไฟล์ที่ Export จากระบบ"); return; }

    var header = jsonData[headerRowIdx].map(function(h) { return String(h).trim(); });
    var dataRows = jsonData.slice(headerRowIdx + 1).filter(function(r) {
      if (!r.some(function(c) { return c !== ""; })) return false;  // แถวว่าง
      var first = String(r[0]).trim();
      if (first.startsWith("⬇")) return false;   // แถวตัวอย่าง
      if (first.startsWith("---")) return false;  // separator ข้อมูลเดิม
      return true;
    });

    // ตัดแถวข้อมูลเดิม (ทุกแถวหลัง separator "---")
    var cutIdx = -1;
    for (var i = 0; i < dataRows.length; i++) {
      if (String(dataRows[i][0]).startsWith("---")) { cutIdx = i; break; }
    }
    if (cutIdx >= 0) dataRows = dataRows.slice(0, cutIdx);

    if (dataRows.length === 0) { alert("ไม่พบข้อมูลในไฟล์ Excel"); return; }

    // map header → index (strip * และ วงเล็บออก เพื่อให้ match ง่าย)
    var idx = {};
    header.forEach(function(h, i) {
      if (h) {
        idx[h] = i;  // key เต็ม
        var clean = h.replace(/\*/g, "").replace(/\s*\(.*?\)/g, "").trim();
        if (clean && clean !== h) idx[clean] = i;  // key สั้น
      }
    });

    function getVal(row, key) {
      var k = Object.keys(idx).find(function(k) { return k === key; }) ||
              Object.keys(idx).find(function(k) { return k.indexOf(key) >= 0; });
      var val = (k !== undefined && row[idx[k]] !== undefined) ? row[idx[k]] : "";
      return String(val).trim();
    }

    function parseDate(val) {
      if (!val) return null;

      // กรณี Excel serial number (number หรือ string ที่เป็นตัวเลขล้วน)
      var numVal = typeof val === "number" ? val : (/^\d+$/.test(String(val).trim()) ? parseInt(String(val).trim()) : null);
      if (numVal !== null) {
        var d = XLSX.SSF.parse_date_code(numVal);
        if (d) {
          var y = d.y > 2500 ? d.y - 543 : d.y;
          return y + "-" + String(d.m).padStart(2,"0") + "-" + String(d.d).padStart(2,"0");
        }
      }

      var s = String(val).trim();

      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        var y = parseInt(s.split("-")[0]);
        return (y > 2500 ? (y - 543) : y) + "-" + s.slice(5);
      }

      // DD/MM/YYYY หรือ DD/MM/YY
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
        var parts = s.split("/");
        var y = parseInt(parts[2]);
        if (y < 100) y += 2000;
        if (y > 2500) y -= 543;
        return y + "-" + String(parseInt(parts[1])).padStart(2,"0") + "-" + String(parseInt(parts[0])).padStart(2,"0");
      }

      return s || null;
    }

    // 3. Resolve name → code
    function resolveRow(row) {
      var category = getVal(row, "ประเภทสินค้า");
      var brandRaw = getVal(row, "แบรนด์");
      var groupRaw = getVal(row, "กลุ่มสินค้า");
      var subRaw   = getVal(row, "กลุ่มย่อย");
      var colorRaw = getVal(row, "สีของสินค้า");
      var thickRaw = getVal(row, "ความหนา");
      var branchRaw  = getVal(row, "สาขา");
      var provinceRaw = getVal(row, "จังหวัด");
      var regionRaw   = getVal(row, "ภาค");

      // brand
      var brandInfo = lookup.brandMap[category + "|" + brandRaw.toLowerCase()] || null;
      var brand_no   = brandInfo ? brandInfo.brand_no   : null;
      var brand_name = brandInfo ? brandInfo.brand_name : (brandRaw || null);

      // group
      var groupInfo = lookup.groupMap[category + "|" + groupRaw.toLowerCase()] || null;
      var group_code = groupInfo ? groupInfo.group_code : null;
      var group_name = groupInfo ? groupInfo.group_name : (groupRaw || null);

      // sub
      var subInfo  = lookup.subMap[category + "|" + subRaw.toLowerCase()] || null;
      var sub_code = subInfo ? subInfo.sub_code : null;
      var sub_name = subInfo ? subInfo.sub_name : (subRaw || null);

      // color
      var colorKey = category + "|" + colorRaw.toLowerCase();
      var color_no = (lookup.colorMap[colorKey] !== undefined) ? lookup.colorMap[colorKey] : (colorRaw || null);

      // thickness
      var thickKey = category + "|" + thickRaw.toLowerCase();
      var thick_no = (lookup.thickMap[thickKey] !== undefined)
                     ? lookup.thickMap[thickKey]
                     : (thickRaw ? String(thickRaw).padStart(2, "0") : null);

      // branch — resolve ชื่อ/code → branchCode
      var resolvedBranch = branchRaw;
      if (branchRaw) {
        var bInfo = lookup.branchMap[branchRaw.toUpperCase()] ||
                    lookup.branchMap[branchRaw.toLowerCase()] || null;
        if (bInfo) {
          resolvedBranch = bInfo.branchCode;
          // ถ้าไม่ได้กรอก province/region ให้ใช้จาก branch master
          if (!provinceRaw) provinceRaw = bInfo.province;
          if (!regionRaw)   regionRaw   = bInfo.region;
        }
      }

      // province → region (ถ้ายังไม่มี region)
      if (provinceRaw && !regionRaw) {
        regionRaw = lookup.provinceMap[provinceRaw.toLowerCase()] || regionRaw;
      }

      return {
        category: category,
        brand_no: brand_no, brand_name: brand_name,
        group_code: group_code, group_name: group_name,
        sub_code: sub_code, sub_name: sub_name,
        color_no: color_no, thick_no: thick_no,
        branch: resolvedBranch || null,
        province: provinceRaw || null,
        region: regionRaw || null
      };
    }

    // 4. Import
    var successCount = 0, errorCount = 0;
    var errors = [], warnings = [];

    for (var ri = 0; ri < dataRows.length; ri++) {
      var row = dataRows[ri];
      var targetName = getVal(row, "ชื่อเป้าหมาย");
      var targetQty  = getVal(row, "เป้าหมาย");
      var targetUnit = getVal(row, "หน่วย");
      var startRaw   = getVal(row, "วันที่เริ่ม");
      var endRaw     = getVal(row, "วันที่สิ้นสุด");
      var startDate  = parseDate(startRaw);
      var endDate    = parseDate(endRaw);
      var resolved   = resolveRow(row);

      if (!targetName || !resolved.category || !resolved.brand_name || !targetQty || !targetUnit || !startDate || !endDate) {
        if (targetName || resolved.category) {
          errors.push('"' + (targetName || "(ไม่มีชื่อ)") + '" — ข้อมูลไม่ครบ');
          errorCount++;
        }
        continue;
      }

      if (!resolved.brand_no) {
        warnings.push('"' + targetName + '" — ไม่พบ brand_code ของ "' + resolved.brand_name + '" ใน coverage (คำนวณอาจไม่ถูก)');
      }

      var payload = {
        supplier_code:     supplierNo,
        target_name:       targetName,
        parent_target_ref: getVal(row, "เป้าหลัก") || null,
        region:            resolved.region,
        province:          resolved.province,
        branch:            resolved.branch,
        category:          resolved.category,
        brand:             resolved.brand_name,
        brand_name:        resolved.brand_name,
        brand_no:          resolved.brand_no,
        group:             resolved.group_code,
        group_name:        resolved.group_name,
        group_code:        resolved.group_code,
        sub_group:         resolved.sub_name,
        sub_group_name:    resolved.sub_name,
        sub_group_code:    resolved.sub_code,
        color:             resolved.color_no,
        thickness:         resolved.thick_no,
        mold:              getVal(row, "รหัสแม่พิมพ์") || null,
        sku:               getVal(row, "SKU") || null,
        benefit_period:    getVal(row, "ระยะเวลาผลประโยชน์") || "ทุกสิ้นเดือน",
        target_type:       getVal(row, "ประเภทเป้า") || "น้ำหนัก",
        target_qty:        parseFloat(String(targetQty).replace(/,/g, "")) || 0,
        target_unit:       targetUnit,
        start_date:        startDate,
        end_date:          endDate
      };

      try {
        var res = await fetch(API_BASE + "/api/targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          successCount++;
        } else {
          var errText = await res.text();
          errorCount++;
          errors.push('"' + targetName + '": ' + errText);
        }
      } catch(err) {
        errorCount++;
        errors.push('"' + targetName + '": ' + err.message);
      }
    }

    // 5. แสดงผล
    if (successCount > 0 || errorCount > 0) {
      var msg = "นำเข้าสำเร็จ " + successCount + " รายการ";
      if (errorCount > 0) msg += " | ผิดพลาด " + errorCount + " รายการ";
      if (warnings.length > 0) {
        msg += "\n\n⚠️ คำเตือน (" + warnings.length + " รายการ):\n" +
               warnings.slice(0, 3).join("\n") + (warnings.length > 3 ? "\n..." : "");
      }
      if (errors.length > 0) {
        msg += "\n\nข้อผิดพลาด:\n" + errors.slice(0, 5).join("\n");
      }
      if (errors.length > 0 || warnings.length > 0) {
        alert(msg);
      } else {
        window.showToast ? window.showToast(msg, false) : alert(msg);
      }
      if (window.loadTargetTable) window.loadTargetTable();
    } else {
      alert("ไม่พบแถวที่มีข้อมูลครบถ้วน");
    }

  } catch(err) {
    console.error("Import Target error:", err);
    alert("เกิดข้อผิดพลาด: " + err.message);
  }

  event.target.value = "";
};

// ============================================================
// ผูก event หลัง DOM พร้อม
// ============================================================
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("tgExportBtn") &&
    document.getElementById("tgExportBtn").addEventListener("click", function() {
      exportTargetTemplate();
    });

  document.getElementById("tgImportFile") &&
    document.getElementById("tgImportFile").addEventListener("change", function(e) {
      importTargetFromExcel(e);
    });
});

console.log("supplier-target-excel.js loaded");
