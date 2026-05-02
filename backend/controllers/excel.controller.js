import { getPool, sql } from "../config/db.js";
import XLSX from 'xlsx';

/**
 * =====================================================
 * POST /api/excel/import
 * Import data from Excel
 * =====================================================
 */
export async function importExcelData(req, res) {
  try {
    const { sheetName, productType, data, excelBuffer, availableSheets } = req.body;

    if (!sheetName) {
      return res.status(400).json({ 
        message: "Invalid data: sheetName is required" 
      });
    }

    const pool = await getPool();

    // Detect product type from tab selection or sheet name
    // ถ้า user เลือก tab มาแล้ว (productType มีค่า) ให้ใช้ค่านั้นตรงๆ
    // auto-detect จาก sheet name เฉพาะเมื่อไม่มี productType เท่านั้น
    let detectedType = productType;
    if (!detectedType) {
      const sheetLower = sheetName.toLowerCase();
      if (sheetLower.includes('gypsum') || sheetLower.includes('ยิปซั่ม') || sheetLower.includes('y1') || sheetLower.includes('sb')) {
        detectedType = 'Gypsum';
      } else if (sheetLower.includes('glass') || sheetLower.includes('กระจก') ||
                 sheetLower === 'float' || sheetLower === 'coated' ||
                 sheetLower === 't&l' || sheetLower === 'igu') {
        detectedType = 'Glass';
      } else if (sheetLower.includes('aluminum') || sheetLower.includes('อลูมิเนียม')) {
        detectedType = 'Aluminum';
      } else if (sheetLower === 'acc' || sheetLower.includes('accessories') || sheetLower.includes('อุปกรณ์')) {
        detectedType = 'Accessories';
      }
    }

    console.log(`Detected product type: ${detectedType} (from sheet: ${sheetName})`);

    // Convert base64 buffer back to Buffer if provided
    let bufferData = null;
    if (excelBuffer) {
      bufferData = Buffer.from(excelBuffer, 'base64');
    }

    let imported = 0;
    let status = 'success';
    let errorMessage = null;

    try {
      if (detectedType === "Gypsum") {
        if (bufferData) {
          imported = await importGypsumDataFromBuffer(pool, bufferData, sheetName);
        }
      } else if (detectedType === "Glass") {
        if (bufferData) {
          imported = await importGlassData(pool, bufferData, sheetName);
        }
      } else if (detectedType === "Accessories") {
        if (bufferData) {
          imported = await importAccessoriesData(pool, bufferData, sheetName);
        }
      } else {
        imported = data ? data.length : 0;
      }
    } catch (importErr) {
      status = 'error';
      errorMessage = importErr.message;
      console.error("Import error:", importErr);
    }

    // Save import log (1 log per upload)
    // Use only columns that exist in original table, new columns added by migration
    try {
      const colCheck = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'excel_import_logs'
      `);
      const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());

      if (cols.includes('product_type') && cols.includes('imported_rows') && cols.includes('status')) {
        // New schema with all columns
        await pool.request()
          .input("sheetName",    sql.NVarChar(255), sheetName)
          .input("productType",  sql.NVarChar(100), detectedType)
          .input("rowCount",     sql.Int,           data ? data.length : 0)
          .input("importedRows", sql.Int,           imported)
          .input("status",       sql.NVarChar(50),  status)
          .input("errorMessage", sql.NVarChar(sql.MAX), errorMessage || "")
          .query(`
            INSERT INTO excel_import_logs 
              (sheet_name, product_type, row_count, imported_rows, status, error_message, imported_at)
            VALUES 
              (@sheetName, @productType, @rowCount, @importedRows, @status, @errorMessage, GETDATE())
          `);
      } else {
        // Old schema - only original columns
        await pool.request()
          .input("sheetName",  sql.NVarChar(255), sheetName)
          .input("rowCount",   sql.Int,           data ? data.length : 0)
          .input("colCount",   sql.Int,           0)
          .query(`
            INSERT INTO excel_import_logs (sheet_name, row_count, column_count, imported_at)
            VALUES (@sheetName, @rowCount, @colCount, GETDATE())
          `);
      }
    } catch (logErr) {
      console.error("Failed to save import log:", logErr.message);
    }

    res.json({ 
      success: status === 'success', 
      imported,
      detectedType,
      message: `นำเข้าข้อมูล ${detectedType} สำเร็จ ${imported} แถว`
    });

  } catch (err) {
    console.error("importExcelData error:", err);
    res.status(500).json({ 
      message: "Failed to import data",
      error: err.message 
    });
  }
}

/**
 * =====================================================
 * Helper: Import Gypsum Data from Excel Buffer
 * =====================================================
 */
async function importGypsumDataFromBuffer(pool, excelBuffer, sheetName) {
  let imported = 0;

  try {
    console.log(`[Gypsum Parser] Starting import for sheet: ${sheetName}`);
    
    // Get brand mapping
    const brandResult = await pool.request().query(`
      SELECT BRAND_NO, BRAND_NAME FROM BRAND_Gypsum
    `);
    const brandMap = {};
    brandResult.recordset.forEach(row => {
      const brandNo = String(row.BRAND_NO).padStart(2, '0');
      brandMap[brandNo] = row.BRAND_NAME;
    });
    console.log(`[Gypsum Parser] Brand map loaded: ${Object.keys(brandMap).length} brands`);

    // Read Excel buffer
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    
    let worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      const firstSheetName = workbook.SheetNames[0];
      console.warn(`[Gypsum Parser] Sheet "${sheetName}" not found, using "${firstSheetName}"`);
      worksheet = workbook.Sheets[firstSheetName];
    }
    
    if (!worksheet) {
      console.error(`[Gypsum Parser] No sheets found`);
      return 0;
    }

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log(`[Gypsum Parser] Raw data rows: ${rawData.length}`);

    // ตรวจสอบ sheet format:
    // - Y1 format: branches อยู่ใน row 1 col 3+, SKU ขึ้นต้น Y อยู่ใน col0
    // - SB format: ข้อมูลอยู่ใน col0 (product name), branches อยู่ใน row 0 col 2+
    //              ไม่มี Y-SKU → ข้ามไป
    // - DCM format: section header "Y 1: Gypsum" ไม่ใช่ SKU จริง → ข้ามไป

    // ตรวจสอบว่ามี Y-SKU จริงๆ ไหม (ต้องมี col0 ขึ้นต้น Y ตามด้วยตัวเลข)
    // และต้องมี branches (row 1 col 3+) ด้วย ไม่งั้นเป็น lookup table หรือ DCM sheet
    const hasYSku = rawData.some(row => {
      if (!row) return false;
      const c0 = String(row[0] ?? '').trim();
      return /^Y\d/.test(c0); // Y ตามด้วยตัวเลข เช่น Y01010100109120240
    });

    if (!hasYSku) {
      console.log(`[Gypsum Parser] Sheet "${sheetName}" has no Y-SKUs (numeric), skipping`);
      return 0;
    }

    // อ่าน Sheet1 เพื่อสร้าง productType -> [SKU, ...] lookup map
    // Sheet1 structure: row 0 = product type names (columns), row 1+ = SKUs per column
    const skuLookup = {}; // productTypeName -> [sku1, sku2, ...]
    const sheet1 = workbook.Sheets['Sheet1'];
    if (sheet1) {
      const s1Data = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
      const s1Headers = s1Data[0] || [];
      s1Headers.forEach((h, colIdx) => {
        if (!h) return;
        const name = String(h).trim();
        const skus = [];
        for (let row = 1; row < s1Data.length; row++) {
          const val = s1Data[row]?.[colIdx];
          if (val && String(val).trim()) skus.push(String(val).trim());
        }
        if (skus.length > 0) skuLookup[name] = skus;
      });
      console.log(`[Gypsum Parser] Sheet1 SKU lookup loaded: ${Object.keys(skuLookup).length} product types with SKUs`);
    } else {
      console.warn(`[Gypsum Parser] Sheet1 not found, will use merged-cell SKU detection`);
    }

    // Zone → branchCodes mapping (Excel เก่าใช้ชื่อ zone แทน branchCode จริง)
    const ZONE_TO_BRANCHES = {
      'BKK': ['00TR','01TJ','02TN','03TS','04TP'],
      'C':   ['05AY','21BS','22BP','24TL','25SB','07RB'],
      'N':   ['11PL','12CM','17CR','23NS'],
      'NE':  ['08NR','09UB','10KK','18UD','20SK'],
      'E':   ['06RY','15CB'],
      'S':   ['13SR','14HY','16PK','19PC'],
    };

    // Auto-detect branch header row และ startCol
    // รองรับ 2 format:
    //   - Excel เก่า: header เป็น zone name (BKK, C, N, NE, E, S) → expand เป็น branchCodes หลายตัว
    //   - Excel ใหม่: header เป็น branchCode จริง (00TR, 01TJ, ...) → ใช้ตรงๆ
    //
    // branchColumns = [{ colIdx, branchCode }, ...]  — 1 entry ต่อ branchCode จริง
    const branchColumns = []; // { colIdx: number, branchCode: string }[]
    const branches = [];      // ชื่อ header ดิบจาก Excel (ใช้ตรวจ Format C)

    // ค้นหา branch header row: scan rows 0-5 หา row ที่มี zone/branchCode ใน col 2+
    const ALL_ZONE_KEYS = new Set(Object.keys(ZONE_TO_BRANCHES));
    const BRANCH_CODE_RE = /^\d{2}[A-Z]{2}$/; // เช่น 00TR, 01TJ
    let branchHeaderRowIdx = -1;
    let branchStartCol = 2; // default col 2

    for (let ri = 0; ri <= Math.min(5, rawData.length - 1); ri++) {
      const row = rawData[ri];
      if (!row) continue;
      // นับจำนวน zone/branchCode ที่พบใน row นี้ (col 2+)
      let matchCount = 0;
      let firstMatchCol = -1;
      for (let col = 2; col < row.length; col++) {
        const v = row[col];
        if (!v || typeof v !== 'string') continue;
        const h = v.trim();
        if (ALL_ZONE_KEYS.has(h) || BRANCH_CODE_RE.test(h)) {
          matchCount++;
          if (firstMatchCol === -1) firstMatchCol = col;
        }
      }
      if (matchCount >= 2) { // ต้องมีอย่างน้อย 2 zone/branch ถึงจะถือว่าเป็น header row
        branchHeaderRowIdx = ri;
        branchStartCol = firstMatchCol;
        break;
      }
    }

    if (branchHeaderRowIdx === -1) {
      console.error("[Gypsum Parser] Cannot find branch header row in first 6 rows");
      return 0;
    }
    console.log(`[Gypsum Parser] Branch header row: ${branchHeaderRowIdx}, startCol: ${branchStartCol}`);

    const branchHeaderRow = rawData[branchHeaderRowIdx];
    for (let col = branchStartCol; col < branchHeaderRow.length; col++) {
      const header = branchHeaderRow[col];
      if (!header || typeof header !== 'string' || !header.trim()) continue;
      const h = header.trim();
      branches.push(h);

      if (ZONE_TO_BRANCHES[h]) {
        // Excel เก่า: zone name → expand เป็น branchCodes ทั้งหมดในโซน
        // ทุก branchCode ในโซนใช้ราคาจาก colIdx เดียวกัน
        for (const branchCode of ZONE_TO_BRANCHES[h]) {
          branchColumns.push({ colIdx: col, branchCode });
        }
      } else {
        // Excel ใหม่: branchCode จริง → ใช้ตรงๆ
        branchColumns.push({ colIdx: col, branchCode: h });
      }
    }

    // data rows เริ่มหลัง branch header row
    const dataStartRow = branchHeaderRowIdx + 1;

    if (branchColumns.length === 0) {
      console.error("[Gypsum Parser] No branches found");
      return 0;
    }
    const uniqueBranchCodes = [...new Set(branchColumns.map(b => b.branchCode))];
    console.log(`[Gypsum Parser] Headers (${branches.length}): ${branches.join(', ')}`);
    console.log(`[Gypsum Parser] Branch codes (${uniqueBranchCodes.length}): ${uniqueBranchCodes.join(', ')}`);

    // Check once if discount_pct columns exist in DB
    const colCheck = await pool.request().query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME='excel_import_data' AND COLUMN_NAME='discount_pct_1'
    `);
    const hasDiscPct = colCheck.recordset[0].cnt > 0;
    console.log(`[Gypsum Parser] discount_pct columns: ${hasDiscPct ? 'YES' : 'NO (run migration)'}`);

    // Check if discount_pct_3 exists
    const colCheck3 = await pool.request().query(`
      SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME='excel_import_data' AND COLUMN_NAME='discount_pct_3'
    `);
    const hasDiscPct3 = colCheck3.recordset[0].cnt > 0;
    // Parse structure for "สูตร 4 step Y1":
    // Excel มี merged cells ทำให้ XLSX อ่านค่า SKU ออกมาใน col0 ของหลายแถว
    // 1 ตารางราคา อาจครอบคลุมหลาย SKU ที่อยู่ใน col0 ของแถวราคา
    // Format A: col0=SKU, col1=ProductName, col2="Price List", col3=ราคา (ราคาอยู่ใน row เดียวกัน)
    // Format B: col0=SKU, col1="Price List", col3=ราคา
    // Format C: col0=SKU, col1=ProductName, col3="BKK" → Price List อยู่แถวถัดไป
    // แถวราคา: col0=ว่าง หรือ SKU อื่น (จาก merged cell), col1=label

    const PRICE_LABELS = new Set(['Price List','Discount','RE (ex VAT)','VAT','Net Price (inc VAT)',
      'Transportation','COGS','Promotion Rebate','Net Cost',
      'Price : W1','Price : W2','Price : R1','Price : R2',
      'MG/Bht : W1','MG/Bht : W2','MG/Bht : R1','MG/Bht : R2',
      'MG/% : W1','MG/% : W2','MG/% : R1','MG/% : R2']);
    
    let productCount = 0;
    let i = dataStartRow;

    while (i < rawData.length) {
      const row = rawData[i];
      if (!row) { i++; continue; }

      const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
      const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
      const col2 = row[2] !== undefined ? String(row[2]).trim() : '';
      const col3 = row[3] !== undefined ? String(row[3]).trim() : '';

      const isPriceLabel = PRICE_LABELS.has(col1);

      // Block header: col0 เป็น Y-SKU จริง (Y ตามด้วยตัวเลข) และ col1 ไม่ใช่ price label
      // ยกเว้น "Price List" ซึ่งเป็นทั้ง price label และ block header (Format A/B)
      // ใช้ /^Y\d/ เพื่อกัน "Y 1: Gypsum", "Y1 : Smart Board" ซึ่งเป็น section header ไม่ใช่ SKU
      const isBlockHeader = /^Y\d/.test(col0) && (
        !isPriceLabel || col1 === 'Price List' || col2 === 'Price List'
      );

      if (isBlockHeader) {
        const primarySku = col0;
        let productName = 'Unknown';
        let priceListRowIndex = -1;

        if (col2 === 'Price List') {
          // Format A: col0=SKU, col1=ProductName, col2="Price List"
          productName = col1 || ('Product ' + primarySku);
          priceListRowIndex = i;
        } else if (col1 === 'Price List') {
          // Format B: col0=SKU, col1="Price List"
          productName = 'Product ' + primarySku;
          priceListRowIndex = i;
        } else if (col1 && branches.length > 0 && row[branchStartCol] !== undefined && String(row[branchStartCol]).trim() === branches[0]) {
          // Format C: col0=SKU, col1=ProductName, branchStartCol=ชื่อสาขาแรก → Price List อยู่แถวถัดไป
          productName = col1;
          for (let k = i + 1; k < Math.min(i + 5, rawData.length); k++) {
            const nr = rawData[k];
            if (!nr) continue;
            const nl1 = nr[1] !== undefined ? String(nr[1]).trim() : '';
            const nl2 = nr[2] !== undefined ? String(nr[2]).trim() : '';
            if (nl1 === 'Price List' || nl2 === 'Price List') {
              priceListRowIndex = k; break;
            }
          }
          if (priceListRowIndex === -1) { i++; continue; }
        } else {
          i++;
          continue;
        }

        // สร้าง skusInBlock จาก Sheet1 lookup เท่านั้น (source of truth)
        // ถ้า product type นี้ยังไม่มีใน Sheet1 หรือ SKU ว่าง → skip block นี้
        const skusInBlock = new Map(); // sku -> productName

        if (skuLookup[productName] && skuLookup[productName].length > 0) {
          skuLookup[productName].forEach(sku => skusInBlock.set(sku, productName));
          console.log(`[Gypsum Parser] "${productName}" → ${skusInBlock.size} SKUs from Sheet1`);
        } else {
          console.warn(`[Gypsum Parser] "${productName}" not in Sheet1 lookup yet, skipping`);
          i++;
          continue;
        }

        const priceListRow = rawData[priceListRowIndex];
        let priceList = priceListRow;
        let reExVat = null;
        let priceW1 = null, priceW2 = null, priceR1 = null, priceR2 = null;
        // discount สูงสุด 3 ชั้น: แต่ละชั้นมี % row และ ราคาหลังหัก row
        const discountPctRows  = [];  // [row1%, row2%, row3%]
        const discountPriceRows = []; // [rowAfter1, rowAfter2, rowAfter3]

        // Scan rows ระหว่าง header กับ priceListRowIndex (discount ที่อยู่ก่อน Price List)
        for (let k = i + 1; k < priceListRowIndex; k++) {
          const dr = rawData[k];
          if (!dr) continue;
          const nc1 = dr[1] !== undefined ? String(dr[1]).trim() : '';
          if (nc1 === 'Discount') {
            discountPctRows.push(dr);
          } else if (nc1 === '' && discountPctRows.length > discountPriceRows.length) {
            discountPriceRows.push(dr);
          }
        }

        let nextBlockIndex = priceListRowIndex + 1;
        while (nextBlockIndex < rawData.length) {
          const dataRow = rawData[nextBlockIndex];
          if (!dataRow) { nextBlockIndex++; continue; }

          const nextCol0 = dataRow[0] !== undefined ? String(dataRow[0]).trim() : '';
          const nextCol1 = dataRow[1] !== undefined ? String(dataRow[1]).trim() : '';
          const nextIsPriceLabel = PRICE_LABELS.has(nextCol1);

          // หยุดเมื่อเจอ product header ถัดไป
          // col0 ขึ้นต้น Y + col1 ไม่ใช่ price label + col1 ไม่ว่าง = block header ใหม่
          if (/^Y\d/.test(nextCol0) && !nextIsPriceLabel && nextCol1 !== '') break;

          // ไม่เพิ่ม SKU จาก merged cells — ใช้ Sheet1 lookup เท่านั้น

          if (nextCol1 === 'RE (ex VAT)')         reExVat = dataRow;
          else if (nextCol1 === 'Price : W1')     priceW1 = dataRow;
          else if (nextCol1 === 'Price : W2')     priceW2 = dataRow;
          else if (nextCol1 === 'Price : R1')     priceR1 = dataRow;
          else if (nextCol1 === 'Price : R2')     priceR2 = dataRow;
          else if (nextCol1 === 'Discount') {
            // หยุดเก็บ discount หลังจากเจอ Price : W1 แล้ว (ป้องกัน discount ปลอม)
            if (!priceW1) discountPctRows.push(dataRow);
          } else if (nextCol1 === '' && !priceW1 && discountPctRows.length > discountPriceRows.length) {
            // แถวว่างหลัง Discount = ราคาหลังหัก % ชั้นนั้น
            // เก็บเฉพาะก่อนเจอ Price : W1 และต้องมีค่าจริงๆ
            const hasValues = dataRow.some(v => v !== null && v !== undefined && v !== '');
            if (hasValues) discountPriceRows.push(dataRow);
          }

          nextBlockIndex++;
        }

        if (priceW1 && priceW2 && priceR1 && priceR2) {
          for (const [sku, skuName] of skusInBlock) {
            const brandCode = sku.substring(1, 3);
            const brandName = brandMap[brandCode] || 'ไม่ระบุ';

            for (const { colIdx, branchCode } of branchColumns) {
              const branch = branchCode;

              let basePrice = priceList ? parseFloat(priceList[colIdx]) || 0 : 0;
              if (basePrice === 0 && reExVat) basePrice = parseFloat(reExVat[colIdx]) || 0;

              const sellW1     = parseFloat(priceW1[colIdx]) || 0;
              const sellW2     = parseFloat(priceW2[colIdx]) || 0;
              const sellR1     = parseFloat(priceR1[colIdx]) || 0;
              const sellR2     = parseFloat(priceR2[colIdx]) || 0;

              // discount ทีละชั้น (สูงสุด 3 ชั้น)
              // discountPctRows[n]    = % ของชั้นนั้น
              // discountPriceRows[n]  = ราคาหลังหัก % ชั้นนั้น (row ว่างที่ตามหลัง Discount)
              // reExVat               = ราคาสุดท้ายหลังหักทุกชั้น
              const numDiscounts = discountPctRows.length; // จำนวนชั้น discount จริง

              // normalize % → ถ้าค่า > 1 แสดงว่า Excel เก็บเป็น % จริง (เช่น 4.6) ให้หาร 100
              // ถ้าค่า <= 1 แสดงว่าเป็น decimal แล้ว (เช่น 0.046) ใช้ตรงๆ
              const normPct = v => {
                const n = parseFloat(v) || 0;
                return n > 1 ? n / 100 : n;
              };
              const discPct1 = discountPctRows[0] ? normPct(discountPctRows[0][colIdx]) : 0;
              const discPct2 = discountPctRows[1] ? normPct(discountPctRows[1][colIdx]) : 0;
              const discPct3 = discountPctRows[2] ? normPct(discountPctRows[2][colIdx]) : 0;

              const reExVatVal = reExVat ? parseFloat(reExVat[colIdx]) || 0 : 0;

              let discPrice1 = 0, discPrice2 = 0, discPrice3 = 0;

              // helper: อ่านราคาจาก discountPriceRows[n] ถ้ามีค่า ไม่งั้น fallback
              const getDiscPrice = (rowArr, idx, fallback) => {
                if (!rowArr[idx]) return fallback;
                const v = parseFloat(rowArr[idx][colIdx]);
                return (v && !isNaN(v)) ? v : fallback;
              };

              if (numDiscounts === 0) {
                // ไม่มี discount → discount_price_1 = RE (ex VAT)
                discPrice1 = reExVatVal;
              } else if (numDiscounts === 1) {
                // 1 ชั้น: discount_price_1 = ราคาหลังหัก = RE (ex VAT)
                discPrice1 = getDiscPrice(discountPriceRows, 0, reExVatVal);
              } else if (numDiscounts === 2) {
                // 2 ชั้น: discount_price_1 = หลังชั้น 1, discount_price_2 = RE (ex VAT)
                const fallback1 = discPct1 > 0 ? Math.round(basePrice * (1 - discPct1) * 100) / 100 : reExVatVal;
                discPrice1 = getDiscPrice(discountPriceRows, 0, fallback1);
                discPrice2 = getDiscPrice(discountPriceRows, 1, reExVatVal);
              } else {
                // 3 ชั้น: discount_price_1 = หลังชั้น 1, discount_price_2 = หลังชั้น 2, discount_price_3 = RE (ex VAT)
                const fallback1 = discPct1 > 0 ? Math.round(basePrice * (1 - discPct1) * 100) / 100 : reExVatVal;
                discPrice1 = getDiscPrice(discountPriceRows, 0, fallback1);
                const fallback2 = discPct2 > 0 ? Math.round(discPrice1 * (1 - discPct2) * 100) / 100 : reExVatVal;
                discPrice2 = getDiscPrice(discountPriceRows, 1, fallback2);
                discPrice3 = getDiscPrice(discountPriceRows, 2, reExVatVal);
              }

              try {
                const req = pool.request()
                  .input("branch",           sql.NVarChar(100), branch)
                  .input("productType",      sql.NVarChar(100), "Gypsum")
                  .input("sku",              sql.NVarChar(50),  sku)
                  .input("productName",      sql.NVarChar(255), skuName)
                  .input("brand",            sql.NVarChar(100), brandName)
                  .input("unit",             sql.NVarChar(50),  "")
                  .input("basePrice",        sql.Decimal(18,2), basePrice)
                  .input("discountPrice1",   sql.Decimal(18,2), discPrice1)
                  .input("discountPrice2",   sql.Decimal(18,2), discPrice2)
                  .input("discountPrice3",   sql.Decimal(18,2), discPrice3)
                  .input("projectNo",        sql.NVarChar(50),  "")
                  .input("projectDiscount1", sql.Decimal(18,2), 0)
                  .input("projectDiscount2", sql.Decimal(18,2), 0)
                  .input("projectPrice",     sql.Decimal(18,2), 0)
                  .input("cartonPrice",      sql.Decimal(18,2), 0)
                  .input("shippingCost",     sql.Decimal(18,2), 0)
                  .input("freeItem",         sql.NVarChar(255), "")
                  .input("sellW1",           sql.Decimal(18,2), sellW1)
                  .input("sellW2",           sql.Decimal(18,2), sellW2)
                  .input("sellR1",           sql.Decimal(18,2), sellR1)
                  .input("sellR2",           sql.Decimal(18,2), sellR2);

                if (hasDiscPct) {
                  req.input("discPct1", sql.Decimal(10,6), discPct1)
                     .input("discPct2", sql.Decimal(10,6), discPct2)
                     .input("discPct3", sql.Decimal(10,6), discPct3);

                  if (hasDiscPct3) {
                    await req.query(`
                      INSERT INTO excel_import_data (
                        branch, product_type, sku, product_name, brand, unit,
                        base_price, discount_price_1, discount_price_2, discount_price_3,
                        project_no, project_discount_1, project_discount_2, project_price,
                        carton_price, shipping_cost, free_item,
                        selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2,
                        discount_pct_1, discount_pct_2, discount_pct_3
                      ) VALUES (
                        @branch, @productType, @sku, @productName, @brand, @unit,
                        @basePrice, @discountPrice1, @discountPrice2, @discountPrice3,
                        @projectNo, @projectDiscount1, @projectDiscount2, @projectPrice,
                        @cartonPrice, @shippingCost, @freeItem,
                        @sellW1, @sellW2, @sellR1, @sellR2,
                        @discPct1, @discPct2, @discPct3
                      )
                    `);
                  } else {
                    await req.query(`
                      INSERT INTO excel_import_data (
                        branch, product_type, sku, product_name, brand, unit,
                        base_price, discount_price_1, discount_price_2, discount_price_3,
                        project_no, project_discount_1, project_discount_2, project_price,
                        carton_price, shipping_cost, free_item,
                        selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2,
                        discount_pct_1, discount_pct_2
                      ) VALUES (
                        @branch, @productType, @sku, @productName, @brand, @unit,
                        @basePrice, @discountPrice1, @discountPrice2, @discountPrice3,
                        @projectNo, @projectDiscount1, @projectDiscount2, @projectPrice,
                        @cartonPrice, @shippingCost, @freeItem,
                        @sellW1, @sellW2, @sellR1, @sellR2,
                        @discPct1, @discPct2
                      )
                    `);
                  }
                } else {
                  await req.query(`
                    INSERT INTO excel_import_data (
                      branch, product_type, sku, product_name, brand, unit,
                      base_price, discount_price_1, discount_price_2, discount_price_3,
                      project_no, project_discount_1, project_discount_2, project_price,
                      carton_price, shipping_cost, free_item,
                      selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2
                    ) VALUES (
                      @branch, @productType, @sku, @productName, @brand, @unit,
                      @basePrice, @discountPrice1, @discountPrice2, @discountPrice3,
                      @projectNo, @projectDiscount1, @projectDiscount2, @projectPrice,
                      @cartonPrice, @shippingCost, @freeItem,
                      @sellW1, @sellW2, @sellR1, @sellR2
                    )
                  `);
                }
                imported++;
              } catch (err) {
                console.error(`[Gypsum Parser] Insert error (${branch}/${sku}):`, err.message);
              }
            }
            productCount++;
            console.log(`[Gypsum Parser] Product ${productCount}: ${skuName} (${sku}) → ${branches.length} rows`);
          }
        } else {
          console.warn(`[Gypsum Parser] Missing price rows for block ${primarySku} W1=${!!priceW1} W2=${!!priceW2} R1=${!!priceR1} R2=${!!priceR2}`);
        }

        i = nextBlockIndex;
      } else {
        i++;
      }
    }

    console.log(`[Gypsum Parser] Done: ${productCount} products, ${imported} rows inserted`);
    return imported;

  } catch (err) {
    console.error("[Gypsum Parser] Fatal error:", err);
    return 0;
  }
}

/**
 * =====================================================
 * Helper: Import Glass Data from Excel Buffer
 * Sheet: float
 * =====================================================
 *
 * Column mapping (float sheet):
 *   col0=SKU, col1=ชื่อ, col2=หนา, col3=หมายเหตุ
 *   RE per region:  BKK=5, N=6, NE=7, C=8, E=9, S=10
 *   W1/W2/R1/R2:   BKK=21-24, N=26-29, NE=31-34, C=36-39, E=41-44, S=46-49
 *
 * Region → branchCodes:
 *   BKK → 00TR,01TJ,02TN,03TS,04TP
 *   C   → 05AY,21BS,22BP,24TL,25SB,07RB
 *   N   → 11PL,12CM,17CR,23NS
 *   NE  → 08NR,09UB,10KK,18UD,20SK
 *   E   → 06RY,15CB
 *   S   → 13SR,14HY,16PK,19PC
 */
async function importGlassData(pool, excelBuffer, sheetName) {
  let imported = 0;

  try {
    console.log(`[Glass Parser] Starting import for sheet: ${sheetName}`);

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      console.error(`[Glass Parser] Sheet "${sheetName}" not found`);
      return 0;
    }

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log(`[Glass Parser] Raw rows: ${data.length}`);

    // Load brand mapping จาก BRAND_Glass (เหมือน Gypsum)
    const brandResult = await pool.request().query(`
      SELECT BRAND_NO, BRAND_NAME FROM BRAND_Glass
    `);
    const brandMap = {};
    brandResult.recordset.forEach(row => {
      brandMap[String(row.BRAND_NO).padStart(2, '0')] = row.BRAND_NAME;
    });
    console.log(`[Glass Parser] Brand map loaded: ${Object.keys(brandMap).length} brands`);

    // Region → branchCodes mapping
    const REGION_BRANCHES = {
      BKK: ['00TR','01TJ','02TN','03TS','04TP'],
      C:   ['05AY','21BS','22BP','24TL','25SB','07RB'],
      N:   ['11PL','12CM','17CR','23NS'],
      NE:  ['08NR','09UB','10KK','18UD','20SK'],
      E:   ['06RY','15CB'],
      S:   ['13SR','14HY','16PK','19PC'],
    };

    // branchCode → region (reverse map สำหรับ lookup ราคา)
    const BRANCH_REGION = {};
    for (const [region, branches] of Object.entries(REGION_BRANCHES)) {
      for (const b of branches) BRANCH_REGION[b] = region;
    }

    // float sheet column mapping per region
    // { region, reCol, w1Col, w2Col, r1Col, r2Col }
    const REGION_COLS = [
      { region: 'BKK', reCol:  5, w1Col: 21, w2Col: 22, r1Col: 23, r2Col: 24 },
      { region: 'N',   reCol:  6, w1Col: 26, w2Col: 27, r1Col: 28, r2Col: 29 },
      { region: 'NE',  reCol:  7, w1Col: 31, w2Col: 32, r1Col: 33, r2Col: 34 },
      { region: 'C',   reCol:  8, w1Col: 36, w2Col: 37, r1Col: 38, r2Col: 39 },
      { region: 'E',   reCol:  9, w1Col: 41, w2Col: 42, r1Col: 43, r2Col: 44 },
      { region: 'S',   reCol: 10, w1Col: 46, w2Col: 47, r1Col: 48, r2Col: 49 },
    ];
    // region → col map สำหรับ lookup ราคาจาก region
    const REGION_COL_MAP = {};
    for (const rc of REGION_COLS) REGION_COL_MAP[rc.region] = rc;

    // โหลด full SKU จาก StockStatusFact ล่วงหน้า จัดกลุ่มตาม prefix 12 หลัก
    console.log('[Glass Parser] Loading full SKUs from StockStatusFact via LIKE...');
    const stockResult = await pool.request().query(`
      SELECT DISTINCT skuNumber, branchCode, productName
      FROM StockStatusFact
      WHERE category = 'Glass' AND skuNumber LIKE 'G%'
        AND branchCode IN (
          '00TR','01TJ','02TN','03TS','04TP',
          '05AY','21BS','22BP','24TL','25SB','07RB',
          '11PL','12CM','17CR','23NS',
          '08NR','09UB','10KK','18UD','20SK',
          '06RY','15CB',
          '13SR','14HY','16PK','19PC'
        )
    `);
    // Map: prefix12 → [{skuNumber, branchCode, productName}]
    const skuByPrefix = new Map();
    for (const r of stockResult.recordset) {
      const prefix = r.skuNumber.substring(0, 12);
      if (!skuByPrefix.has(prefix)) skuByPrefix.set(prefix, []);
      skuByPrefix.get(prefix).push(r);
    }
    console.log(`[Glass Parser] Loaded ${stockResult.recordset.length} rows, ${skuByPrefix.size} prefixes`);

    // Check DB columns
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'excel_import_data'
    `);
    const dbCols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = dbCols.includes('selling_price_w1');

    const fv = v => parseFloat(v) || 0;

    // current brand/section name
    let currentBrand = '';
    let currentProductName = '';

    // เก็บ rows ทั้งหมดก่อน แล้วค่อย batch insert
    const insertRows = [];

    // parse rows
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
      const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
      const col2 = row[2];

      // Section header: col0 ว่าง, col1 = brand name, ไม่มีราคา
      if (!col0 && col1 && col1 !== 'undefined' && col1 !== 'CUT SIZE' &&
          !col1.startsWith('เจียร') && col1 !== 'ต่อเมตร' &&
          (row[21] === null || row[21] === undefined)) {
        currentBrand = col1;
        continue;
      }

      if (!col0 && (row[21] === null || row[21] === undefined)) continue;
      if (!col0 || !/^G\d/.test(col0)) continue;

      // col0 อาจมีหลาย SKU คั่นด้วย "/"
      const skuList = col0.split('/').map(s => s.trim()).filter(s => /^G\d/.test(s));

      const productName = col1 || currentProductName || currentBrand || 'Glass';
      if (col1) currentProductName = col1;
      const thickness = col2 !== undefined ? String(col2).trim() : '';
      const remark    = row[3] !== undefined ? String(row[3]).trim() : '';
      const fullName  = remark ? `${productName} ${remark} ${thickness}mm` : `${productName} ${thickness}mm`;

      for (const excelSku of skuList) {
        const brandCode = excelSku.substring(1, 3);
        const brandName = brandMap[brandCode] || currentBrand || 'ไม่ระบุ';

        const dbRows = skuByPrefix.get(excelSku) || [];

        if (dbRows.length === 0) {
          // ไม่มีใน StockStatusFact → เก็บ Excel SKU ตรงๆ + expand ตาม region
          for (const { region, reCol, w1Col, w2Col, r1Col, r2Col } of REGION_COLS) {
            const w1 = fv(row[w1Col]);
            if (w1 === 0) continue;
            for (const branchCode of REGION_BRANCHES[region]) {
              insertRows.push({
                branch: branchCode, sku: excelSku,
                productName: fullName, brand: brandName,
                basePrice: fv(row[reCol]),
                w1, w2: fv(row[w2Col]), r1: fv(row[r1Col]), r2: fv(row[r2Col])
              });
            }
          }
          continue;
        }

        // มีใน StockStatusFact → ใช้ full SKU 18 หลัก + branch จาก DB
        // ราคาดูจาก region ของ branch นั้น
        for (const { skuNumber: fullSku, branchCode, productName: dbName } of dbRows) {
          const region = BRANCH_REGION[branchCode];
          if (!region) continue;
          const rc = REGION_COL_MAP[region];
          if (!rc) continue;

          const w1 = fv(row[rc.w1Col]);
          if (w1 === 0) continue;

          insertRows.push({
            branch: branchCode, sku: fullSku,
            productName: dbName || fullName, brand: brandName,
            basePrice: fv(row[rc.reCol]),
            w1, w2: fv(row[rc.w2Col]), r1: fv(row[rc.r1Col]), r2: fv(row[rc.r2Col])
          });
        }
      }
    }

    console.log(`[Glass Parser] Prepared ${insertRows.length} rows, inserting in batches...`);

    // Batch insert 200 rows ต่อครั้ง
    const BATCH_SIZE = 200;
    const insertCols = hasSellingPrices
      ? `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item,
         selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2`
      : `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item`;

    for (let batchStart = 0; batchStart < insertRows.length; batchStart += BATCH_SIZE) {
      const batch = insertRows.slice(batchStart, batchStart + BATCH_SIZE);
      const req = pool.request();
      const valueParts = [];

      batch.forEach((r, idx) => {
        req.input(`branch${idx}`,      sql.NVarChar(100), r.branch);
        req.input(`sku${idx}`,         sql.NVarChar(50),  r.sku);
        req.input(`productName${idx}`, sql.NVarChar(255), r.productName);
        req.input(`brand${idx}`,       sql.NVarChar(100), r.brand);
        req.input(`basePrice${idx}`,   sql.Decimal(18,2), r.basePrice);
        req.input(`w1_${idx}`,         sql.Decimal(18,2), r.w1);
        req.input(`w2_${idx}`,         sql.Decimal(18,2), r.w2);
        req.input(`r1_${idx}`,         sql.Decimal(18,2), r.r1);
        req.input(`r2_${idx}`,         sql.Decimal(18,2), r.r2);

        if (hasSellingPrices) {
          valueParts.push(`(@branch${idx},'Glass',@sku${idx},@productName${idx},@brand${idx},'',@basePrice${idx},0,0,0,'',0,0,0,0,0,'',@w1_${idx},@w2_${idx},@r1_${idx},@r2_${idx})`);
        } else {
          valueParts.push(`(@branch${idx},'Glass',@sku${idx},@productName${idx},@brand${idx},'',@basePrice${idx},0,0,0,'',0,0,0,0,0,'')`);
        }
      });

      try {
        await req.query(`INSERT INTO excel_import_data (${insertCols}) VALUES ${valueParts.join(',')}`);
        imported += batch.length;
        console.log(`[Glass Parser] Inserted ${imported}/${insertRows.length}`);
      } catch (err) {
        console.error(`[Glass Parser] Batch insert error at ${batchStart}:`, err.message);
        // fallback: insert ทีละ row สำหรับ batch นี้
        for (const r of batch) {
          try {
            await pool.request()
              .input('branch',      sql.NVarChar(100), r.branch)
              .input('sku',         sql.NVarChar(50),  r.sku)
              .input('productName', sql.NVarChar(255), r.productName)
              .input('brand',       sql.NVarChar(100), r.brand)
              .input('basePrice',   sql.Decimal(18,2), r.basePrice)
              .input('w1',          sql.Decimal(18,2), r.w1)
              .input('w2',          sql.Decimal(18,2), r.w2)
              .input('r1',          sql.Decimal(18,2), r.r1)
              .input('r2',          sql.Decimal(18,2), r.r2)
              .query(hasSellingPrices ? `
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Glass',@sku,@productName,@brand,'',@basePrice,0,0,0,'',0,0,0,0,0,'',@w1,@w2,@r1,@r2)
              ` : `
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Glass',@sku,@productName,@brand,'',@basePrice,0,0,0,'',0,0,0,0,0,'')
              `);
            imported++;
          } catch (e2) {
            console.error(`[Glass Parser] Row insert error (${r.branch}/${r.sku}):`, e2.message);
          }
        }
      }
    }

    console.log(`[Glass Parser] Done: ${imported} rows inserted`);
    return imported;

  } catch (err) {
    console.error('[Glass Parser] Fatal error:', err);
    return 0;
  }
}

/**
 * =====================================================
 * GET /api/excel/data
 * Get imported data with filters
 * =====================================================
 */
export async function getImportData(req, res) {
  try {
    const pool = await getPool();
    const { productType, branch, sku, search, page = 1, limit = 50 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // WHERE clause สำหรับ filter — ใช้กับ CTE ด้านใน
    let whereParts = [];
    if (productType) whereParts.push("[product_type] = @productType");
    if (branch)      whereParts.push("[branch] = @branch");
    if (search)      whereParts.push("([sku] LIKE @search OR [product_name] LIKE @search OR [brand] LIKE @search)");
    else if (sku)    whereParts.push("[sku] LIKE @search");

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Check if selling_price and discount_pct columns exist
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');
    const hasDiscPct       = cols.includes('discount_pct_1');

    const sellingCols = hasSellingPrices ? `
        [selling_price_w1] AS [sellingPriceW1],
        [selling_price_w2] AS [sellingPriceW2],
        [selling_price_r1] AS [sellingPriceR1],
        [selling_price_r2] AS [sellingPriceR2],` : `
        NULL AS [sellingPriceW1], NULL AS [sellingPriceW2],
        NULL AS [sellingPriceR1], NULL AS [sellingPriceR2],`;

    const discPctCols = hasDiscPct ? `
        -- normalize: ถ้าค่า > 1 แสดงว่าเป็น % จริง (ข้อมูลเก่า) ให้หาร 100 ก่อนส่ง
        CASE WHEN [discount_pct_1] > 1 THEN [discount_pct_1] / 100.0 ELSE [discount_pct_1] END AS [discountPct1],
        CASE WHEN [discount_pct_2] > 1 THEN [discount_pct_2] / 100.0 ELSE [discount_pct_2] END AS [discountPct2],
        CASE WHEN [discount_pct_3] > 1 THEN [discount_pct_3] / 100.0 ELSE [discount_pct_3] END AS [discountPct3],` : `
        NULL AS [discountPct1], NULL AS [discountPct2], NULL AS [discountPct3],`;

    // CTE: เลือกเฉพาะ row ล่าสุดต่อ sku+branch+product_name ด้วย ROW_NUMBER()
    const latestCte = `
      WITH latest AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY [sku], [branch], [product_name]
            ORDER BY [created_at] DESC
          ) AS rn
        FROM [excel_import_data]
      )
      SELECT * FROM latest WHERE rn = 1
    `;

    // Count จาก latest rows เท่านั้น
    const countReq = pool.request();
    if (productType) countReq.input("productType", sql.NVarChar(100), productType);
    if (branch)      countReq.input("branch",      sql.NVarChar(100), branch);
    if (search || sku) countReq.input("search",    sql.NVarChar(255), `%${search || sku}%`);

    const countResult = await countReq.query(`
      WITH latest AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY [sku], [branch], [product_name] ORDER BY [created_at] DESC) AS rn
        FROM [excel_import_data]
      )
      SELECT COUNT(*) AS [total] FROM latest WHERE rn = 1 ${whereParts.length > 0 ? 'AND ' + whereParts.join(' AND ') : ''}
    `);
    const total = countResult.recordset[0].total;

    // Get data — latest per sku+branch+product_name only
    const dataReq = pool.request();
    if (productType) dataReq.input("productType", sql.NVarChar(100), productType);
    if (branch)      dataReq.input("branch",      sql.NVarChar(100), branch);
    if (search || sku) dataReq.input("search",    sql.NVarChar(255), `%${search || sku}%`);
    dataReq.input("limit",  sql.Int, parseInt(limit));
    dataReq.input("offset", sql.Int, offset);

    const result = await dataReq.query(`
      WITH latest AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY [sku], [branch], [product_name] ORDER BY [created_at] DESC) AS rn
        FROM [excel_import_data]
      )
      SELECT
        [id], [branch], [product_type] AS [productType],
        [sku], [product_name] AS [productName], [brand], [unit],
        [base_price]       AS [basePrice],
        [discount_price_1] AS [discountPrice1],
        [discount_price_2] AS [discountPrice2],
        [discount_price_3] AS [discountPrice3],
        ${discPctCols}
        ${sellingCols}
        [created_at] AS [createdAt]
      FROM latest
      WHERE rn = 1 ${whereParts.length > 0 ? 'AND ' + whereParts.join(' AND ') : ''}
      ORDER BY [product_type], [sku], [branch]
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    res.json({
      data: result.recordset,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });

  } catch (err) {
    console.error("getImportData error:", err);
    res.status(500).json({ message: "Failed to fetch data", error: err.message });
  }
}
/**
 * =====================================================
 * PUT /api/excel/data/:id
 * Update price fields for a single record
 * =====================================================
 */
export async function updateImportData(req, res) {
  try {
    const { id } = req.params;
    const {
      base_price, discount_price_1, discount_price_2, discount_price_3,
      selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2
    } = req.body;

    const pool = await getPool();

    // Check which selling_price columns exist
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');

    const req2 = pool.request().input("id", sql.Int, parseInt(id));
    let setCols = [];

    if (base_price       !== undefined) { req2.input("basePrice",      sql.Decimal(18,2), parseFloat(base_price)       || 0); setCols.push("[base_price] = @basePrice"); }
    if (discount_price_1 !== undefined) { req2.input("discountPrice1", sql.Decimal(18,2), parseFloat(discount_price_1) || 0); setCols.push("[discount_price_1] = @discountPrice1"); }
    if (discount_price_2 !== undefined) { req2.input("discountPrice2", sql.Decimal(18,2), parseFloat(discount_price_2) || 0); setCols.push("[discount_price_2] = @discountPrice2"); }
    if (discount_price_3 !== undefined) { req2.input("discountPrice3", sql.Decimal(18,2), parseFloat(discount_price_3) || 0); setCols.push("[discount_price_3] = @discountPrice3"); }

    if (hasSellingPrices) {
      if (selling_price_w1 !== undefined) { req2.input("sellW1", sql.Decimal(18,2), parseFloat(selling_price_w1) || 0); setCols.push("[selling_price_w1] = @sellW1"); }
      if (selling_price_w2 !== undefined) { req2.input("sellW2", sql.Decimal(18,2), parseFloat(selling_price_w2) || 0); setCols.push("[selling_price_w2] = @sellW2"); }
      if (selling_price_r1 !== undefined) { req2.input("sellR1", sql.Decimal(18,2), parseFloat(selling_price_r1) || 0); setCols.push("[selling_price_r1] = @sellR1"); }
      if (selling_price_r2 !== undefined) { req2.input("sellR2", sql.Decimal(18,2), parseFloat(selling_price_r2) || 0); setCols.push("[selling_price_r2] = @sellR2"); }
    }

    if (setCols.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    setCols.push("[updated_at] = GETDATE()");

    await req2.query(`
      UPDATE [excel_import_data]
      SET ${setCols.join(", ")}
      WHERE [id] = @id
    `);

    res.json({ success: true, message: "อัปเดตราคาสำเร็จ" });

  } catch (err) {
    console.error("updateImportData error:", err);
    res.status(500).json({ message: "Failed to update", error: err.message });
  }
}

export async function getImportLogs(req, res) {
  try {
    const pool = await getPool();

    // Check which columns exist
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'excel_import_logs'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());

    let result;

    if (cols.includes('product_type') && cols.includes('imported_rows') && cols.includes('status')) {
      // New schema
      result = await pool.request().query(`
        SELECT 
          [id],
          [sheet_name]    AS [sheetName],
          [product_type]  AS [productType],
          [row_count]     AS [rowCount],
          [imported_rows] AS [importedRows],
          [status]        AS [status],
          [error_message] AS [errorMessage],
          [imported_at]   AS [importedAt]
        FROM excel_import_logs
        ORDER BY [imported_at] DESC
      `);
    } else {
      // Old schema - only original columns
      result = await pool.request().query(`
        SELECT 
          [id],
          [sheet_name]  AS [sheetName],
          NULL          AS [productType],
          [row_count]   AS [rowCount],
          NULL          AS [importedRows],
          'success'     AS [status],
          NULL          AS [errorMessage],
          [imported_at] AS [importedAt]
        FROM excel_import_logs
        ORDER BY [imported_at] DESC
      `);
    }

    res.json(result.recordset);

  } catch (err) {
    console.error("getImportLogs error:", err);
    res.status(500).json({ message: "Failed to fetch import logs", error: err.message });
  }
}

/**
 * =====================================================
 * POST /api/excel/preview
 * Preview data that will be imported (without saving)
 * =====================================================
 */
export async function previewExcelData(req, res) {
  try {
    const { sheetName, productType, excelBuffer } = req.body;

    if (!sheetName || !excelBuffer) {
      return res.status(400).json({ 
        message: "Invalid data: sheetName and excelBuffer are required" 
      });
    }

    // ถ้า user เลือก tab มาแล้ว (productType มีค่า) ให้ใช้ค่านั้นตรงๆ
    // auto-detect จาก sheet name เฉพาะเมื่อไม่มี productType เท่านั้น
    let detectedType = productType;
    if (!detectedType) {
      const sheetLower = sheetName.toLowerCase();
      if (sheetLower.includes('gypsum') || sheetLower.includes('ยิปซั่ม') || sheetLower.includes('y1') || sheetLower.includes('sb')) {
        detectedType = 'Gypsum';
      } else if (sheetLower.includes('glass') || sheetLower.includes('กระจก') ||
                 sheetLower === 'float' || sheetLower === 'coated' ||
                 sheetLower === 't&l' || sheetLower === 'igu') {
        detectedType = 'Glass';
      } else if (sheetLower === 'acc' || sheetLower.includes('accessories') || sheetLower.includes('อุปกรณ์')) {
        detectedType = 'Accessories';
      }
    }

    console.log(`[Preview] Detected product type: ${detectedType} (from sheet: ${sheetName})`);

    let previewData = [];

    try {
      if (detectedType === "Gypsum") {
        const bufferData = Buffer.from(excelBuffer, 'base64');
        previewData = await previewGypsumData(bufferData, sheetName);
      } else if (detectedType === "Glass") {
        const bufferData = Buffer.from(excelBuffer, 'base64');
        previewData = await previewGlassData(bufferData, sheetName);
      } else if (detectedType === "Accessories") {
        const bufferData = Buffer.from(excelBuffer, 'base64');
        previewData = await previewAccessoriesData(bufferData, sheetName);
      }
    } catch (err) {
      console.error("Preview error:", err);
      return res.status(500).json({ 
        message: "Failed to preview data",
        error: err.message 
      });
    }

    res.json({ 
      success: true,
      detectedType,
      totalSkus:  previewData.totalSkus  || 0,
      totalRows:  previewData.totalRows  || 0,
      branches:   previewData.branches   || [],
      preview:    (previewData.rows || []).slice(0, 15)
    });

  } catch (err) {
    console.error("previewExcelData error:", err);
    res.status(500).json({ 
      message: "Failed to preview data",
      error: err.message 
    });
  }
}

/**
 * =====================================================
 * Helper: Preview Gypsum Data
 * =====================================================
 */
async function previewGypsumData(excelBuffer, sheetName) {
  const PRICE_LABELS = new Set(['Price List','Discount','RE (ex VAT)','VAT','Net Price (inc VAT)',
    'Transportation','COGS','Promotion Rebate','Net Cost',
    'Price : W1','Price : W2','Price : R1','Price : R2',
    'MG/Bht : W1','MG/Bht : W2','MG/Bht : R1','MG/Bht : R2',
    'MG/% : W1','MG/% : W2','MG/% : R1','MG/% : R2']);

  try {
    const pool = await getPool();
    const brandResult = await pool.request().query(`SELECT BRAND_NO, BRAND_NAME FROM BRAND_Gypsum`);
    const brandMap = {};
    brandResult.recordset.forEach(row => {
      brandMap[String(row.BRAND_NO).padStart(2, '0')] = row.BRAND_NAME;
    });

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    let worksheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // อ่าน Sheet1 SKU lookup
    const skuLookup = {};
    const sheet1 = workbook.Sheets['Sheet1'];
    if (sheet1) {
      const s1Data = XLSX.utils.sheet_to_json(sheet1, { header: 1 });
      const s1Headers = s1Data[0] || [];
      s1Headers.forEach((h, colIdx) => {
        if (!h) return;
        const name = String(h).trim();
        const skus = [];
        for (let row = 1; row < s1Data.length; row++) {
          const val = s1Data[row]?.[colIdx];
          if (val && String(val).trim()) skus.push(String(val).trim());
        }
        if (skus.length > 0) skuLookup[name] = skus;
      });
    }

    // Zone → branchCodes mapping (เหมือน import function)
    const ZONE_TO_BRANCHES = {
      'BKK': ['00TR','01TJ','02TN','03TS','04TP'],
      'C':   ['05AY','21BS','22BP','24TL','25SB','07RB'],
      'N':   ['11PL','12CM','17CR','23NS'],
      'NE':  ['08NR','09UB','10KK','18UD','20SK'],
      'E':   ['06RY','15CB'],
      'S':   ['13SR','14HY','16PK','19PC'],
    };

    const branchColumns = []; // { colIdx, branchCode }[]
    const branches = [];      // header ดิบ (ใช้ตรวจ Format C)

    // Auto-detect branch header row (เหมือน import function)
    const ALL_ZONE_KEYS_P = new Set(Object.keys(ZONE_TO_BRANCHES));
    const BRANCH_CODE_RE_P = /^\d{2}[A-Z]{2}$/;
    let branchHeaderRowIdx = -1;
    let branchStartCol = 2;
    for (let ri = 0; ri <= Math.min(5, rawData.length - 1); ri++) {
      const row = rawData[ri];
      if (!row) continue;
      let matchCount = 0;
      let firstMatchCol = -1;
      for (let col = 2; col < row.length; col++) {
        const v = row[col];
        if (!v || typeof v !== 'string') continue;
        const h = v.trim();
        if (ALL_ZONE_KEYS_P.has(h) || BRANCH_CODE_RE_P.test(h)) {
          matchCount++;
          if (firstMatchCol === -1) firstMatchCol = col;
        }
      }
      if (matchCount >= 2) { branchHeaderRowIdx = ri; branchStartCol = firstMatchCol; break; }
    }
    if (branchHeaderRowIdx === -1) return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };

    const branchHeaderRow = rawData[branchHeaderRowIdx];
    for (let col = branchStartCol; col < branchHeaderRow.length; col++) {
      const header = branchHeaderRow[col];
      if (!header || typeof header !== 'string' || !header.trim()) continue;
      const h = header.trim();
      branches.push(h);
      if (ZONE_TO_BRANCHES[h]) {
        for (const branchCode of ZONE_TO_BRANCHES[h]) {
          branchColumns.push({ colIdx: col, branchCode });
        }
      } else {
        branchColumns.push({ colIdx: col, branchCode: h });
      }
    }
    const dataStartRowP = branchHeaderRowIdx + 1;

    const uniqueBranchCodes = [...new Set(branchColumns.map(b => b.branchCode))];

    const previewRows = []; // แถวตัวอย่าง (สาขาแรกของแต่ละ SKU)
    let totalSkus = 0;
    let totalRows = 0;
    let i = dataStartRowP;

    while (i < rawData.length) {
      const row = rawData[i];
      if (!row) { i++; continue; }

      const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
      const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
      const col2 = row[2] !== undefined ? String(row[2]).trim() : '';
      const isPriceLabel = PRICE_LABELS.has(col1);

      const isBlockHeader = /^Y\d/.test(col0) && (
        !isPriceLabel || col1 === 'Price List' || col2 === 'Price List'
      );

      if (isBlockHeader) {
        const primarySku = col0;
        let productName = 'Unknown';
        let priceListRowIndex = -1;

        if (col2 === 'Price List') {
          // Format A: col0=SKU, col1=ProductName, col2="Price List"
          productName = col1 || ('Product ' + primarySku);
          priceListRowIndex = i;
        } else if (col1 === 'Price List') {
          // Format B: col0=SKU, col1="Price List"
          productName = 'Product ' + primarySku;
          priceListRowIndex = i;
        } else if (col1 && branches.length > 0 && row[branchStartCol] !== undefined && String(row[branchStartCol]).trim() === branches[0]) {
          // Format C: col0=SKU, col1=ProductName, branchStartCol=ชื่อสาขาแรก
          productName = col1;
          for (let k = i + 1; k < Math.min(i + 5, rawData.length); k++) {
            const nr = rawData[k];
            if (!nr) continue;
            const nl1 = nr[1] !== undefined ? String(nr[1]).trim() : '';
            const nl2 = nr[2] !== undefined ? String(nr[2]).trim() : '';
            if (nl1 === 'Price List' || nl2 === 'Price List') {
              priceListRowIndex = k; break;
            }
          }
          if (priceListRowIndex === -1) { i++; continue; }
        } else { i++; continue; }

        const skusInBlock = new Map();

        if (skuLookup[productName] && skuLookup[productName].length > 0) {
          // ใช้ Sheet1 lookup เท่านั้น
          skuLookup[productName].forEach(sku => skusInBlock.set(sku, productName));
        } else {
          // ยังไม่มีใน Sheet1 → skip
          i++;
          continue;
        }

        const priceList = rawData[priceListRowIndex];
        let reExVat = null, priceW1 = null, priceW2 = null, priceR1 = null, priceR2 = null;
        // ใช้ logic เดียวกับ importGypsumDataFromBuffer — รองรับ discount สูงสุด 3 ชั้น
        const discountPctRows  = []; // [row1%, row2%, row3%]
        const discountPriceRows = []; // [rowAfter1, rowAfter2, rowAfter3]

        // Scan แถวระหว่าง block header กับ priceListRowIndex (discount ที่อยู่ก่อน Price List)
        for (let k = i + 1; k < priceListRowIndex; k++) {
          const dr = rawData[k];
          if (!dr) continue;
          const nc1 = dr[1] !== undefined ? String(dr[1]).trim() : '';
          if (nc1 === 'Discount') {
            discountPctRows.push(dr);
          } else if (nc1 === '' && discountPctRows.length > discountPriceRows.length) {
            discountPriceRows.push(dr);
          }
        }

        let nextBlockIndex = priceListRowIndex + 1;
        while (nextBlockIndex < rawData.length) {
          const dr = rawData[nextBlockIndex];
          if (!dr) { nextBlockIndex++; continue; }
          const nc0 = dr[0] !== undefined ? String(dr[0]).trim() : '';
          const nc1 = dr[1] !== undefined ? String(dr[1]).trim() : '';
          const nextIsPriceLabel = PRICE_LABELS.has(nc1);

          if (/^Y\d/.test(nc0) && !nextIsPriceLabel && nc1 !== '') break;

          if (nc1 === 'RE (ex VAT)')         reExVat = dr;
          else if (nc1 === 'Price : W1')     priceW1 = dr;
          else if (nc1 === 'Price : W2')     priceW2 = dr;
          else if (nc1 === 'Price : R1')     priceR1 = dr;
          else if (nc1 === 'Price : R2')     priceR2 = dr;
          else if (nc1 === 'Discount') {
            // หยุดเก็บ discount หลังจากเจอ Price : W1 แล้ว (ป้องกัน discount ปลอม)
            if (!priceW1) discountPctRows.push(dr);
          } else if (nc1 === '' && !priceW1 && discountPctRows.length > discountPriceRows.length) {
            const hasValues = dr.some(v => v !== null && v !== undefined && v !== '');
            if (hasValues) discountPriceRows.push(dr);
          }

          nextBlockIndex++;
        }

        if (priceW1 && priceW2 && priceR1 && priceR2) {
          totalSkus += skusInBlock.size;
          totalRows += skusInBlock.size * branchColumns.length;

          // สร้างแถว preview สำหรับแต่ละ SKU (ใช้ branchColumn แรกเป็นตัวอย่าง)
          for (const [sku, skuName] of skusInBlock) {
            const brandCode = sku.substring(1, 3);
            const brandName = brandMap[brandCode] || 'ไม่ระบุ';
            const { colIdx, branchCode: firstBranch } = branchColumns[0];

            let basePrice = priceList ? parseFloat(priceList[colIdx]) || 0 : 0;
            if (basePrice === 0 && reExVat) basePrice = parseFloat(reExVat[colIdx]) || 0;

            const numDiscounts = discountPctRows.length;
            // normalize % → ถ้าค่า > 1 แสดงว่า Excel เก็บเป็น % จริง (เช่น 4.6) ให้หาร 100
            const normPct = v => { const n = parseFloat(v) || 0; return n > 1 ? n / 100 : n; };
            const discPct1 = discountPctRows[0] ? normPct(discountPctRows[0][colIdx]) : 0;
            const discPct2 = discountPctRows[1] ? normPct(discountPctRows[1][colIdx]) : 0;
            const discPct3 = discountPctRows[2] ? normPct(discountPctRows[2][colIdx]) : 0;
            const reExVatVal = reExVat ? parseFloat(reExVat[colIdx]) || 0 : 0;

            const getDiscPrice = (rowArr, idx, fallback) => {
              if (!rowArr[idx]) return fallback;
              const v = parseFloat(rowArr[idx][colIdx]);
              return (v && !isNaN(v)) ? v : fallback;
            };

            let discPrice1 = 0, discPrice2 = 0, discPrice3 = 0;
            if (numDiscounts === 0) {
              discPrice1 = reExVatVal;
            } else if (numDiscounts === 1) {
              discPrice1 = getDiscPrice(discountPriceRows, 0, reExVatVal);
            } else if (numDiscounts === 2) {
              const fallback1 = discPct1 > 0 ? Math.round(basePrice * (1 - discPct1) * 100) / 100 : reExVatVal;
              discPrice1 = getDiscPrice(discountPriceRows, 0, fallback1);
              discPrice2 = getDiscPrice(discountPriceRows, 1, reExVatVal);
            } else {
              const fallback1 = discPct1 > 0 ? Math.round(basePrice * (1 - discPct1) * 100) / 100 : reExVatVal;
              discPrice1 = getDiscPrice(discountPriceRows, 0, fallback1);
              const fallback2 = discPct2 > 0 ? Math.round(discPrice1 * (1 - discPct2) * 100) / 100 : reExVatVal;
              discPrice2 = getDiscPrice(discountPriceRows, 1, fallback2);
              discPrice3 = getDiscPrice(discountPriceRows, 2, reExVatVal);
            }

            previewRows.push({
              sku,
              productName: skuName,
              brand: brandName,
              branch: firstBranch,                    // ตัวอย่างสาขาแรก
              totalBranches: branchColumns.length,    // จำนวน branchCode จริงทั้งหมด
              numDiscounts,
              // คอลัมน์ที่จะเก็บ
              base_price:         basePrice,
              discount_pct_1:     discPct1,
              discount_pct_2:     discPct2,
              discount_pct_3:     discPct3,
              discount_price_1:   discPrice1,
              discount_price_2:   discPrice2,
              discount_price_3:   discPrice3,
              selling_price_w1:   parseFloat(priceW1[colIdx]) || 0,
              selling_price_w2:   parseFloat(priceW2[colIdx]) || 0,
              selling_price_r1:   parseFloat(priceR1[colIdx]) || 0,
              selling_price_r2:   parseFloat(priceR2[colIdx]) || 0,
              carton_price:       0,
              shipping_cost:      0,
              free_item:          '',
            });
          }
        }

        i = nextBlockIndex;
      } else {
        i++;
      }
    }

    return { rows: previewRows, totalSkus, totalRows, branches: uniqueBranchCodes };

  } catch (err) {
    console.error("[Preview] Fatal error:", err);
    return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
  }
}

/**
 * =====================================================
 * Helper: Preview Glass Data (float sheet)
 * =====================================================
 */
async function previewGlassData(excelBuffer, sheetName) {
  try {
    const pool = await getPool();

    // Brand map
    const brandResult = await pool.request().query(`SELECT BRAND_NO, BRAND_NAME FROM BRAND_Glass`);
    const brandMap = {};
    brandResult.recordset.forEach(r => { brandMap[String(r.BRAND_NO).padStart(2,'0')] = r.BRAND_NAME; });

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Region → branchCodes
    const REGION_BRANCHES = {
      BKK: ['00TR','01TJ','02TN','03TS','04TP'],
      C:   ['05AY','21BS','22BP','24TL','25SB','07RB'],
      N:   ['11PL','12CM','17CR','23NS'],
      NE:  ['08NR','09UB','10KK','18UD','20SK'],
      E:   ['06RY','15CB'],
      S:   ['13SR','14HY','16PK','19PC'],
    };
    const REGION_COLS = [
      { region:'BKK', reCol:5,  w1Col:21, w2Col:22, r1Col:23, r2Col:24 },
      { region:'N',   reCol:6,  w1Col:26, w2Col:27, r1Col:28, r2Col:29 },
      { region:'NE',  reCol:7,  w1Col:31, w2Col:32, r1Col:33, r2Col:34 },
      { region:'C',   reCol:8,  w1Col:36, w2Col:37, r1Col:38, r2Col:39 },
      { region:'E',   reCol:9,  w1Col:41, w2Col:42, r1Col:43, r2Col:44 },
      { region:'S',   reCol:10, w1Col:46, w2Col:47, r1Col:48, r2Col:49 },
    ];

    // Load StockStatusFact prefix map
    const stockResult = await pool.request().query(`
      SELECT DISTINCT skuNumber, branchCode FROM StockStatusFact
      WHERE category = 'Glass' AND skuNumber LIKE 'G%'
        AND branchCode IN ('00TR','01TJ','02TN','03TS','04TP','05AY','21BS','22BP','24TL','25SB','07RB',
          '11PL','12CM','17CR','23NS','08NR','09UB','10KK','18UD','20SK','06RY','15CB','13SR','14HY','16PK','19PC')
    `);
    const skuByPrefix = new Map();
    for (const r of stockResult.recordset) {
      const prefix = r.skuNumber.substring(0, 12);
      if (!skuByPrefix.has(prefix)) skuByPrefix.set(prefix, new Set());
      skuByPrefix.get(prefix).add(r.branchCode);
    }

    const fv = v => parseFloat(v) || 0;
    const allBranches = Object.values(REGION_BRANCHES).flat();

    let currentBrand = '', currentProductName = '';
    const previewRows = [];
    let totalSkus = 0, totalRows = 0;

    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      const col0 = String(row[0] ?? '').trim();
      const col1 = String(row[1] ?? '').trim();
      const col2 = row[2];

      // Section header
      if (!col0 && col1 && col1 !== 'undefined' && col1 !== 'CUT SIZE' &&
          !col1.startsWith('เจียร') && col1 !== 'ต่อเมตร' &&
          (row[21] === null || row[21] === undefined)) {
        currentBrand = col1; currentProductName = ''; continue;
      }
      if (!col0 && (row[21] === null || row[21] === undefined)) continue;
      if (!col0 || !/^G\d/.test(col0)) continue;

      const skuList = col0.split('/').map(s => s.trim()).filter(s => /^G\d/.test(s));
      const productName = col1 || currentProductName || currentBrand || 'Glass';
      if (col1) currentProductName = col1;
      const thickness = col2 !== undefined ? String(col2).trim() : '';
      const remark    = row[3] !== undefined ? String(row[3]).trim() : '';
      const fullName  = remark ? `${productName} ${remark} ${thickness}mm` : `${productName} ${thickness}mm`;

      for (const excelSku of skuList) {
        const brandCode = excelSku.substring(1, 3);
        const brandName = brandMap[brandCode] || currentBrand || 'ไม่ระบุ';

        // นับ branches จาก StockStatusFact หรือ fallback 26
        const dbBranches = skuByPrefix.get(excelSku);
        const branchCount = dbBranches ? dbBranches.size : allBranches.length;

        // นับ full SKUs
        const fullSkuCount = dbBranches
          ? new Set([...skuByPrefix.entries()]
              .filter(([k]) => k === excelSku)
              .flatMap(([,v]) => [...v])).size
          : 1;

        // ราคาตัวอย่าง BKK (col 21-24)
        const re_bkk = fv(row[5]);
        const w1_bkk = fv(row[21]);
        const w2_bkk = fv(row[22]);
        const r1_bkk = fv(row[23]);
        const r2_bkk = fv(row[24]);

        if (w1_bkk === 0) continue;

        totalSkus++;
        totalRows += branchCount;

        if (previewRows.length < 15) {
          previewRows.push({
            sku: excelSku,
            productName: fullName,
            brand: brandName,
            branch: '00TR',           // ตัวอย่างสาขาแรก (BKK)
            totalBranches: branchCount,
            base_price:       re_bkk,
            selling_price_w1: w1_bkk,
            selling_price_w2: w2_bkk,
            selling_price_r1: r1_bkk,
            selling_price_r2: r2_bkk,
            discount_pct_1: 0,
            discount_pct_2: 0,
            discount_price_1: 0,
            discount_price_2: 0,
          });
        }
      }
    }

    return { rows: previewRows, totalSkus, totalRows, branches: allBranches };

  } catch (err) {
    console.error('[Glass Preview] Fatal error:', err);
    return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
  }
}

/**
 * =====================================================
 * POST /api/excel/debug-acc
 * Debug: ดู raw rows ของ ACC Excel เพื่อตรวจสอบ format
 * =====================================================
 */
export async function debugAccExcel(req, res) {
  try {
    const { sheetName, excelBuffer } = req.body;
    if (!excelBuffer) return res.status(400).json({ message: 'excelBuffer required' });

    const bufferData = Buffer.from(excelBuffer, 'base64');
    const workbook = XLSX.read(bufferData, { type: 'buffer' });

    const targetSheet = sheetName
      ? (workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]])
      : workbook.Sheets[workbook.SheetNames[0]];

    const data = XLSX.utils.sheet_to_json(targetSheet, { header: 1 });

    // ส่ง 30 rows แรกกลับมาพร้อม index
    const sample = data.slice(0, 30).map((row, i) => ({
      rowIndex: i,
      cols: (row || []).slice(0, 10).map((v, ci) => ({ col: ci, val: v }))
    }));

    // ลอง parse ด้วย parseAccRows และส่งผลกลับ
    const parsed = parseAccRows(data);

    res.json({
      sheetNames: workbook.SheetNames,
      totalRows: data.length,
      sample,
      parsedCount: parsed.length,
      parsedSample: parsed.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

/**
 * =====================================================
 * Helper: Parse ACC Excel rows (shared logic)
 * =====================================================
 *
 * ACC file structure (Internal Memo format):
 *   Row 0-5 : header/memo rows (skip)
 *   Row 6   : column headers  (sup, รหัส, รายการ, สี, บรรจุ/มาตรหน่วย, ราคาตั้ง, RE ก่อน VAT, ชุน รวม VAT)
 *   Row 7   : sub-header row  (skip)
 *   Row 8+  : data rows
 *
 * Column index (0-based):
 *   col 0 = supplier name
 *   col 1 = SKU (รหัส) — starts with E, or section header if col 1 empty & col 2 has text
 *   col 2 = product name (รายการ)
 *   col 3 = color (สี)
 *   col 4 = unit/pack (บรรจุ/มาตรหน่วย)
 *   col 5 = base price (ราคาตั้ง)
 *   col 6 = RE before VAT
 *   col 7 = selling price incl. VAT (ชุน รวม VAT)
 *
 * Section headers: rows where col 1 is empty and col 2 has a group name
 * =====================================================
 */
function parseAccRows(data) {
  const fv = v => parseFloat(v) || 0;
  const rows = [];
  let currentSection = '';

  // Auto-detect header row: หา row ที่มี "รหัส" หรือ "SKU" ใน col 1
  // แล้วเริ่ม parse จาก row ถัดไป
  let dataStartRow = 8; // default
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const c1 = String(row[1] ?? '').trim().toLowerCase();
    const c2 = String(row[2] ?? '').trim().toLowerCase();
    if (c1 === 'รหัส' || c1 === 'sku' || c2 === 'รายการ') {
      dataStartRow = i + 1; // เริ่มหลัง header row
      break;
    }
  }

  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
    const col2 = row[2] !== undefined ? String(row[2]).trim() : '';
    const col3 = row[3] !== undefined ? String(row[3]).trim() : '';
    const col4 = row[4] !== undefined ? String(row[4]).trim() : '';
    const col5 = row[5];
    const col6 = row[6];
    const col7 = row[7];

    // Section header: col1 ว่าง, col2 มีข้อความ, ไม่มีราคา
    if (!col1 && col2 && fv(col5) === 0 && fv(col6) === 0 && fv(col7) === 0) {
      if (col2 !== 'รายการ' && col2 !== 'sup' && col2 !== 'รหัส') {
        currentSection = col2;
      }
      continue;
    }

    // ต้องมี col1 และมีค่าที่ดูเหมือน SKU (ตัวอักษร+ตัวเลข ยาวพอสมควร)
    // รองรับทั้ง E-prefix และ format อื่นๆ ที่อาจมี
    if (!col1) continue;

    // กรอง header/label rows ออก
    const lowerCol1 = col1.toLowerCase();
    if (lowerCol1 === 'รหัส' || lowerCol1 === 'sku' || lowerCol1 === 'sup' ||
        lowerCol1 === 'รายการ' || lowerCol1 === 'สี') continue;

    // col1 อาจมีหลาย SKU คั่นด้วย newline, comma, หรือ /
    const rawSkus = col1.split(/[\n,\/]/).map(s => s.trim()).filter(s => s.length > 0);
    if (rawSkus.length === 0) continue;

    const productName = col2 || currentSection || 'Accessories';
    const color       = col3;
    const unit        = col4;
    const basePrice   = fv(col5);
    const reBeforeVat = fv(col6);
    const sellingPrice = fv(col7);

    // ข้ามแถวที่ไม่มีราคาเลย
    if (basePrice === 0 && reBeforeVat === 0 && sellingPrice === 0) continue;

    for (const sku of rawSkus) {
      if (!sku) continue;
      rows.push({
        sku,
        productName: color ? `${productName} ${color}`.trim() : productName,
        section: currentSection,
        unit,
        basePrice,
        reBeforeVat,
        sellingPrice,
      });
    }
  }

  return rows;
}

/**
 * =====================================================
 * Helper: Import Accessories (ACC) Data from Excel Buffer
 * =====================================================
 * ACC ไม่แยก region — ราคาเดียวใช้ทุกสาขา
 * ดึง full SKU + branchCode จาก StockStatusFact (category='Accessories', SKU LIKE 'E%')
 * ถ้าไม่มีใน StockStatusFact → insert ด้วย Excel SKU + branch='ALL'
 */
async function importAccessoriesData(pool, excelBuffer, sheetName) {
  let imported = 0;

  try {
    console.log(`[ACC Parser] Starting import for sheet: ${sheetName}`);

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) {
      console.error(`[ACC Parser] Sheet "${sheetName}" not found`);
      return 0;
    }

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log(`[ACC Parser] Raw rows: ${data.length}`);

    // Load brand mapping from Accessory_BRAND
    // Load brand mapping from Accessory_BRAND
    let brandMap = {};
    try {
      const brandResult = await pool.request().query(`SELECT BRAND_NO, BRAND_NAME FROM Accessory_BRAND`);
      brandResult.recordset.forEach(r => {
        brandMap[String(r.BRAND_NO).padStart(2, '0')] = r.BRAND_NAME;
      });
      console.log(`[ACC Parser] Brand map loaded: ${Object.keys(brandMap).length} brands`);
    } catch (e) {
      console.warn(`[ACC Parser] Could not load Accessory_BRAND: ${e.message}`);
    }

    // Check DB columns
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'excel_import_data'
    `);
    const dbCols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = dbCols.includes('selling_price_w1');

    // Parse Excel rows — ใช้ SKU จาก Excel ตรงๆ
    const parsedRows = parseAccRows(data);
    console.log(`[ACC Parser] Parsed ${parsedRows.length} product rows`);

    // Build insert rows — 1 row ต่อ SKU, branch='ALL'
    const insertRows = parsedRows.map(pr => ({
      branch: 'ALL',
      sku: pr.sku,
      productName: pr.productName,
      brand: brandMap[pr.sku.substring(1, 3)] || '',
      unit: pr.unit,
      basePrice: pr.basePrice,
      reBeforeVat: pr.reBeforeVat,
      sellingPrice: pr.sellingPrice,
    }));

    console.log(`[ACC Parser] Prepared ${insertRows.length} rows, inserting in batches...`);

    // Batch insert 200 rows
    const BATCH_SIZE = 200;

    // selling_price_w1 ใช้เก็บ RE before VAT, selling_price_r1 ใช้เก็บ selling price incl. VAT
    // (ใช้ field ที่มีอยู่แล้วในตาราง)
    for (let batchStart = 0; batchStart < insertRows.length; batchStart += BATCH_SIZE) {
      const batch = insertRows.slice(batchStart, batchStart + BATCH_SIZE);
      const req = pool.request();
      const valueParts = [];

      batch.forEach((r, idx) => {
        req.input(`branch${idx}`,      sql.NVarChar(100), r.branch);
        req.input(`sku${idx}`,         sql.NVarChar(50),  r.sku);
        req.input(`productName${idx}`, sql.NVarChar(255), r.productName);
        req.input(`brand${idx}`,       sql.NVarChar(100), r.brand);
        req.input(`unit${idx}`,        sql.NVarChar(50),  r.unit);
        req.input(`basePrice${idx}`,   sql.Decimal(18,2), r.basePrice);
        req.input(`reVat${idx}`,       sql.Decimal(18,2), r.reBeforeVat);
        req.input(`sellPrice${idx}`,   sql.Decimal(18,2), r.sellingPrice);

        if (hasSellingPrices) {
          // selling_price_w1 = RE before VAT, selling_price_r1 = selling price incl. VAT
          valueParts.push(
            `(@branch${idx},'Accessories',@sku${idx},@productName${idx},@brand${idx},@unit${idx},` +
            `@basePrice${idx},@reVat${idx},0,0,'',0,0,0,0,0,'',` +
            `@reVat${idx},0,@sellPrice${idx},0)`
          );
        } else {
          valueParts.push(
            `(@branch${idx},'Accessories',@sku${idx},@productName${idx},@brand${idx},@unit${idx},` +
            `@basePrice${idx},@reVat${idx},0,0,'',0,0,0,0,0,'')`
          );
        }
      });

      const insertCols = hasSellingPrices
        ? `branch, product_type, sku, product_name, brand, unit,
           base_price, discount_price_1, discount_price_2, discount_price_3,
           project_no, project_discount_1, project_discount_2, project_price,
           carton_price, shipping_cost, free_item,
           selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2`
        : `branch, product_type, sku, product_name, brand, unit,
           base_price, discount_price_1, discount_price_2, discount_price_3,
           project_no, project_discount_1, project_discount_2, project_price,
           carton_price, shipping_cost, free_item`;

      try {
        await req.query(`INSERT INTO excel_import_data (${insertCols}) VALUES ${valueParts.join(',')}`);
        imported += batch.length;
        console.log(`[ACC Parser] Inserted ${imported}/${insertRows.length}`);
      } catch (err) {
        console.error(`[ACC Parser] Batch insert error at ${batchStart}:`, err.message);
        // Fallback: insert row by row
        for (const r of batch) {
          try {
            const singleReq = pool.request()
              .input('branch',      sql.NVarChar(100), r.branch)
              .input('sku',         sql.NVarChar(50),  r.sku)
              .input('productName', sql.NVarChar(255), r.productName)
              .input('brand',       sql.NVarChar(100), r.brand)
              .input('unit',        sql.NVarChar(50),  r.unit)
              .input('basePrice',   sql.Decimal(18,2), r.basePrice)
              .input('reVat',       sql.Decimal(18,2), r.reBeforeVat)
              .input('sellPrice',   sql.Decimal(18,2), r.sellingPrice);

            if (hasSellingPrices) {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Accessories',@sku,@productName,@brand,@unit,
                        @basePrice,@reVat,0,0,'',0,0,0,0,0,'',
                        @reVat,0,@sellPrice,0)
              `);
            } else {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Accessories',@sku,@productName,@brand,@unit,
                        @basePrice,@reVat,0,0,'',0,0,0,0,0,'')
              `);
            }
            imported++;
          } catch (e2) {
            console.error(`[ACC Parser] Row insert error (${r.branch}/${r.sku}):`, e2.message);
          }
        }
      }
    }

    console.log(`[ACC Parser] Done: ${imported} rows inserted`);
    return imported;

  } catch (err) {
    console.error('[ACC Parser] Fatal error:', err);
    return 0;
  }
}

/**
 * =====================================================
 * Helper: Preview Accessories (ACC) Data
 * =====================================================
 */
async function previewAccessoriesData(excelBuffer, sheetName) {
  try {
    const pool = await getPool();

    // Load brand mapping
    let brandMap = {};
    try {
      const brandResult = await pool.request().query(`SELECT BRAND_NO, BRAND_NAME FROM Accessory_BRAND`);
      brandResult.recordset.forEach(r => {
        brandMap[String(r.BRAND_NO).padStart(2, '0')] = r.BRAND_NAME;
      });
    } catch (e) {
      console.warn(`[ACC Preview] Could not load Accessory_BRAND: ${e.message}`);
    }

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Debug: log 15 rows แรกเพื่อดู format จริง
    console.log(`[ACC Preview] Sheet: ${sheetName}, total rows: ${data.length}`);
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const cols = row.slice(0, 10).map((v, ci) => `[${ci}]=${JSON.stringify(v)}`).join(' | ');
      console.log(`  row${i}: ${cols}`);
    }

    const parsedRows = parseAccRows(data);
    console.log(`[ACC Preview] parsedRows: ${parsedRows.length}`);
    if (parsedRows.length > 0) {
      console.log(`[ACC Preview] first parsed:`, JSON.stringify(parsedRows[0]));
    }

    const previewRows = [];
    let totalSkus = 0;
    let totalRows = 0;

    for (const pr of parsedRows) {
      const brandName = brandMap[pr.sku.substring(1, 3)] || '';

      totalSkus++;
      totalRows++;  // 1 row ต่อ SKU (branch='ALL')

      if (previewRows.length < 15) {
        previewRows.push({
          sku: pr.sku,
          productName: pr.productName,
          brand: brandName,
          unit: pr.unit,
          branch: 'ALL',
          totalBranches: 1,
          base_price:       pr.basePrice,
          selling_price_w1: pr.reBeforeVat,   // RE before VAT
          selling_price_r1: pr.sellingPrice,  // selling price incl. VAT
          selling_price_w2: 0,
          selling_price_r2: 0,
        });
      }
    }

    const allBranches = ['ALL'];

    return { rows: previewRows, totalSkus, totalRows, branches: allBranches };

  } catch (err) {
    console.error('[ACC Preview] Fatal error:', err);
    return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
  }
}
