import { getPool, sql } from "../config/db.js";
import XLSX from 'xlsx';

/**
 * =====================================================
 * Helper: โหลด branch mapping จาก BranchMaster
 * คืนค่า:
 *   zoneToBranches  — { 'BKK': ['00TR',...], 'C': [...], ... }  (Excel zone label → branchCodes)
 *   branchMap       — { '00TR': { branchName, province, region }, ... }
 *
 * Zone mapping rules (ตาม Excel header ที่ใช้):
 *   BKK → กรุงเทพมหานคร (province)
 *   C   → ภาคกลาง (ยกเว้น กทม.)
 *   N   → ภาคเหนือ
 *   NE  → ภาคตะวันออกเฉียงเหนือ
 *   E   → ภาคตะวันออก
 *   S   → ภาคใต้ + ภาคตะวันตก
 * =====================================================
 */
let _branchCache = null;
export function clearBranchCache() { _branchCache = null; }
async function loadBranchMapping() {
  if (_branchCache) return _branchCache;

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT branchCode, branchName, province, region FROM BranchMaster ORDER BY branchCode
  `);

  const branchMap = {};
  const zoneToBranches = { BKK: [], C: [], N: [], NE: [], E: [], S: [] };

  for (const row of result.recordset) {
    const { branchCode, branchName, province, region } = row;
    branchMap[branchCode] = { branchName, province, region };

    if (province === 'กรุงเทพมหานคร') {
      zoneToBranches.BKK.push(branchCode);
    } else if (region === 'ภาคเหนือ') {
      zoneToBranches.N.push(branchCode);
    } else if (region === 'ภาคตะวันออกเฉียงเหนือ') {
      zoneToBranches.NE.push(branchCode);
    } else if (region === 'ภาคตะวันออก') {
      zoneToBranches.E.push(branchCode);
    } else if (region === 'ภาคใต้') {
      zoneToBranches.S.push(branchCode);
    } else if (region === 'ภาคตะวันตก') {
      // ภาคตะวันตก (เช่น 07RB ราชบุรี) จัดอยู่ใน zone C (ภาคกลาง) ตาม Excel C-Line
      zoneToBranches.C.push(branchCode);
    } else {
      // ภาคกลาง (ยกเว้น กทม.)
      zoneToBranches.C.push(branchCode);
    }
  }

  // suffixToBranchCode: CM → 12CM, CR → 17CR, ...
  const suffixToBranchCode = {};
  for (const bc of result.recordset.map(r => r.branchCode)) {
    const suffix = bc.slice(2); // เช่น 12CM → CM
    if (suffix && !suffixToBranchCode[suffix]) {
      suffixToBranchCode[suffix] = bc;
    }
  }

  _branchCache = { zoneToBranches, branchMap, allBranchCodes: result.recordset.map(r => r.branchCode), suffixToBranchCode };
  return _branchCache;
}

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

    // Detect product type
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
      } else if (sheetLower.includes('sealant') || sheetLower.includes('ซีลแลนท์') || sheetLower.includes('ซีลแล้นท์') || sheetLower === 'price list') {
        detectedType = 'Sealant';
      } else if (sheetLower.includes('c-line') || sheetLower.includes('cline') || sheetLower.includes('ซีลาย') || sheetLower === 'c line') {
        detectedType = 'C-Line';
      }
    }

    // Discard draft เก่าของ product_type นี้ก่อน (ถ้ามี)
    if (detectedType) {
      try {
        const oldDrafts = await pool.request()
          .input('pt', sql.NVarChar(100), detectedType)
          .query(`
            SELECT id FROM excel_import_logs
            WHERE product_type = @pt AND status = 'draft'
          `);
        for (const old of oldDrafts.recordset) {
          await pool.request()
            .input('logId', sql.Int, old.id)
            .query(`DELETE FROM excel_import_data WHERE import_log_id = @logId AND status = 'draft'`);
          await pool.request()
            .input('logId', sql.Int, old.id)
            .query(`UPDATE excel_import_logs SET status = 'discarded', imported_rows = 0 WHERE id = @logId`);
        }
        if (oldDrafts.recordset.length > 0) {
          console.log(`[Import] Discarded ${oldDrafts.recordset.length} old draft(s) for ${detectedType}`);
        }
      } catch (discardErr) {
        console.error('Failed to discard old drafts:', discardErr.message);
      }
    }

    console.log(`Detected product type: ${detectedType} (from sheet: ${sheetName})`);

    // Convert base64 buffer back to Buffer if provided
    let bufferData = null;
    if (excelBuffer) {
      bufferData = Buffer.from(excelBuffer, 'base64');
    }

    // สร้าง import log ก่อน เพื่อให้ได้ logId ไปใส่ใน excel_import_data
    let logId = null;
    let versionLabel = null;
    try {
      const logColCheck = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'excel_import_logs'
      `);
      const logCols = logColCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());

      if (logCols.includes('product_type') && logCols.includes('imported_rows') && logCols.includes('status')) {
        // Generate version_label: ABBR-YYMMDD[-N]
        const TYPE_ABBR = { Gypsum: 'GY', Glass: 'GL', Accessories: 'ACC', Aluminum: 'AL', Sealant: 'SL', 'C-Line': 'CL' };
        const abbr = TYPE_ABBR[detectedType] || (detectedType || 'XX').substring(0, 3).toUpperCase();
        const now = new Date();
        const yy = String(now.getFullYear()).slice(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const dateKey = `${abbr}-${yy}${mm}${dd}`;
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        // นับว่าวันนี้ import product_type นี้ไปแล้วกี่ครั้ง
        const countResult = await pool.request()
          .input('pt',    sql.NVarChar(100), detectedType)
          .input('today', sql.NVarChar(30),  todayStart)
          .query(`
            SELECT COUNT(*) AS cnt FROM excel_import_logs
            WHERE product_type = @pt AND imported_at >= @today
          `);
        const runNo = (countResult.recordset[0].cnt || 0) + 1;
        versionLabel = runNo === 1 ? dateKey : `${dateKey}-${runNo}`;

        const hasVersionLabel = logCols.includes('version_label');
        const insertQuery = hasVersionLabel
          ? `INSERT INTO excel_import_logs 
              (sheet_name, product_type, row_count, imported_rows, status, error_message, version_label, imported_at)
             OUTPUT INSERTED.id
             VALUES (@sheetName, @productType, @rowCount, @importedRows, @status, @errorMessage, @versionLabel, GETDATE())`
          : `INSERT INTO excel_import_logs 
              (sheet_name, product_type, row_count, imported_rows, status, error_message, imported_at)
             OUTPUT INSERTED.id
             VALUES (@sheetName, @productType, @rowCount, @importedRows, @status, @errorMessage, GETDATE())`;

        const logReq = pool.request()
          .input("sheetName",    sql.NVarChar(255), sheetName)
          .input("productType",  sql.NVarChar(100), detectedType)
          .input("rowCount",     sql.Int,           data ? data.length : 0)
          .input("importedRows", sql.Int,           0)
          .input("status",       sql.NVarChar(50),  'pending')
          .input("errorMessage", sql.NVarChar(sql.MAX), "");
        if (hasVersionLabel) logReq.input("versionLabel", sql.NVarChar(30), versionLabel);

        const logResult = await logReq.query(insertQuery);
        logId = logResult.recordset[0]?.id || null;
      }
    } catch (logErr) {
      console.error("Failed to create import log:", logErr.message);
    }

    let imported = 0;
    let status = 'success';
    let errorMessage = null;

    try {
      if (detectedType === "Gypsum") {
        if (bufferData) {
          imported = await importGypsumDataFromBuffer(pool, bufferData, sheetName, logId);
        }
      } else if (detectedType === "Glass") {
        if (bufferData) {
          imported = await importGlassData(pool, bufferData, sheetName, logId);
        }
      } else if (detectedType === "Accessories") {
        if (bufferData) {
          imported = await importAccessoriesData(pool, bufferData, sheetName, logId);
        }
      } else if (detectedType === "Sealant") {
        if (bufferData) {
          imported = await importSealantData(pool, bufferData, sheetName, logId);
        }
      } else if (detectedType === "C-Line") {
        if (bufferData) {
          imported = await importCLineData(pool, bufferData, sheetName, logId);
        }
      } else {
        imported = data ? data.length : 0;
      }
    } catch (importErr) {
      status = 'error';
      errorMessage = importErr.message;
      console.error("Import error:", importErr);
    }

    // อัปเดต log ด้วยผลลัพธ์จริง
    if (logId) {
      try {
        // ถ้า import สำเร็จ → status = 'draft' (รอ publish)
        // ถ้า error → status = 'error'
        const logStatus = status === 'success' ? 'draft' : status;

        await pool.request()
          .input("logId",        sql.Int,           logId)
          .input("importedRows", sql.Int,           imported)
          .input("status",       sql.NVarChar(50),  logStatus)
          .input("errorMessage", sql.NVarChar(sql.MAX), errorMessage || "")
          .query(`
            UPDATE excel_import_logs
            SET imported_rows = @importedRows, status = @status, error_message = @errorMessage
            WHERE id = @logId
          `);

        // Mark ข้อมูลที่ insert ไปทั้งหมดของ logId นี้เป็น 'draft'
        if (status === 'success' && imported > 0) {
          await pool.request()
            .input("logId", sql.Int, logId)
            .query(`UPDATE excel_import_data SET status = 'draft' WHERE import_log_id = @logId`);
        }
      } catch (logErr) {
        console.error("Failed to update import log:", logErr.message);
      }
    }

    res.json({ 
      success: status === 'success', 
      imported,
      detectedType,
      versionLabel,
      logId,
      message: `นำเข้าข้อมูล ${detectedType} สำเร็จ ${imported} แถว (${versionLabel || ''})`
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
async function importGypsumDataFromBuffer(pool, excelBuffer, sheetName, logId = null) {
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
    // - sheet ราคายิปซัม: col0 = ชื่อสินค้า (เช่น "STD 9 mm.") หรือว่าง
    //   SKU จริงได้มาจาก Sheet1 lookup (productName → [Y-SKU list])
    // - SB/DCM format: ไม่มี Sheet1 หรือ branch headers → ข้ามไป

    // ตรวจสอบว่ามี Sheet1 (source of truth สำหรับ SKU)
    const sheet1Check = workbook.Sheets['Sheet1'];
    if (!sheet1Check) {
      console.log(`[Gypsum Parser] Sheet "${sheetName}" skipped: no Sheet1 reference`);
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

    // Zone → branchCodes mapping จาก BranchMaster (แทน hardcode)
    const { zoneToBranches: ZONE_TO_BRANCHES, suffixToBranchCode } = await loadBranchMapping();

    // โหลด productName จาก StockStatusFact: sku → productName (ใช้ชื่อจาก DB แทน Excel)
    console.log('[Gypsum Parser] Loading productName from StockStatusFact...');
    const gypsumSkuNameResult = await pool.request().query(`
      SELECT DISTINCT skuNumber, productName
      FROM StockStatusFact
      WHERE category = 'Gypsum' AND skuNumber LIKE 'Y%'
    `);
    const skuNameMap = {}; // sku → productName
    gypsumSkuNameResult.recordset.forEach(r => {
      if (r.skuNumber && r.productName) skuNameMap[r.skuNumber] = r.productName;
    });
    console.log(`[Gypsum Parser] Loaded ${Object.keys(skuNameMap).length} SKU names from StockStatusFact`);

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
    let branchStartCol = 3; // default col 3

    for (let ri = 0; ri <= Math.min(5, rawData.length - 1); ri++) {
      const row = rawData[ri];
      if (!row) continue;
      let matchCount = 0;
      let firstMatchCol = -1;
      for (let col = 2; col < row.length; col++) {
        const v = row[col];
        if (!v || typeof v !== 'string') continue;
        const h = v.trim();
        if (ALL_ZONE_KEYS.has(h) || BRANCH_CODE_RE.test(h) || suffixToBranchCode[h]) {
          matchCount++;
          if (firstMatchCol === -1) firstMatchCol = col;
        }
      }
      if (matchCount >= 2) {
        branchHeaderRowIdx = ri;
        branchStartCol = firstMatchCol;
        break;
      }
    }

    // fallback: ถ้าหาไม่เจอใน 6 rows แรก ให้ใช้ row 1 col 3 (format เดิม)
    if (branchHeaderRowIdx === -1) {
      console.warn("[Gypsum Parser] Auto-detect failed, falling back to row 1 col 3");
      branchHeaderRowIdx = 1;
      branchStartCol = 3;
    }
    console.log(`[Gypsum Parser] Branch header row: ${branchHeaderRowIdx}, startCol: ${branchStartCol}`);

    const branchHeaderRow = rawData[branchHeaderRowIdx];
    if (branchHeaderRow) {
      const seenHeaders = new Set();
      for (let col = branchStartCol; col < branchHeaderRow.length; col++) {
        const header = branchHeaderRow[col];
        if (!header || typeof header !== 'string' || !header.trim()) continue;
        const h = header.trim();

        // หยุดเมื่อเจอ header ซ้ำ — แสดงว่าเป็นชุดที่ 2 (นอกตาราง)
        if (seenHeaders.has(h)) {
          console.log(`[Gypsum Parser] Duplicate branch header "${h}" at col ${col}, stopping`);
          break;
        }
        seenHeaders.add(h);
        branches.push(h);

        if (ZONE_TO_BRANCHES[h]) {
          // zone name (BKK, C, N, NE, E, S) → expand
          for (const branchCode of ZONE_TO_BRANCHES[h]) {
            branchColumns.push({ colIdx: col, branchCode });
          }
        } else if (/^\d{2}[A-Z]{2}$/.test(h)) {
          // branchCode จริง (00TR, 01TJ, ...)
          branchColumns.push({ colIdx: col, branchCode: h });
        } else if (suffixToBranchCode[h]) {
          // suffix (CM, CR, PL, ...) → lookup branchCode จริง
          branchColumns.push({ colIdx: col, branchCode: suffixToBranchCode[h] });
        } else {
          // ไม่รู้จัก → ใช้ตรงๆ
          branchColumns.push({ colIdx: col, branchCode: h });
        }
      }
    }

    // data rows เริ่มจาก branch header row เลย
    // เพราะ branch header row อาจมี block header (Y-SKU) อยู่ใน col0 ด้วย (format SB)
    // ถ้าเริ่มจาก branchHeaderRowIdx + 1 จะข้าม block header แรกไป
    const dataStartRow = branchHeaderRowIdx;

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
      'Price : W1','Price : W2','Price : R1','Price : R2','Price : SDM',
      'MG/Bht : W1','MG/Bht : W2','MG/Bht : R1','MG/Bht : R2','MG/Bht : SDM',
      'MG/% : W1','MG/% : W2','MG/% : R1','MG/% : R2','MG/% : SDM']);
    
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
          skuLookup[productName].forEach(sku => {
            // เฉพาะ SKU ที่มีใน StockStatusFact เท่านั้น
            if (skuNameMap[sku]) {
              skusInBlock.set(sku, productName);
            }
          });
          if (skusInBlock.size > 0) {
            console.log(`[Gypsum Parser] "${productName}" → ${skusInBlock.size} SKUs from Sheet1 (filtered by StockStatusFact)`);
          } else {
            console.warn(`[Gypsum Parser] "${productName}" has SKUs in Sheet1 but none found in StockStatusFact, skipping`);
            i++;
            continue;
          }
        } else {
          console.warn(`[Gypsum Parser] "${productName}" not in Sheet1 lookup yet, skipping`);
          i++;
          continue;
        }

        const priceListRow = rawData[priceListRowIndex];
        let priceList = priceListRow;
        let reExVat = null;
        let priceW1 = null, priceW2 = null, priceR1 = null, priceR2 = null, priceSDM = null;
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
          else if (nextCol1 === 'Price : SDM')    priceSDM = dataRow;
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
            // ใช้ชื่อจาก StockStatusFact ถ้ามี ไม่งั้น fallback ไป Sheet1
            const productName = skuNameMap[sku] || skuName;

            for (const { colIdx, branchCode } of branchColumns) {
              const branch = branchCode;

              let basePrice = priceList ? parseFloat(priceList[colIdx]) || 0 : 0;
              if (basePrice === 0 && reExVat) basePrice = parseFloat(reExVat[colIdx]) || 0;

              const sellW1     = parseFloat(priceW1[colIdx]) || 0;
              const sellW2     = parseFloat(priceW2[colIdx]) || 0;
              const sellR1     = parseFloat(priceR1[colIdx]) || 0;
              const sellR2     = parseFloat(priceR2[colIdx]) || 0;
              const sellSDM    = priceSDM ? parseFloat(priceSDM[colIdx]) || 0 : 0;

              // discount ทีละชั้น (สูงสุด 3 ชั้น)
              // discountPctRows[n]    = % ของชั้นนั้น
              // discountPriceRows[n]  = ราคาหลังหัก % ชั้นนั้น (row ว่างที่ตามหลัง Discount)
              // reExVat               = ราคาสุดท้ายหลังหักทุกชั้น
              const numDiscounts = discountPctRows.length; // จำนวนชั้น discount จริง

              // normalize % → ถ้าค่า <= 1 แสดงว่าเป็น decimal (0.03 = 3%) ใช้ตรงๆ
              // ถ้าค่า > 1 อาจเป็น % จริง (3.0 = 3%) หรือจำนวนเงิน (2.31 บาท)
              // ถ้ามี discountPriceRow → คำนวณ % จากราคาจริงแทน (แม่นยำกว่า)
              const normPct = v => {
                const n = parseFloat(v) || 0;
                return n > 1 ? n / 100 : n;
              };

              // คำนวณ % จากราคาจริง (ถ้ามี discountPriceRow)
              const calcPctFromPrice = (priceBefore, priceAfter) => {
                const b = parseFloat(priceBefore) || 0;
                const a = parseFloat(priceAfter) || 0;
                if (!b || !a || a <= 0 || a >= b) return 0;
                return (b - a) / b;
              };

              // ใช้ราคาจริงคำนวณ % ถ้ามี discountPriceRow, ไม่งั้นใช้ normPct
              const getDiscPct = (pctRow, priceRow, colIdx, priceBefore) => {
                if (priceRow) {
                  const priceAfter = parseFloat(priceRow[colIdx]);
                  if (priceAfter > 0 && priceAfter < priceBefore) {
                    return calcPctFromPrice(priceBefore, priceAfter);
                  }
                }
                return pctRow ? normPct(pctRow[colIdx]) : 0;
              };

              const reExVatVal = reExVat ? parseFloat(reExVat[colIdx]) || 0 : 0;

              let discPrice1 = 0, discPrice2 = 0, discPrice3 = 0;

              // helper: อ่านราคาจาก discountPriceRows[n] ถ้ามีค่า ไม่งั้น fallback
              const getDiscPrice = (rowArr, idx, fallback) => {
                if (!rowArr[idx]) return fallback;
                const v = parseFloat(rowArr[idx][colIdx]);
                return (v && !isNaN(v)) ? v : fallback;
              };

              const getRealDiscPrice = getDiscPrice;

              // นับเฉพาะ discount ชั้นที่มี % จริง (> 0) หรือมีราคาหลังลดจริง
              // กรอง "Discount 0%" ออก เพราะไม่ใช่ส่วนลดจริง
              // เก็บ original index ไว้เพื่อ map discountPriceRows ให้ถูกต้อง
              const realDiscounts = discountPctRows
                .map((r, origIdx) => ({
                  pctRow: r,
                  priceRow: discountPriceRows[origIdx] || null,
                  origIdx
                }))
                .filter(({ pctRow, priceRow }) => {
                  const pct = normPct(pctRow[colIdx]);
                  const hasPrice = priceRow && parseFloat(priceRow[colIdx]) > 0;
                  return pct > 0 || hasPrice;
                });

              const realDiscountPctRows   = realDiscounts.map(d => d.pctRow);
              const realDiscountPriceRows = realDiscounts.map(d => d.priceRow);
              const realNumDiscounts = realDiscounts.length;

              if (realNumDiscounts === 0) {
                discPrice1 = reExVatVal;
              } else if (realNumDiscounts === 1) {
                discPrice1 = getRealDiscPrice(realDiscountPriceRows, 0, reExVatVal);
              } else if (realNumDiscounts === 2) {
                const fallback1 = normPct(realDiscountPctRows[0]?.[colIdx]) > 0
                  ? Math.round(basePrice * (1 - normPct(realDiscountPctRows[0][colIdx])) * 100) / 100
                  : reExVatVal;
                discPrice1 = getRealDiscPrice(realDiscountPriceRows, 0, fallback1);
                discPrice2 = getRealDiscPrice(realDiscountPriceRows, 1, reExVatVal);
              } else {
                const fallback1 = normPct(realDiscountPctRows[0]?.[colIdx]) > 0
                  ? Math.round(basePrice * (1 - normPct(realDiscountPctRows[0][colIdx])) * 100) / 100
                  : reExVatVal;
                discPrice1 = getRealDiscPrice(realDiscountPriceRows, 0, fallback1);
                const fallback2 = normPct(realDiscountPctRows[1]?.[colIdx]) > 0
                  ? Math.round(discPrice1 * (1 - normPct(realDiscountPctRows[1][colIdx])) * 100) / 100
                  : reExVatVal;
                discPrice2 = getRealDiscPrice(realDiscountPriceRows, 1, fallback2);
                discPrice3 = getRealDiscPrice(realDiscountPriceRows, 2, reExVatVal);
              }

              // คำนวณ % จากราคาจริงเสมอ — ไม่ใช้ค่าจาก Excel
              const calcPct = (before, after) => {
                const b = parseFloat(before) || 0, a = parseFloat(after) || 0;
                if (!b || !a || a <= 0 || a >= b) return 0;
                return (b - a) / b;
              };

              const finalDiscPct1 = calcPct(basePrice,   discPrice1);
              const finalDiscPct2 = calcPct(discPrice1,  discPrice2);
              const finalDiscPct3 = calcPct(discPrice2,  discPrice3);

              try {
                const req = pool.request()
                  .input("branch",           sql.NVarChar(100), branch)
                  .input("productType",      sql.NVarChar(100), "Gypsum")
                  .input("sku",              sql.NVarChar(50),  sku)
                  .input("productName",      sql.NVarChar(255), productName)
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
                  .input("sellR2",           sql.Decimal(18,2), sellR2)
                  .input("sellSDM",          sql.Decimal(18,2), sellSDM)
                  .input("logId",            sql.Int,           logId);

                if (hasDiscPct) {
                  req.input("discPct1", sql.Decimal(10,6), finalDiscPct1)
                     .input("discPct2", sql.Decimal(10,6), finalDiscPct2)
                     .input("discPct3", sql.Decimal(10,6), finalDiscPct3);

                  if (hasDiscPct3) {
                    await req.query(`
                      INSERT INTO excel_import_data (
                        branch, product_type, sku, product_name, brand, unit,
                        base_price, discount_price_1, discount_price_2, discount_price_3,
                        project_no, project_discount_1, project_discount_2, project_price,
                        carton_price, shipping_cost, free_item,
                        selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, selling_price_sdm,
                        discount_pct_1, discount_pct_2, discount_pct_3, import_log_id
                      ) VALUES (
                        @branch, @productType, @sku, @productName, @brand, @unit,
                        @basePrice, @discountPrice1, @discountPrice2, @discountPrice3,
                        @projectNo, @projectDiscount1, @projectDiscount2, @projectPrice,
                        @cartonPrice, @shippingCost, @freeItem,
                        @sellW1, @sellW2, @sellR1, @sellR2, @sellSDM,
                        @discPct1, @discPct2, @discPct3, @logId
                      )
                    `);
                  } else {
                    await req.query(`
                      INSERT INTO excel_import_data (
                        branch, product_type, sku, product_name, brand, unit,
                        base_price, discount_price_1, discount_price_2, discount_price_3,
                        project_no, project_discount_1, project_discount_2, project_price,
                        carton_price, shipping_cost, free_item,
                        selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, selling_price_sdm,
                        discount_pct_1, discount_pct_2, import_log_id
                      ) VALUES (
                        @branch, @productType, @sku, @productName, @brand, @unit,
                        @basePrice, @discountPrice1, @discountPrice2, @discountPrice3,
                        @projectNo, @projectDiscount1, @projectDiscount2, @projectPrice,
                        @cartonPrice, @shippingCost, @freeItem,
                        @sellW1, @sellW2, @sellR1, @sellR2, @sellSDM,
                        @discPct1, @discPct2, @logId
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
                      selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, selling_price_sdm,
                      import_log_id
                    ) VALUES (
                      @branch, @productType, @sku, @productName, @brand, @unit,
                      @basePrice, @discountPrice1, @discountPrice2, @discountPrice3,
                      @projectNo, @projectDiscount1, @projectDiscount2, @projectPrice,
                      @cartonPrice, @shippingCost, @freeItem,
                      @sellW1, @sellW2, @sellR1, @sellR2, @sellSDM,
                      @logId
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
async function importGlassData(pool, excelBuffer, sheetName, logId = null) {
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

    // Region → branchCodes mapping จาก BranchMaster
    const { zoneToBranches: REGION_BRANCHES, allBranchCodes } = await loadBranchMapping();

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
    const branchInList = allBranchCodes.map(b => `'${b}'`).join(',');
    const stockResult = await pool.request().query(`
      SELECT DISTINCT skuNumber, branchCode, productName
      FROM StockStatusFact
      WHERE category = 'Glass' AND skuNumber LIKE 'G%'
        AND branchCode IN (${branchInList})
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

      // col0 อาจมีหลาย SKU คั่นด้วย "/" หรือ ","
      const skuList = col0.split(/[\/,]/).map(s => s.trim()).filter(s => /^G\d/.test(s));

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
          // ไม่มีใน StockStatusFact → skip
          console.warn(`[Glass Parser] SKU "${excelSku}" not found in StockStatusFact, skipping`);
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
         selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, import_log_id`
      : `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item, import_log_id`;

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
        req.input(`logId${idx}`,       sql.Int,           logId);

        if (hasSellingPrices) {
          valueParts.push(`(@branch${idx},'Glass',@sku${idx},@productName${idx},@brand${idx},'',@basePrice${idx},0,0,0,'',0,0,0,0,0,'',@w1_${idx},@w2_${idx},@r1_${idx},@r2_${idx},@logId${idx})`);
        } else {
          valueParts.push(`(@branch${idx},'Glass',@sku${idx},@productName${idx},@brand${idx},'',@basePrice${idx},0,0,0,'',0,0,0,0,0,'',@logId${idx})`);
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
    if (productType) whereParts.push("d.[product_type] = @productType");
    if (branch)      whereParts.push("d.[branch] = @branch");
    if (search)      whereParts.push("(d.[sku] LIKE @search OR d.[product_name] LIKE @search OR d.[brand] LIKE @search)");
    else if (sku)    whereParts.push("d.[sku] LIKE @search");

    // WHERE clause — hasLogId path มี WHERE อยู่แล้วใน fromClause → ใช้ AND
    // fallback path: FROM (...) d WHERE d.rn = 1 → ต้องใช้ AND เช่นกัน
    const buildWhereStr = (useAnd) =>
      whereParts.length > 0
        ? `AND ${whereParts.join(' AND ')}`
        : '';

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Check if selling_price and discount_pct columns exist
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');
    const hasDiscPct       = cols.includes('discount_pct_1');

    const hasLogId = cols.includes('import_log_id');

    const hasSdm = cols.includes('selling_price_sdm');

    const sellingCols = hasSellingPrices ? `
        [selling_price_w1] AS [sellingPriceW1],
        [selling_price_w2] AS [sellingPriceW2],
        [selling_price_r1] AS [sellingPriceR1],
        [selling_price_r2] AS [sellingPriceR2],
        ${hasSdm ? '[selling_price_sdm] AS [sellingPriceSdm],' : 'NULL AS [sellingPriceSdm],'}` : `
        NULL AS [sellingPriceW1], NULL AS [sellingPriceW2],
        NULL AS [sellingPriceR1], NULL AS [sellingPriceR2],
        NULL AS [sellingPriceSdm],`;

    const discPctCols = hasDiscPct ? `
        CASE WHEN [discount_pct_1] > 1 THEN [discount_pct_1] / 100.0 ELSE [discount_pct_1] END AS [discountPct1],
        CASE WHEN [discount_pct_2] > 1 THEN [discount_pct_2] / 100.0 ELSE [discount_pct_2] END AS [discountPct2],
        CASE WHEN [discount_pct_3] > 1 THEN [discount_pct_3] / 100.0 ELSE [discount_pct_3] END AS [discountPct3],` : `
        NULL AS [discountPct1], NULL AS [discountPct2], NULL AS [discountPct3],`;

    // หา import_log_id ล่าสุดต่อ product_type
    let fromClause = '';
    if (hasLogId) {
      fromClause = `
        FROM [excel_import_data] d
        INNER JOIN (
          SELECT l.product_type, MAX(l.id) AS latest_log_id
          FROM excel_import_logs l
          WHERE l.status = 'published' AND l.imported_rows > 0
          GROUP BY l.product_type
        ) latest_log
          ON d.product_type = latest_log.product_type
          AND d.import_log_id = latest_log.latest_log_id
        WHERE d.status = 'published'
      `;
    } else {
      // fallback: ล่าสุดต่อ sku+branch
      fromClause = `
        FROM (
          SELECT *, ROW_NUMBER() OVER (
            PARTITION BY [sku], [branch], [product_name]
            ORDER BY [created_at] DESC
          ) AS rn
          FROM [excel_import_data]
          WHERE status = 'published'
        ) d WHERE d.rn = 1
      `;
    }

    // WHERE clause — ใช้ prefix ถูกต้องตาม path
    // hasLogId path: FROM ... (ไม่มี WHERE ใน FROM) → ใช้ WHERE
    // fallback path: FROM (...) d WHERE d.rn = 1 → ต้องใช้ AND
    const whereStr = buildWhereStr(!hasLogId);

    // Count
    const countReq = pool.request();
    if (productType) countReq.input("productType", sql.NVarChar(100), productType);
    if (branch)      countReq.input("branch",      sql.NVarChar(100), branch);
    if (search || sku) countReq.input("search",    sql.NVarChar(255), `%${search || sku}%`);

    const countResult = await countReq.query(`
      SELECT COUNT(*) AS [total]
      ${fromClause}
      ${whereStr}
    `);
    const total = countResult.recordset[0].total;

    // Get data
    const dataReq = pool.request();
    if (productType) dataReq.input("productType", sql.NVarChar(100), productType);
    if (branch)      dataReq.input("branch",      sql.NVarChar(100), branch);
    if (search || sku) dataReq.input("search",    sql.NVarChar(255), `%${search || sku}%`);
    dataReq.input("limit",  sql.Int, parseInt(limit));
    dataReq.input("offset", sql.Int, offset);

    const result = await dataReq.query(`
      SELECT
        d.[id], d.[branch], d.[product_type] AS [productType],
        d.[sku], d.[product_name] AS [productName], d.[brand], d.[unit],
        d.[base_price]       AS [basePrice],
        d.[discount_price_1] AS [discountPrice1],
        d.[discount_price_2] AS [discountPrice2],
        d.[discount_price_3] AS [discountPrice3],
        ${discPctCols}
        ${sellingCols}
        d.[created_at] AS [createdAt]
      ${fromClause}
      ${whereStr}
      ORDER BY d.[product_type], d.[sku], d.[branch]
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
      discount_pct_1, discount_pct_2, discount_pct_3,
      selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2
    } = req.body;

    const pool = await getPool();

    // Check which columns exist
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');
    const hasDiscPct       = cols.includes('discount_pct_1');

    // ถ้ามีการส่ง discount_pct มา ให้คำนวณ discount_price ที่ตรงกันด้วย
    // ต้องดึง base_price และ discount_price ปัจจุบันจาก DB ก่อน
    let computedPrices = {};
    if (hasDiscPct && (discount_pct_1 !== undefined || discount_pct_2 !== undefined || discount_pct_3 !== undefined)) {
      const current = await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query(`SELECT base_price, discount_price_1, discount_price_2 FROM excel_import_data WHERE id = @id`);
      const cur = current.recordset[0] || {};

      if (discount_pct_1 !== undefined) {
        const pct = parseFloat(discount_pct_1); // 0-1
        const base = parseFloat(base_price ?? cur.base_price) || 0;
        computedPrices.discount_price_1 = base > 0 ? parseFloat((base * (1 - pct)).toFixed(2)) : 0;
      }
      if (discount_pct_2 !== undefined) {
        const pct = parseFloat(discount_pct_2);
        const prev = computedPrices.discount_price_1 ?? parseFloat(discount_price_1 ?? cur.discount_price_1) ?? 0;
        computedPrices.discount_price_2 = prev > 0 ? parseFloat((prev * (1 - pct)).toFixed(2)) : 0;
      }
      if (discount_pct_3 !== undefined) {
        const pct = parseFloat(discount_pct_3);
        const prev = computedPrices.discount_price_2 ?? parseFloat(discount_price_2 ?? cur.discount_price_2) ?? 0;
        computedPrices.discount_price_3 = prev > 0 ? parseFloat((prev * (1 - pct)).toFixed(2)) : 0;
      }
    }

    const req2 = pool.request().input("id", sql.Int, parseInt(id));
    let setCols = [];

    if (base_price       !== undefined) { req2.input("basePrice",      sql.Decimal(18,2), parseFloat(base_price)       || 0); setCols.push("[base_price] = @basePrice"); }

    // discount_price — ใช้ค่าที่คำนวณจาก pct ถ้ามี ไม่งั้นใช้ค่าที่ส่งมาตรงๆ
    const dp1 = computedPrices.discount_price_1 ?? (discount_price_1 !== undefined ? parseFloat(discount_price_1) || 0 : undefined);
    const dp2 = computedPrices.discount_price_2 ?? (discount_price_2 !== undefined ? parseFloat(discount_price_2) || 0 : undefined);
    const dp3 = computedPrices.discount_price_3 ?? (discount_price_3 !== undefined ? parseFloat(discount_price_3) || 0 : undefined);
    if (dp1 !== undefined) { req2.input("discountPrice1", sql.Decimal(18,2), dp1); setCols.push("[discount_price_1] = @discountPrice1"); }
    if (dp2 !== undefined) { req2.input("discountPrice2", sql.Decimal(18,2), dp2); setCols.push("[discount_price_2] = @discountPrice2"); }
    if (dp3 !== undefined) { req2.input("discountPrice3", sql.Decimal(18,2), dp3); setCols.push("[discount_price_3] = @discountPrice3"); }

    // discount_pct
    if (hasDiscPct) {
      if (discount_pct_1 !== undefined) { req2.input("discPct1", sql.Decimal(10,6), parseFloat(discount_pct_1) || 0); setCols.push("[discount_pct_1] = @discPct1"); }
      if (discount_pct_2 !== undefined) { req2.input("discPct2", sql.Decimal(10,6), parseFloat(discount_pct_2) || 0); setCols.push("[discount_pct_2] = @discPct2"); }
      if (discount_pct_3 !== undefined) { req2.input("discPct3", sql.Decimal(10,6), parseFloat(discount_pct_3) || 0); setCols.push("[discount_pct_3] = @discPct3"); }
    }

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

export async function getImportDataByLog(req, res) {
  try {
    const { logId } = req.params;
    const { page = 1, limit = 50, branch, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const pool = await getPool();

    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');
    const hasDiscPct = cols.includes('discount_pct_1');

    let whereParts = [`d.[import_log_id] = @logId`];
    if (branch) whereParts.push(`d.[branch] = @branch`);
    if (search) whereParts.push(`(d.[sku] LIKE @search OR d.[product_name] LIKE @search)`);

    const whereStr = `WHERE ${whereParts.join(' AND ')}`;

    const countReq = pool.request().input('logId', sql.Int, parseInt(logId));
    if (branch) countReq.input('branch', sql.NVarChar(100), branch);
    if (search) countReq.input('search', sql.NVarChar(255), `%${search}%`);
    const countResult = await countReq.query(`SELECT COUNT(*) AS total FROM excel_import_data d ${whereStr}`);
    const total = countResult.recordset[0].total;

    const sellingCols = hasSellingPrices
      ? `d.[selling_price_w1] AS [sellingPriceW1], d.[selling_price_w2] AS [sellingPriceW2],
         d.[selling_price_r1] AS [sellingPriceR1], d.[selling_price_r2] AS [sellingPriceR2],`
      : `NULL AS [sellingPriceW1], NULL AS [sellingPriceW2], NULL AS [sellingPriceR1], NULL AS [sellingPriceR2],`;
    const discPctCols = hasDiscPct
      ? `CASE WHEN d.[discount_pct_1] > 1 THEN d.[discount_pct_1]/100.0 ELSE d.[discount_pct_1] END AS [discountPct1],
         CASE WHEN d.[discount_pct_2] > 1 THEN d.[discount_pct_2]/100.0 ELSE d.[discount_pct_2] END AS [discountPct2],
         CASE WHEN d.[discount_pct_3] > 1 THEN d.[discount_pct_3]/100.0 ELSE d.[discount_pct_3] END AS [discountPct3],`
      : `NULL AS [discountPct1], NULL AS [discountPct2], NULL AS [discountPct3],`;

    const dataReq = pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .input('limit', sql.Int, parseInt(limit))
      .input('offset', sql.Int, offset);
    if (branch) dataReq.input('branch', sql.NVarChar(100), branch);
    if (search) dataReq.input('search', sql.NVarChar(255), `%${search}%`);

    const result = await dataReq.query(`
      SELECT d.[id], d.[branch], d.[product_type] AS [productType],
        d.[sku], d.[product_name] AS [productName], d.[brand], d.[unit],
        d.[base_price] AS [basePrice],
        d.[discount_price_1] AS [discountPrice1],
        d.[discount_price_2] AS [discountPrice2],
        d.[discount_price_3] AS [discountPrice3],
        ${discPctCols}
        ${sellingCols}
        d.[created_at] AS [createdAt]
      FROM excel_import_data d
      ${whereStr}
      ORDER BY d.[sku], d.[branch]
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({ data: result.recordset, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error("getImportDataByLog error:", err);
    res.status(500).json({ message: "Failed to fetch history data", error: err.message });
  }
}

export async function getImportLogs(req, res) {
  try {
    const pool = await getPool();
    const { productType } = req.query;

    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'excel_import_logs'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasVersionLabel = cols.includes('version_label');

    const req2 = pool.request();
    if (productType) req2.input('productType', sql.NVarChar(100), productType);

    const whereStr = productType ? 'WHERE product_type = @productType' : '';

    const result = await req2.query(`
      SELECT 
        [id],
        [sheet_name]    AS [sheetName],
        [product_type]  AS [productType],
        [row_count]     AS [rowCount],
        [imported_rows] AS [importedRows],
        [status]        AS [status],
        [error_message] AS [errorMessage],
        ${hasVersionLabel ? '[version_label] AS [versionLabel],' : 'NULL AS [versionLabel],'}
        [imported_at]   AS [importedAt]
      FROM excel_import_logs
      ${whereStr}
      ORDER BY [imported_at] DESC
    `);

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
      } else if (sheetLower.includes('sealant') || sheetLower.includes('ซีลแลนท์') || sheetLower.includes('ซีลแล้นท์') || sheetLower === 'price list') {
        detectedType = 'Sealant';
      } else if (sheetLower.includes('c-line') || sheetLower.includes('cline') || sheetLower.includes('ซีลาย') || sheetLower === 'c line') {
        detectedType = 'C-Line';
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
      } else if (detectedType === "Sealant") {
        const bufferData = Buffer.from(excelBuffer, 'base64');
        previewData = await previewSealantData(bufferData, sheetName);
      } else if (detectedType === "C-Line") {
        const bufferData = Buffer.from(excelBuffer, 'base64');
        previewData = await previewCLineData(bufferData, sheetName);
      }
    } catch (err) {
      console.error("Preview error:", err);
      return res.status(500).json({ 
        message: "Failed to preview data",
        error: err.message 
      });
    }

    // ============================================================
    // คำนวณ summary เพิ่มเติม
    // ============================================================
    const pool = await getPool();
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1. รอบที่เท่าไหร่ของวันนี้ และ version label ที่จะได้
    const TYPE_ABBR = { Gypsum: 'GY', Glass: 'GL', Accessories: 'ACC', Aluminum: 'AL', Sealant: 'SL', 'C-Line': 'CL' };
    const abbr = TYPE_ABBR[detectedType] || (detectedType || 'XX').substring(0, 3).toUpperCase();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateKey = `${abbr}-${yy}${mm}${dd}`;

    const roundResult = await pool.request()
      .input('pt',    sql.NVarChar(100), detectedType || '')
      .input('today', sql.NVarChar(30),  todayStart)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM excel_import_logs
        WHERE product_type = @pt AND imported_at >= @today
      `);
    const uploadRoundToday = (roundResult.recordset[0].cnt || 0) + 1;
    const previewVersionLabel = uploadRoundToday === 1 ? dateKey : `${dateKey}-${uploadRoundToday}`;

    // 2. เปรียบเทียบราคากับข้อมูลล่าสุดใน DB
    let priceChanges = [];
    let newSkus = [];

    if (detectedType && previewData.rows && previewData.rows.length > 0) {
      // ดึงราคาล่าสุดของแต่ละ SKU|branch สำหรับ product_type นี้
      const dbData = await pool.request()
        .input('pt', sql.NVarChar(100), detectedType)
        .query(`
          SELECT sku, branch, base_price,
                 discount_price_1, discount_price_2, discount_price_3,
                 selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2,
                 selling_price_sdm
          FROM (
            SELECT d.sku, d.branch, d.base_price,
                   d.discount_price_1, d.discount_price_2, d.discount_price_3,
                   d.selling_price_w1, d.selling_price_w2, d.selling_price_r1, d.selling_price_r2,
                   d.selling_price_sdm,
                   ROW_NUMBER() OVER (PARTITION BY d.sku, d.branch ORDER BY l.imported_at DESC) AS rn
            FROM excel_import_data d
            JOIN excel_import_logs l ON l.id = d.import_log_id
            WHERE d.product_type = @pt
              AND l.status IN ('success', 'published')
              AND l.imported_rows > 0
          ) t
          WHERE rn = 1
        `);

      // product type ที่ใช้ selling_price แทน discount_price
      const usesSellingPrice = ['Sealant', 'Accessories', 'Glass'].includes(detectedType);

      if (dbData.recordset.length > 0) {
        const dbMap = new Map();
        for (const r of dbData.recordset) {
          dbMap.set(`${r.sku}|${r.branch}`, r);
        }

        // allRows ของ Sealant/ACC คืน branch เป็น label เช่น "ทุกสาขา (45)"
        // ต้องใช้ข้อมูลจาก parsedRows จริงๆ แทน — ดึง unique sku จาก allRows แล้วเช็คกับ DB
        const newMap = new Map();
        for (const r of (previewData.allRows || previewData.rows)) {
          // ถ้า branch เป็น label (มีวงเล็บ) ให้ใช้แค่ sku เป็น key สำหรับ Sealant/ACC
          const branchKey = (typeof r.branch === 'string' && r.branch.includes('('))
            ? '__any__'
            : r.branch;
          const key = `${r.sku}|${branchKey}`;
          if (!newMap.has(key)) newMap.set(key, r);
        }

        // หา SKU ใหม่ที่ไม่มีใน DB เลย (ไม่มีแม้แต่ branch เดียว)
        const dbSkus = new Set([...dbMap.keys()].map(k => k.split('|')[0]));
        for (const [key, row] of newMap) {
          const sku = row.sku;
          if (!dbSkus.has(sku)) {
            newSkus.push({ sku, productName: row.productName, branch: row.branch });
          }
        }

        // หาราคาที่เปลี่ยนแปลง
        for (const [key, newRow] of newMap) {
          // สำหรับ Sealant/ACC ที่ branch เป็น label → เปรียบเทียบกับ DB row ใดก็ได้ของ SKU นั้น
          let dbRow;
          if (key.endsWith('|__any__')) {
            const sku = newRow.sku;
            dbRow = [...dbMap.entries()].find(([k]) => k.startsWith(`${sku}|`))?.[1];
          } else {
            dbRow = dbMap.get(key);
          }
          if (!dbRow) continue;

          let fields;
          if (usesSellingPrice) {
            fields = [
              { name: 'W1', newVal: newRow.selling_price_w1, oldVal: dbRow.selling_price_w1 },
              { name: 'W2', newVal: newRow.selling_price_w2, oldVal: dbRow.selling_price_w2 },
              { name: 'R1', newVal: newRow.selling_price_r1, oldVal: dbRow.selling_price_r1 },
              { name: 'R2', newVal: newRow.selling_price_r2, oldVal: dbRow.selling_price_r2 },
            ];
          } else {
            fields = [
              { name: 'ราคาตั้งต้น',  newVal: newRow.base_price,       oldVal: dbRow.base_price },
              { name: 'ราคาหลังลด 1', newVal: newRow.discount_price_1, oldVal: dbRow.discount_price_1 },
              { name: 'ราคาหลังลด 2', newVal: newRow.discount_price_2, oldVal: dbRow.discount_price_2 },
            ];
          }

          const changedFields = fields.filter(f => {
            const nv = parseFloat(f.newVal) || 0;
            const ov = parseFloat(f.oldVal) || 0;
            return Math.abs(nv - ov) > 0.001;
          });
          if (changedFields.length > 0) {
            priceChanges.push({
              sku: newRow.sku, productName: newRow.productName, branch: newRow.branch,
              changedFields: changedFields.map(f => ({
                name: f.name,
                oldPrice: parseFloat(f.oldVal) || 0,
                newPrice: parseFloat(f.newVal) || 0,
              }))
            });
          }
        }
      }
    }

    res.json({ 
      success: true,
      detectedType,
      totalSkus:       previewData.totalSkus  || 0,
      totalRows:       previewData.totalRows  || 0,
      branches:        previewData.branches   || [],
      uploadRoundToday,
      previewVersionLabel,
      priceChangesTotal: priceChanges.length,
      newSkusTotal:    newSkus.length,
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
    'Price : W1','Price : W2','Price : R1','Price : R2','Price : SDM',
    'MG/Bht : W1','MG/Bht : W2','MG/Bht : R1','MG/Bht : R2','MG/Bht : SDM',
    'MG/% : W1','MG/% : W2','MG/% : R1','MG/% : R2','MG/% : SDM']);

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

    // Zone → branchCodes mapping จาก BranchMaster (แทน hardcode)
    const { zoneToBranches: ZONE_TO_BRANCHES, suffixToBranchCode } = await loadBranchMapping();

    const branchColumns = []; // { colIdx, branchCode }[]
    const branches = [];      // header ดิบ (ใช้ตรวจ Format C)

    // Auto-detect branch header row (เหมือน import function)
    const ALL_ZONE_KEYS_P = new Set(Object.keys(ZONE_TO_BRANCHES));
    const BRANCH_CODE_RE_P = /^\d{2}[A-Z]{2}$/;
    let branchHeaderRowIdx = -1;
    let branchStartCol = 3;
    for (let ri = 0; ri <= Math.min(5, rawData.length - 1); ri++) {
      const row = rawData[ri];
      if (!row) continue;
      let matchCount = 0;
      let firstMatchCol = -1;
      for (let col = 2; col < row.length; col++) {
        const v = row[col];
        if (!v || typeof v !== 'string') continue;
        const h = v.trim();
        if (ALL_ZONE_KEYS_P.has(h) || BRANCH_CODE_RE_P.test(h) || suffixToBranchCode[h]) {
          matchCount++;
          if (firstMatchCol === -1) firstMatchCol = col;
        }
      }
      if (matchCount >= 2) { branchHeaderRowIdx = ri; branchStartCol = firstMatchCol; break; }
    }
    // fallback
    if (branchHeaderRowIdx === -1) { branchHeaderRowIdx = 1; branchStartCol = 3; }

    const branchHeaderRow = rawData[branchHeaderRowIdx];
    if (branchHeaderRow) {
      const seenHeaders = new Set();
      for (let col = branchStartCol; col < branchHeaderRow.length; col++) {
        const header = branchHeaderRow[col];
        if (!header || typeof header !== 'string' || !header.trim()) continue;
        const h = header.trim();
        if (seenHeaders.has(h)) break; // หยุดเมื่อเจอ header ซ้ำ
        seenHeaders.add(h);
        branches.push(h);
        if (ZONE_TO_BRANCHES[h]) {
          for (const branchCode of ZONE_TO_BRANCHES[h]) {
            branchColumns.push({ colIdx: col, branchCode });
          }
        } else if (/^\d{2}[A-Z]{2}$/.test(h)) {
          branchColumns.push({ colIdx: col, branchCode: h });
        } else if (suffixToBranchCode[h]) {
          branchColumns.push({ colIdx: col, branchCode: suffixToBranchCode[h] });
        } else {
          branchColumns.push({ colIdx: col, branchCode: h });
        }
      }
    }
    const dataStartRowP = branchHeaderRowIdx;

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
            const calcPctFromPrice = (before, after) => {
              const b = parseFloat(before) || 0, a = parseFloat(after) || 0;
              if (!b || !a || a <= 0 || a >= b) return 0;
              return (b - a) / b;
            };
            const reExVatVal = reExVat ? parseFloat(reExVat[colIdx]) || 0 : 0;

            const getDiscPrice = (rowArr, idx, fallback) => {
              if (!rowArr[idx]) return fallback;
              const v = parseFloat(rowArr[idx][colIdx]);
              return (v && !isNaN(v)) ? v : fallback;
            };

            // กรอง discount ที่ % = 0 และไม่มีราคาหลังลดจริงออก — เก็บ original index
            const realDiscounts = discountPctRows
              .map((r, origIdx) => ({
                pctRow: r,
                priceRow: discountPriceRows[origIdx] || null,
                origIdx
              }))
              .filter(({ pctRow, priceRow }) => {
                const pct = normPct(pctRow[colIdx]);
                const hasPrice = priceRow && parseFloat(priceRow[colIdx]) > 0;
                return pct > 0 || hasPrice;
              });

            const realDiscountPctRows   = realDiscounts.map(d => d.pctRow);
            const realDiscountPriceRows = realDiscounts.map(d => d.priceRow);
            const realNumDiscounts = realDiscounts.length;

            let discPrice1 = 0, discPrice2 = 0, discPrice3 = 0;
            if (realNumDiscounts === 0) {
              discPrice1 = reExVatVal;
            } else if (realNumDiscounts === 1) {
              discPrice1 = getDiscPrice(realDiscountPriceRows, 0, reExVatVal);
            } else if (realNumDiscounts === 2) {
              discPrice1 = getDiscPrice(realDiscountPriceRows, 0, reExVatVal);
              discPrice2 = getDiscPrice(realDiscountPriceRows, 1, reExVatVal);
            } else {
              discPrice1 = getDiscPrice(realDiscountPriceRows, 0, reExVatVal);
              discPrice2 = getDiscPrice(realDiscountPriceRows, 1, reExVatVal);
              discPrice3 = getDiscPrice(realDiscountPriceRows, 2, reExVatVal);
            }

            // คำนวณ % จากราคาจริงเสมอ — ไม่ใช้ค่าจาก Excel
            const discPct1 = (basePrice > 0 && discPrice1 > 0 && discPrice1 < basePrice)
              ? (basePrice - discPrice1) / basePrice : 0;
            const discPct2 = (discPrice1 > 0 && discPrice2 > 0 && discPrice2 < discPrice1)
              ? (discPrice1 - discPrice2) / discPrice1 : 0;
            const discPct3 = (discPrice2 > 0 && discPrice3 > 0 && discPrice3 < discPrice2)
              ? (discPrice2 - discPrice3) / discPrice2 : 0;

            previewRows.push({
              sku,
              productName: skuName,
              brand: brandName,
              branch: firstBranch,
              totalBranches: branchColumns.length,
              numDiscounts: realNumDiscounts,
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

    return { rows: previewRows, allRows: previewRows, totalSkus, totalRows, branches: uniqueBranchCodes };

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

    // Region → branchCodes จาก BranchMaster
    const { zoneToBranches: REGION_BRANCHES, allBranchCodes } = await loadBranchMapping();
    const REGION_COLS = [
      { region:'BKK', reCol:5,  w1Col:21, w2Col:22, r1Col:23, r2Col:24 },
      { region:'N',   reCol:6,  w1Col:26, w2Col:27, r1Col:28, r2Col:29 },
      { region:'NE',  reCol:7,  w1Col:31, w2Col:32, r1Col:33, r2Col:34 },
      { region:'C',   reCol:8,  w1Col:36, w2Col:37, r1Col:38, r2Col:39 },
      { region:'E',   reCol:9,  w1Col:41, w2Col:42, r1Col:43, r2Col:44 },
      { region:'S',   reCol:10, w1Col:46, w2Col:47, r1Col:48, r2Col:49 },
    ];

    // Load StockStatusFact prefix map
    const branchInListP = allBranchCodes.map(b => `'${b}'`).join(',');
    const stockResult = await pool.request().query(`
      SELECT DISTINCT skuNumber, branchCode FROM StockStatusFact
      WHERE category = 'Glass' AND skuNumber LIKE 'G%'
        AND branchCode IN (${branchInListP})
    `);
    // prefix12 → [{skuNumber, branchCode}]
    const skuByPrefix = new Map();
    for (const r of stockResult.recordset) {
      const prefix = r.skuNumber.substring(0, 12);
      if (!skuByPrefix.has(prefix)) skuByPrefix.set(prefix, []);
      skuByPrefix.get(prefix).push({ skuNumber: r.skuNumber, branchCode: r.branchCode });
    }

    const fv = v => parseFloat(v) || 0;
    const allBranches = Object.values(REGION_BRANCHES).flat();

    let currentBrand = '', currentProductName = '';
    const previewRows = [];
    const allRows = [];
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

      const skuList = col0.split(/[\/,]/).map(s => s.trim()).filter(s => /^G\d/.test(s));
      const productName = col1 || currentProductName || currentBrand || 'Glass';
      if (col1) currentProductName = col1;
      const thickness = col2 !== undefined ? String(col2).trim() : '';
      const remark    = row[3] !== undefined ? String(row[3]).trim() : '';
      const fullName  = remark ? `${productName} ${remark} ${thickness}mm` : `${productName} ${thickness}mm`;

      for (const excelSku of skuList) {
        const brandCode = excelSku.substring(1, 3);
        const brandName = brandMap[brandCode] || currentBrand || 'ไม่ระบุ';

        // นับ branches จาก StockStatusFact หรือ fallback 26
        const dbEntries = skuByPrefix.get(excelSku) || [];
        const branchCount = dbEntries.length > 0 ? new Set(dbEntries.map(e => e.branchCode)).size : allBranches.length;

        // ราคาตัวอย่าง BKK (col 21-24)
        const re_bkk = fv(row[5]);
        const w1_bkk = fv(row[21]);
        const w2_bkk = fv(row[22]);
        const r1_bkk = fv(row[23]);
        const r2_bkk = fv(row[24]);

        if (w1_bkk === 0) continue;

        totalSkus++;
        totalRows += branchCount;

        // allRows — expand เป็น full SKU|branch เพื่อเปรียบเทียบกับ DB ได้ถูกต้อง
        if (dbEntries.length > 0) {
          for (const { skuNumber: fullSku, branchCode } of dbEntries) {
            allRows.push({
              sku: fullSku,
              branch: branchCode,
              productName: fullName,
              brand: brandName,
              selling_price_w1: w1_bkk,
              selling_price_w2: w2_bkk,
              selling_price_r1: r1_bkk,
              selling_price_r2: r2_bkk,
            });
          }
        } else {
          // ไม่มีใน DB → ใช้ excelSku + branch ตัวอย่าง
          allRows.push({
            sku: excelSku, branch: '00TR',
            productName: fullName, brand: brandName,
            selling_price_w1: w1_bkk, selling_price_w2: w2_bkk,
            selling_price_r1: r1_bkk, selling_price_r2: r2_bkk,
          });
        }

        const rowData = {
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
        };
        if (previewRows.length < 15) {
          previewRows.push(rowData);
        }
      }
    }

    return { rows: previewRows, allRows, totalSkus, totalRows, branches: allBranches };

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
 * ACC file structure (ACC-NA Internal Memo format):
 *   Row 0-5 : header/memo rows (skip)
 *   Row 6   : main column headers
 *   Row 7   : sub-header row (ซ้ำ header — skip)
 *   Row 8+  : data rows / section headers
 *
 * Column index (0-based):
 *   col A(0) = supplier name (sup)
 *   col B(1) = SKU (รหัส)
 *   col C(2) = product name (รายการ)
 *   col D(3) = color (สี)
 *   col E(4) = unit/pack (บรรจุ/มาตรหน่วย)
 *   col F(5) = base price (ราคาตั้ง)
 *   col G(6) = RE before VAT (RE ก่อน VAT)
 *   col H(7) = selling price incl. VAT (ชุน รวม VAT)
 *   col I(8) = SDM price
 *   col J(9) = W1 price
 *   col K(10)= W2 price
 *   col L(11)= R1 price
 *   col M(12)= R2 price
 *
 * Section headers: rows where col B(1) is empty and col C(2) has a group name
 * =====================================================
 */
function parseAccRows(data) {
  const fv = v => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const rows = [];
  let currentSection = '';

  // Auto-detect header row: หา row ที่มี "รหัส" ใน col B(1) หรือ "รายการ" ใน col C(2)
  // แล้วเริ่ม parse จาก row ถัดไป (ข้าม sub-header อีก 1 row)
  let dataStartRow = 8; // default
  for (let i = 0; i < Math.min(15, data.length); i++) {
    const row = data[i];
    if (!row) continue;
    const c1 = String(row[1] ?? '').trim().toLowerCase();
    const c2 = String(row[2] ?? '').trim().toLowerCase();
    if (c1 === 'รหัส' || c1 === 'sku' || c2 === 'รายการ') {
      dataStartRow = i + 2; // +2 เพราะมี sub-header row ถัดไปอีก 1 แถว
      break;
    }
  }

  // Label keywords ที่ใช้กรอง header/sub-header rows ออก
  const SKIP_LABELS = new Set([
    'รหัส', 'sku', 'sup', 'รายการ', 'สี', 'บรรจุ/มาตรหน่วย', 'บรรจุ',
    'มาตรหน่วย', 'ราคาตั้ง', 're ก่อนvat', 're ก่อน vat', 'ชุน รวม vat',
    'sdm', 'w1', 'w2', 'r1', 'r2',
  ]);

  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const colB = row[1] !== undefined ? String(row[1]).trim() : '';  // SKU
    const colC = row[2] !== undefined ? String(row[2]).trim() : '';  // รายการ
    const colD = row[3] !== undefined ? String(row[3]).trim() : '';  // สี
    const colE = row[4] !== undefined ? String(row[4]).trim() : '';  // หน่วย
    const colF = row[5];   // ราคาตั้ง
    const colG = row[6];   // RE ก่อน VAT
    const colH = row[7];   // ชุน รวม VAT
    const colI = row[8];   // SDM
    const colJ = row[9];   // W1
    const colK = row[10];  // W2
    const colL = row[11];  // R1
    const colM = row[12];  // R2

    const basePrice    = fv(colF);
    const reBeforeVat  = fv(colG);
    const sellingPrice = fv(colH);
    const priceSdm     = fv(colI);
    const priceW1      = fv(colJ);
    const priceW2      = fv(colK);
    const priceR1      = fv(colL);
    const priceR2      = fv(colM);

    // Section header: col B ว่าง, col C มีข้อความ, ไม่มีราคาใดเลย
    if (!colB && colC &&
        basePrice === 0 && reBeforeVat === 0 && sellingPrice === 0 &&
        priceSdm === 0 && priceW1 === 0 && priceW2 === 0 && priceR1 === 0 && priceR2 === 0) {
      const label = colC.toLowerCase();
      if (!SKIP_LABELS.has(label)) {
        currentSection = colC;
      }
      continue;
    }

    // ต้องมี SKU ใน col B
    if (!colB) continue;

    // กรอง header/label rows ออก
    if (SKIP_LABELS.has(colB.toLowerCase())) continue;

    // ข้ามแถวที่ไม่มีราคาใดเลย
    if (basePrice === 0 && reBeforeVat === 0 && sellingPrice === 0 &&
        priceSdm === 0 && priceW1 === 0 && priceW2 === 0 && priceR1 === 0 && priceR2 === 0) continue;

    // col B อาจมีหลาย SKU คั่นด้วย newline, comma, หรือ /
    // แต่ต้อง normalize N/A ก่อน split เพื่อไม่ให้ถูกตีความเป็น SKU
    const normalizedColB = colB.replace(/\bN\/A\b/gi, '').trim();
    if (!normalizedColB) continue;

    const rawSkus = normalizedColB.split(/[\n,\/]/).map(s => s.trim()).filter(s => s.length >= 3);
    if (rawSkus.length === 0) continue;

    const productName  = colC || currentSection || 'Accessories';
    const displayName  = colD ? `${productName} ${colD}`.trim() : productName;

    for (const sku of rawSkus) {
      if (!sku) continue;
      rows.push({
        sku,
        productName: displayName,
        section: currentSection,
        unit: colE,
        basePrice,
        reBeforeVat,
        sellingPrice,
        priceSdm,
        priceW1,
        priceW2,
        priceR1,
        priceR2,
      });
    }
  }

  return rows;
}

/**
 * =====================================================
 * Helper: Import Accessories (ACC) Data from Excel Buffer
 * =====================================================
 * ACC ราคาเดียวใช้ทุกสาขา — expand 1 SKU → N rows (1 row ต่อสาขาจาก BranchMaster)
 */
async function importAccessoriesData(pool, excelBuffer, sheetName, logId = null) {
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

    // Load brand name from Accessory_BRAND — ACC มีแบรนด์เดียว ดึงมาใช้ตรงๆ
    let accBrandName = '';
    try {
      const brandResult = await pool.request().query(`SELECT TOP 1 BRAND_NAME FROM Accessory_BRAND`);
      accBrandName = brandResult.recordset[0]?.BRAND_NAME || '';
      console.log(`[ACC Parser] Brand: ${accBrandName}`);
    } catch (e) {
      console.warn(`[ACC Parser] Could not load Accessory_BRAND: ${e.message}`);
    }

    // Load all branch codes from BranchMaster
    const { allBranchCodes } = await loadBranchMapping();
    console.log(`[ACC Parser] Branch codes loaded: ${allBranchCodes.length} branches`);

    // Check DB columns
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'excel_import_data'
    `);
    const dbCols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = dbCols.includes('selling_price_w1');
    const hasSellingPriceSdm = dbCols.includes('selling_price_sdm');

    // Parse Excel rows
    const parsedRows = parseAccRows(data);
    console.log(`[ACC Parser] Parsed ${parsedRows.length} SKU rows → expanding to ${parsedRows.length * allBranchCodes.length} rows`);

    // โหลด productName จาก StockStatusFact: sku → productName (ใช้ชื่อจาก DB แทน Excel)
    console.log('[ACC Parser] Loading productName from StockStatusFact...');
    const accSkuList = parsedRows.map(r => `'${r.sku.replace(/'/g, "''")}'`).join(',');
    const accSkuNameMap = {}; // sku → productName
    if (parsedRows.length > 0) {
      try {
        const accSkuNameResult = await pool.request().query(`
          SELECT DISTINCT skuNumber, productName
          FROM StockStatusFact
          WHERE skuNumber IN (${accSkuList})
        `);
        accSkuNameResult.recordset.forEach(r => {
          if (r.skuNumber && r.productName) accSkuNameMap[r.skuNumber] = r.productName;
        });
        console.log(`[ACC Parser] Loaded ${Object.keys(accSkuNameMap).length} SKU names from StockStatusFact`);
      } catch (e) {
        console.warn(`[ACC Parser] Could not load SKU names from StockStatusFact: ${e.message}`);
      }
    }

    // Build insert rows — expand 1 SKU → 1 row ต่อสาขา (ราคาเหมือนกันทุกสาขา)
    const insertRows = [];
    for (const pr of parsedRows) {
      // เฉพาะ SKU ที่มีใน StockStatusFact เท่านั้น
      if (!accSkuNameMap[pr.sku]) {
        console.warn(`[ACC Parser] SKU "${pr.sku}" not found in StockStatusFact, skipping`);
        continue;
      }
      const brand = accBrandName;
      const productName = accSkuNameMap[pr.sku]; // ใช้ชื่อจาก DB เสมอ
      for (const branchCode of allBranchCodes) {
        insertRows.push({
          branch:       branchCode,
          sku:          pr.sku,
          productName,
          brand,
          unit:         pr.unit,
          basePrice:    pr.basePrice,
          reBeforeVat:  pr.reBeforeVat,
          sellingPrice: pr.sellingPrice,
          priceSdm:     pr.priceSdm,
          priceW1:      pr.priceW1,
          priceW2:      pr.priceW2,
          priceR1:      pr.priceR1,
          priceR2:      pr.priceR2,
        });
      }
    }

    console.log(`[ACC Parser] Prepared ${insertRows.length} rows, inserting in batches...`);

    // Batch insert 200 rows
    const BATCH_SIZE = 200;

    // Column mapping (ACC-NA format):
    //   base_price         = ราคาตั้ง (col F)
    //   discount_price_1   = RE ก่อน VAT (col G)
    //   selling_price_sdm  = SDM (col I)
    //   selling_price_w1   = W1 (col J)
    //   selling_price_w2   = W2 (col K)
    //   selling_price_r1   = R1 (col L)
    //   selling_price_r2   = R2 (col M)
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
        req.input(`sdm${idx}`,         sql.Decimal(18,2), r.priceSdm);
        req.input(`w1${idx}`,          sql.Decimal(18,2), r.priceW1);
        req.input(`w2${idx}`,          sql.Decimal(18,2), r.priceW2);
        req.input(`r1${idx}`,          sql.Decimal(18,2), r.priceR1);
        req.input(`r2${idx}`,          sql.Decimal(18,2), r.priceR2);
        req.input(`logId${idx}`,       sql.Int,           logId);

        if (hasSellingPrices && hasSellingPriceSdm) {
          valueParts.push(
            `(@branch${idx},'Accessories',@sku${idx},@productName${idx},@brand${idx},@unit${idx},` +
            `@basePrice${idx},@reVat${idx},0,0,'',0,0,0,0,0,'',` +
            `@w1${idx},@w2${idx},@r1${idx},@r2${idx},@logId${idx},@sdm${idx})`
          );
        } else if (hasSellingPrices) {
          valueParts.push(
            `(@branch${idx},'Accessories',@sku${idx},@productName${idx},@brand${idx},@unit${idx},` +
            `@basePrice${idx},@reVat${idx},0,0,'',0,0,0,0,0,'',` +
            `@w1${idx},@w2${idx},@r1${idx},@r2${idx},@logId${idx})`
          );
        } else {
          valueParts.push(
            `(@branch${idx},'Accessories',@sku${idx},@productName${idx},@brand${idx},@unit${idx},` +
            `@basePrice${idx},@reVat${idx},0,0,'',0,0,0,0,0,'',@logId${idx})`
          );
        }
      });

      const insertCols = hasSellingPrices && hasSellingPriceSdm
        ? `branch, product_type, sku, product_name, brand, unit,
           base_price, discount_price_1, discount_price_2, discount_price_3,
           project_no, project_discount_1, project_discount_2, project_price,
           carton_price, shipping_cost, free_item,
           selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, import_log_id,
           selling_price_sdm`
        : hasSellingPrices
        ? `branch, product_type, sku, product_name, brand, unit,
           base_price, discount_price_1, discount_price_2, discount_price_3,
           project_no, project_discount_1, project_discount_2, project_price,
           carton_price, shipping_cost, free_item,
           selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, import_log_id`
        : `branch, product_type, sku, product_name, brand, unit,
           base_price, discount_price_1, discount_price_2, discount_price_3,
           project_no, project_discount_1, project_discount_2, project_price,
           carton_price, shipping_cost, free_item, import_log_id`;

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
              .input('sdm',         sql.Decimal(18,2), r.priceSdm)
              .input('w1',          sql.Decimal(18,2), r.priceW1)
              .input('w2',          sql.Decimal(18,2), r.priceW2)
              .input('r1',          sql.Decimal(18,2), r.priceR1)
              .input('r2',          sql.Decimal(18,2), r.priceR2)
              .input('logId',       sql.Int,           logId);

            if (hasSellingPrices && hasSellingPriceSdm) {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Accessories',@sku,@productName,@brand,@unit,
                        @basePrice,@reVat,0,0,'',0,0,0,0,0,'',
                        @w1,@w2,@r1,@r2,@logId,@sdm)
              `);
            } else if (hasSellingPrices) {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Accessories',@sku,@productName,@brand,@unit,
                        @basePrice,@reVat,0,0,'',0,0,0,0,0,'',
                        @w1,@w2,@r1,@r2,@logId)
              `);
            } else {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Accessories',@sku,@productName,@brand,@unit,
                        @basePrice,@reVat,0,0,'',0,0,0,0,0,'',@logId)
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

    // Load all branch codes from BranchMaster
    const { allBranchCodes } = await loadBranchMapping();

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Debug: log 15 rows แรกเพื่อดู format จริง
    console.log(`[ACC Preview] Sheet: ${sheetName}, total rows: ${data.length}`);
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      const cols = row.slice(0, 13).map((v, ci) => `[${ci}]=${JSON.stringify(v)}`).join(' | ');
      console.log(`  row${i}: ${cols}`);
    }

    const parsedRows = parseAccRows(data);
    console.log(`[ACC Preview] parsedRows: ${parsedRows.length}, branches: ${allBranchCodes.length}`);
    if (parsedRows.length > 0) {
      console.log(`[ACC Preview] first parsed:`, JSON.stringify(parsedRows[0]));
    }

    const previewRows = [];
    const allRows = [];
    const totalSkus = parsedRows.length;
    const totalRows = parsedRows.length * allBranchCodes.length;

    for (const pr of parsedRows) {
      const brandName = brandMap[pr.sku.substring(1, 3)] || '';

      const rowData = {
        sku:              pr.sku,
        productName:      pr.productName,
        brand:            brandName,
        unit:             pr.unit,
        branch:           `ทุกสาขา (${allBranchCodes.length})`,
        totalBranches:    allBranchCodes.length,
        base_price:       pr.basePrice,
        discount_price_1: pr.reBeforeVat,
        discount_price_2: 0,
        discount_price_3: 0,
        selling_price_sdm: pr.priceSdm,
        selling_price_w1: pr.priceW1,
        selling_price_w2: pr.priceW2,
        selling_price_r1: pr.priceR1,
        selling_price_r2: pr.priceR2,
      };
      allRows.push(rowData);
      // แสดง preview เฉพาะ row แรก (สาขาแรก) ต่อ SKU เพื่อไม่ให้ preview ยาวเกิน
      if (previewRows.length < 15) {
        previewRows.push(rowData);
      }
    }

    return { rows: previewRows, allRows, totalSkus, totalRows, branches: allBranchCodes };

  } catch (err) {
    console.error('[ACC Preview] Fatal error:', err);
    return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
  }
}

/**
 * =====================================================
 * GET /api/excel/draft/:logId
 * ดูข้อมูล draft ของ logId นั้น
 * =====================================================
 */
export async function getDraftData(req, res) {
  try {
    const { logId } = req.params;
    const { page = 1, limit = 50, branch, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const pool = await getPool();

    // ตรวจสอบว่า log นี้มี draft อยู่ไหม
    const logResult = await pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .query(`
        SELECT l.id, l.product_type, l.version_label, l.imported_rows, l.status, l.imported_at,
               COUNT(d.id) AS draft_count
        FROM excel_import_logs l
        LEFT JOIN excel_import_data d ON d.import_log_id = l.id AND d.status = 'draft'
        WHERE l.id = @logId
        GROUP BY l.id, l.product_type, l.version_label, l.imported_rows, l.status, l.imported_at
      `);

    if (!logResult.recordset.length) {
      return res.status(404).json({ message: 'ไม่พบ draft นี้' });
    }
    const logInfo = logResult.recordset[0];

    // ดึงข้อมูล draft
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');
    const hasDiscPct = cols.includes('discount_pct_1');

    let whereParts = [`d.[import_log_id] = @logId`, `d.[status] = 'draft'`];
    if (branch) whereParts.push(`d.[branch] = @branch`);
    if (search) whereParts.push(`(d.[sku] LIKE @search OR d.[product_name] LIKE @search OR d.[brand] LIKE @search)`);
    const whereStr = `WHERE ${whereParts.join(' AND ')}`;

    const countReq = pool.request().input('logId', sql.Int, parseInt(logId));
    if (branch) countReq.input('branch', sql.NVarChar(100), branch);
    if (search) countReq.input('search', sql.NVarChar(255), `%${search}%`);
    const countResult = await countReq.query(`SELECT COUNT(*) AS total FROM excel_import_data d ${whereStr}`);
    const total = countResult.recordset[0].total;

    const sellingCols = hasSellingPrices
      ? `d.[selling_price_w1] AS [sellingPriceW1], d.[selling_price_w2] AS [sellingPriceW2],
         d.[selling_price_r1] AS [sellingPriceR1], d.[selling_price_r2] AS [sellingPriceR2],`
      : `NULL AS [sellingPriceW1], NULL AS [sellingPriceW2], NULL AS [sellingPriceR1], NULL AS [sellingPriceR2],`;
    const discPctCols = hasDiscPct
      ? `CASE WHEN d.[discount_pct_1] > 1 THEN d.[discount_pct_1]/100.0 ELSE d.[discount_pct_1] END AS [discountPct1],
         CASE WHEN d.[discount_pct_2] > 1 THEN d.[discount_pct_2]/100.0 ELSE d.[discount_pct_2] END AS [discountPct2],
         CASE WHEN d.[discount_pct_3] > 1 THEN d.[discount_pct_3]/100.0 ELSE d.[discount_pct_3] END AS [discountPct3],`
      : `NULL AS [discountPct1], NULL AS [discountPct2], NULL AS [discountPct3],`;

    const dataReq = pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .input('limit', sql.Int, parseInt(limit))
      .input('offset', sql.Int, offset);
    if (branch) dataReq.input('branch', sql.NVarChar(100), branch);
    if (search) dataReq.input('search', sql.NVarChar(255), `%${search}%`);

    const result = await dataReq.query(`
      SELECT d.[id], d.[branch], d.[product_type] AS [productType],
        d.[sku], d.[product_name] AS [productName], d.[brand], d.[unit],
        d.[base_price] AS [basePrice],
        d.[discount_price_1] AS [discountPrice1],
        d.[discount_price_2] AS [discountPrice2],
        d.[discount_price_3] AS [discountPrice3],
        ${discPctCols}
        ${sellingCols}
        d.[status], d.[created_at] AS [createdAt]
      FROM excel_import_data d
      ${whereStr}
      ORDER BY d.[sku], d.[branch]
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      logInfo,
      data: result.recordset,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('getDraftData error:', err);
    res.status(500).json({ message: err.message });
  }
}

/**
 * =====================================================
 * PUT /api/excel/draft/:logId/rows/:rowId
 * แก้ไขราคาใน draft row
 * =====================================================
 */
export async function updateDraftRow(req, res) {
  try {
    const { logId, rowId } = req.params;
    const { base_price, discount_price_1, discount_price_2, discount_price_3,
            selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2 } = req.body;
    const pool = await getPool();

    // ตรวจสอบว่า row นี้เป็น draft ของ logId นี้จริง
    const check = await pool.request()
      .input('id', sql.Int, parseInt(rowId))
      .input('logId', sql.Int, parseInt(logId))
      .query(`SELECT id FROM excel_import_data WHERE id = @id AND import_log_id = @logId AND status = 'draft'`);
    if (!check.recordset.length) {
      return res.status(404).json({ message: 'ไม่พบ row นี้ใน draft' });
    }

    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');

    const req2 = pool.request().input('id', sql.Int, parseInt(rowId));
    const setCols = [];

    if (base_price       !== undefined) { req2.input('bp',  sql.Decimal(18,2), parseFloat(base_price)       || 0); setCols.push('[base_price] = @bp'); }
    if (discount_price_1 !== undefined) { req2.input('dp1', sql.Decimal(18,2), parseFloat(discount_price_1) || 0); setCols.push('[discount_price_1] = @dp1'); }
    if (discount_price_2 !== undefined) { req2.input('dp2', sql.Decimal(18,2), parseFloat(discount_price_2) || 0); setCols.push('[discount_price_2] = @dp2'); }
    if (discount_price_3 !== undefined) { req2.input('dp3', sql.Decimal(18,2), parseFloat(discount_price_3) || 0); setCols.push('[discount_price_3] = @dp3'); }
    if (hasSellingPrices) {
      if (selling_price_w1 !== undefined) { req2.input('sw1', sql.Decimal(18,2), parseFloat(selling_price_w1) || 0); setCols.push('[selling_price_w1] = @sw1'); }
      if (selling_price_w2 !== undefined) { req2.input('sw2', sql.Decimal(18,2), parseFloat(selling_price_w2) || 0); setCols.push('[selling_price_w2] = @sw2'); }
      if (selling_price_r1 !== undefined) { req2.input('sr1', sql.Decimal(18,2), parseFloat(selling_price_r1) || 0); setCols.push('[selling_price_r1] = @sr1'); }
      if (selling_price_r2 !== undefined) { req2.input('sr2', sql.Decimal(18,2), parseFloat(selling_price_r2) || 0); setCols.push('[selling_price_r2] = @sr2'); }
    }

    if (!setCols.length) return res.status(400).json({ message: 'ไม่มีฟิลด์ที่จะแก้ไข' });
    setCols.push('[updated_at] = GETDATE()');

    await req2.query(`UPDATE excel_import_data SET ${setCols.join(', ')} WHERE id = @id`);
    res.json({ success: true });
  } catch (err) {
    console.error('updateDraftRow error:', err);
    res.status(500).json({ message: err.message });
  }
}

/**
 * =====================================================
 * POST /api/excel/draft/:logId/publish
 * Publish draft → เปลี่ยน status เป็น published
 * =====================================================
 */
export async function publishDraft(req, res) {
  try {
    const { logId } = req.params;
    const pool = await getPool();

    // ตรวจสอบว่ามี draft อยู่
    const check = await pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .query(`SELECT COUNT(*) AS cnt FROM excel_import_data WHERE import_log_id = @logId AND status = 'draft'`);
    if (!check.recordset[0].cnt) {
      return res.status(404).json({ message: 'ไม่พบ draft นี้ หรือ publish ไปแล้ว' });
    }

    // Publish: เปลี่ยน status เป็น published
    const r = await pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .query(`UPDATE excel_import_data SET status = 'published' WHERE import_log_id = @logId AND status = 'draft'`);

    // อัปเดต log status
    await pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .query(`UPDATE excel_import_logs SET status = 'published' WHERE id = @logId`);

    res.json({ success: true, published: r.rowsAffected[0] });
  } catch (err) {
    console.error('publishDraft error:', err);
    res.status(500).json({ message: err.message });
  }
}

/**
 * =====================================================
 * DELETE /api/excel/draft/:logId
 * ยกเลิก draft — ลบข้อมูล draft ออก
 * =====================================================
 */
export async function discardDraft(req, res) {
  try {
    const { logId } = req.params;
    const pool = await getPool();

    const r = await pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .query(`DELETE FROM excel_import_data WHERE import_log_id = @logId AND status = 'draft'`);

    await pool.request()
      .input('logId', sql.Int, parseInt(logId))
      .query(`UPDATE excel_import_logs SET status = 'discarded', imported_rows = 0 WHERE id = @logId`);

    res.json({ success: true, deleted: r.rowsAffected[0] });
  } catch (err) {
    console.error('discardDraft error:', err);
    res.status(500).json({ message: err.message });
  }
}

/**
 * =====================================================
 * Helper: Parse Sealant rows from Price List sheet
 *
 * โครงสร้าง Price List:
 *   row 0-8  : header / คำอธิบาย
 *   row 9+   : ข้อมูลสินค้า
 *     col[1] = Supplier name
 *     col[2] = ชื่อสินค้า  ← ใช้ match กับ Ref sheet
 *     col[3] = RE Exclude VAT (base_price = ราคาตั้ง)
 *     col[4] = RE Include VAT (ไม่ใช้)
 *     col[5] = W1
 *     col[6] = W2
 *     col[7] = R1
 *     col[8] = R2
 *
 * Ref sheet:
 *   row 0    = ชื่อสินค้า (column headers)
 *   row 1+   = SKU codes (หลายตัวต่อสินค้า 1 ชื่อ)
 *
 * ราคาเดียวทุกสาขา ยกเว้น Silicone ที่มีราคาแยก กรุงเทพฯ vs ต่างจังหวัด
 * =====================================================
 */
function parseSealantSheet(workbook) {
  const fv = v => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // ---- Build name → SKUs map from Ref sheet ----
  const refSheet = workbook.Sheets['Ref.'];
  const nameToSkus = {};
  if (refSheet) {
    const refData = XLSX.utils.sheet_to_json(refSheet, { header: 1, defval: '' });
    const nameRow = refData[0] || [];
    const skuRows = refData.slice(1);
    nameRow.forEach((name, col) => {
      if (!name) return;
      const skus = skuRows
        .map(r => String(r[col] ?? '').trim())
        .filter(v => v.startsWith('S') && v.length > 5);
      nameToSkus[String(name).trim()] = skus;
    });
  }

  // ---- Parse Price List sheet ----
  const priceSheet = workbook.Sheets['Price List'];
  if (!priceSheet) return [];

  const data = XLSX.utils.sheet_to_json(priceSheet, { header: 1, defval: '' });

  // Keywords ที่บ่งบอกว่าเป็น header row ให้ข้าม
  const HEADER_KEYWORDS = [
    'supplier', 'ราคาขาย', 'ราคา re', 'ราคา', 'w1', 'w2', 'r1', 'r2',
    'exclude', 'include', 'ร้านค้า', 'attn', 'cc :', 'หมายเหตุ', 'internal'
  ];

  const rows = [];
  for (let i = 9; i < data.length; i++) {
    const row = data[i];
    const col2 = String(row[2] ?? '').trim();  // ชื่อสินค้า
    const col1 = String(row[1] ?? '').trim();  // Supplier

    if (!col2) continue;

    // ข้าม header rows
    if (HEADER_KEYWORDS.some(k => col2.toLowerCase().includes(k))) continue;

    const w1 = fv(row[5]);
    const w2 = fv(row[6]);
    const r1 = fv(row[7]);
    const r2 = fv(row[8]);

    // ข้ามแถวที่ไม่มีราคาใดเลย (สินค้าหยุดจำหน่าย)
    if (w1 === 0 && w2 === 0 && r1 === 0 && r2 === 0) continue;

    const skus = nameToSkus[col2] || [];
    if (skus.length === 0) {
      console.warn(`[Sealant Parser] No SKU found for product: "${col2}", skipping`);
      continue;
    }

    // ตรวจว่าเป็น Silicone กรุงเทพฯ หรือ ต่างจังหวัด
    const isBkk = col2.includes('กรุงเทพ') || col2.includes('กรุงเทพฯ');
    const isUpcountry = col2.includes('ต่างจังหวัด');

    rows.push({
      productName: col2,
      supplier:    col1,
      basePrice:   fv(row[3]),  // col[3] = RE Exclude VAT = ราคาตั้ง
      w1, w2, r1, r2,
      skus,
      isBkk,
      isUpcountry,
    });
  }

  return rows;
}

/**
 * =====================================================
 * Helper: Import Sealant Data from Excel Buffer
 * =====================================================
 * ราคาเดียวทุกสาขา ยกเว้น Silicone ที่แยก BKK vs ต่างจังหวัด
 * expand: 1 ชื่อสินค้า × N SKU × N สาขา
 */
async function importSealantData(pool, excelBuffer, sheetName, logId = null) {
  let imported = 0;

  try {
    console.log(`[Sealant Parser] Starting import for sheet: ${sheetName}`);

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const parsedRows = parseSealantSheet(workbook);
    console.log(`[Sealant Parser] Parsed ${parsedRows.length} product rows`);

    if (parsedRows.length === 0) return 0;

    // Load brand mapping จาก BRAND_Sealant (BRAND_NO = sku.substring(1,3))
    const brandMap = {};
    try {
      const brandResult = await pool.request().query(`
        SELECT BRAND_NO, BRAND_NAME FROM BRAND_Sealant
      `);
      brandResult.recordset.forEach(r => {
        brandMap[String(r.BRAND_NO).padStart(2, '0')] = r.BRAND_NAME;
      });
      console.log(`[Sealant Parser] Brand map loaded: ${Object.keys(brandMap).length} brands`);
    } catch (e) {
      console.warn(`[Sealant Parser] Could not load BRAND_Sealant: ${e.message}`);
    }

    // Load branch mapping
    const { allBranchCodes, zoneToBranches } = await loadBranchMapping();
    const bkkBranches = new Set(zoneToBranches.BKK || []);
    console.log(`[Sealant Parser] Branches: ${allBranchCodes.length} total, ${bkkBranches.size} BKK`);

    // Load productName from StockStatusFact (ใช้ชื่อจาก DB แทน Excel)
    const allSkus = [...new Set(parsedRows.flatMap(r => r.skus))];
    const skuNameMap = {};
    if (allSkus.length > 0) {
      try {
        const skuInList = allSkus.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const nameResult = await pool.request().query(`
          SELECT DISTINCT skuNumber, productName
          FROM StockStatusFact
          WHERE skuNumber IN (${skuInList})
        `);
        nameResult.recordset.forEach(r => {
          if (r.skuNumber && r.productName) skuNameMap[r.skuNumber] = r.productName;
        });
        console.log(`[Sealant Parser] Loaded ${Object.keys(skuNameMap).length} SKU names from StockStatusFact`);
      } catch (e) {
        console.warn(`[Sealant Parser] Could not load SKU names: ${e.message}`);
      }
    }

    // Check DB columns
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'excel_import_data'
    `);
    const dbCols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices    = dbCols.includes('selling_price_w1');
    const hasSellingPriceSdm  = dbCols.includes('selling_price_sdm');

    // Build insert rows
    const insertRows = [];
    for (const pr of parsedRows) {
      // กำหนดสาขาที่จะ expand ตาม BKK/ต่างจังหวัด
      let targetBranches;
      if (pr.isBkk) {
        targetBranches = allBranchCodes.filter(b => bkkBranches.has(b));
      } else if (pr.isUpcountry) {
        targetBranches = allBranchCodes.filter(b => !bkkBranches.has(b));
      } else {
        targetBranches = allBranchCodes; // ราคาเดียวทุกสาขา
      }

      for (const sku of pr.skus) {
        // ข้าม SKU ที่ไม่มีใน StockStatusFact
        if (!skuNameMap[sku]) {
          console.warn(`[Sealant Parser] SKU "${sku}" not found in StockStatusFact, skipping`);
          continue;
        }
        const productName = skuNameMap[sku];
        // map brand จาก BRAND_Sealant โดยใช้ sku.substring(1,3) เป็น BRAND_NO
        const brandNo   = sku.substring(1, 3);
        const brandName = brandMap[brandNo] || '';

        for (const branchCode of targetBranches) {
          insertRows.push({
            branch:      branchCode,
            sku,
            productName,
            brand:       brandName,
            basePrice:   pr.basePrice,
            w1:          pr.w1,
            w2:          pr.w2,
            r1:          pr.r1,
            r2:          pr.r2,
          });
        }
      }
    }

    console.log(`[Sealant Parser] Prepared ${insertRows.length} rows, inserting in batches...`);

    // Column definitions
    const insertCols = hasSellingPrices && hasSellingPriceSdm
      ? `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item,
         selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2,
         import_log_id, selling_price_sdm`
      : hasSellingPrices
      ? `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item,
         selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, import_log_id`
      : `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item, import_log_id`;

    const BATCH_SIZE = 200;
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
        req.input(`logId${idx}`,       sql.Int,           logId);

        if (hasSellingPrices && hasSellingPriceSdm) {
          valueParts.push(
            `(@branch${idx},'Sealant',@sku${idx},@productName${idx},@brand${idx},'',` +
            `@basePrice${idx},0,0,0,'',0,0,0,0,0,'',` +
            `@w1_${idx},@w2_${idx},@r1_${idx},@r2_${idx},@logId${idx},0)`
          );
        } else if (hasSellingPrices) {
          valueParts.push(
            `(@branch${idx},'Sealant',@sku${idx},@productName${idx},@brand${idx},'',` +
            `@basePrice${idx},0,0,0,'',0,0,0,0,0,'',` +
            `@w1_${idx},@w2_${idx},@r1_${idx},@r2_${idx},@logId${idx})`
          );
        } else {
          valueParts.push(
            `(@branch${idx},'Sealant',@sku${idx},@productName${idx},@brand${idx},'',` +
            `@basePrice${idx},0,0,0,'',0,0,0,0,0,'',@logId${idx})`
          );
        }
      });

      try {
        await req.query(`INSERT INTO excel_import_data (${insertCols}) VALUES ${valueParts.join(',')}`);
        imported += batch.length;
        console.log(`[Sealant Parser] Inserted ${imported}/${insertRows.length}`);
      } catch (err) {
        console.error(`[Sealant Parser] Batch insert error at ${batchStart}:`, err.message);
        // Fallback: insert row by row
        for (const r of batch) {
          try {
            const singleReq = pool.request()
              .input('branch',      sql.NVarChar(100), r.branch)
              .input('sku',         sql.NVarChar(50),  r.sku)
              .input('productName', sql.NVarChar(255), r.productName)
              .input('brand',       sql.NVarChar(100), r.brand)
              .input('basePrice',   sql.Decimal(18,2), r.basePrice)
              .input('w1',          sql.Decimal(18,2), r.w1)
              .input('w2',          sql.Decimal(18,2), r.w2)
              .input('r1',          sql.Decimal(18,2), r.r1)
              .input('r2',          sql.Decimal(18,2), r.r2)
              .input('logId',       sql.Int,           logId);

            if (hasSellingPrices && hasSellingPriceSdm) {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Sealant',@sku,@productName,@brand,'',
                        @basePrice,0,0,0,'',0,0,0,0,0,'',@w1,@w2,@r1,@r2,@logId,0)
              `);
            } else if (hasSellingPrices) {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Sealant',@sku,@productName,@brand,'',
                        @basePrice,0,0,0,'',0,0,0,0,0,'',@w1,@w2,@r1,@r2,@logId)
              `);
            } else {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'Sealant',@sku,@productName,@brand,'',
                        @basePrice,0,0,0,'',0,0,0,0,0,'',@logId)
              `);
            }
            imported++;
          } catch (e2) {
            console.error(`[Sealant Parser] Row insert error (${r.branch}/${r.sku}):`, e2.message);
          }
        }
      }
    }

    console.log(`[Sealant Parser] Done: ${imported} rows inserted`);
    return imported;

  } catch (err) {
    console.error('[Sealant Parser] Fatal error:', err);
    return 0;
  }
}

/**
 * =====================================================
 * Helper: Preview Sealant Data
 * =====================================================
 */
async function previewSealantData(excelBuffer, sheetName) {
  try {
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    const parsedRows = parseSealantSheet(workbook);

    const pool = await getPool();

    // Load brand mapping จาก BRAND_Sealant
    const brandMap = {};
    try {
      const brandResult = await pool.request().query(`
        SELECT BRAND_NO, BRAND_NAME FROM BRAND_Sealant
      `);
      brandResult.recordset.forEach(r => {
        brandMap[String(r.BRAND_NO).padStart(2, '0')] = r.BRAND_NAME;
      });
    } catch (e) {
      console.warn(`[Sealant Preview] Could not load BRAND_Sealant: ${e.message}`);
    }

    const { allBranchCodes, zoneToBranches } = await loadBranchMapping();
    const bkkBranches = new Set(zoneToBranches.BKK || []);

    const previewRows = [];
    const allRows = [];
    let totalSkus = 0;

    for (const pr of parsedRows) {
      let targetBranches;
      if (pr.isBkk) {
        targetBranches = allBranchCodes.filter(b => bkkBranches.has(b));
      } else if (pr.isUpcountry) {
        targetBranches = allBranchCodes.filter(b => !bkkBranches.has(b));
      } else {
        targetBranches = allBranchCodes;
      }

      for (const sku of pr.skus) {
        totalSkus++;
        const brandNo   = sku.substring(1, 3);
        const brandName = brandMap[brandNo] || '';
        const rowData = {
          sku,
          productName:      pr.productName,
          brand:            brandName,
          unit:             '',
          branch:           pr.isBkk
            ? `กรุงเทพฯ (${targetBranches.length})`
            : pr.isUpcountry
            ? `ต่างจังหวัด (${targetBranches.length})`
            : `ทุกสาขา (${targetBranches.length})`,
          totalBranches:    targetBranches.length,
          base_price:       pr.basePrice,  // RE Exclude VAT col[3]
          discount_price_1: 0,
          discount_price_2: 0,
          discount_price_3: 0,
          selling_price_w1: pr.w1,
          selling_price_w2: pr.w2,
          selling_price_r1: pr.r1,
          selling_price_r2: pr.r2,
        };
        allRows.push(rowData);
        if (previewRows.length < 20) previewRows.push(rowData);
      }
    }

    const totalRows = allRows.reduce((sum, r) => sum + r.totalBranches, 0);
    return { rows: previewRows, allRows, totalSkus, totalRows, branches: allBranchCodes };

  } catch (err) {
    console.error('[Sealant Preview] Fatal error:', err);
    return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
  }
}


/**
 * =====================================================
 * Helper: Parse C-Line price sheet
 * =====================================================
 * Column mapping (0-indexed):
 *   [0]  A = น้ำหนัก kg  (ใช้ detect data row — ต้องเป็นตัวเลข > 0)
 *   [1]  B = ชื่อสินค้า  → lookup ใน Ref. sheet เพื่อหา SKU
 *   [2]  C = RE (ราคาทุนก่อน VAT) = base_price
 *   [3]  D = RE inv. (รวม VAT)
 *   [5]  F = SDM price
 *   [6]  G = SDM margin %  (ข้าม)
 *   [7]  H = W1 price
 *   [8]  I = W1 margin %  (ข้าม)
 *   [9]  J = W2 price
 *   [10] K = W2 margin %  (ข้าม)
 *   [11] L = R2 price
 *   [12] M = R2 margin %  (ข้าม)
 *   [13] N = R1 price
 *   [14] O = R1 margin %  (ข้าม)
 *
 * Row 6 (index 5): label row — F="SDM", H="W1", J="W2", L="R2", N="R1"
 * Row 7 (index 6): sub-header — B="ชื่อสินค้า", C="RE", D="RE inv."
 * Row 8+ (index 7+): section headers (col A ว่าง, col B มีข้อความ, ไม่มีราคา)
 *                    และ data rows (col A = น้ำหนัก เป็นตัวเลข)
 *
 * Ref. sheet: row 0 = ชื่อสินค้า (columns), row 1 = SKU เต็ม 18 หลัก
 *             (เหมือน Gypsum Sheet1 lookup)
 *
 * มี 2 sheet ราคา แยกตามภาค:
 *   BKK-C-E → BKK + ภาคกลาง + ภาคตะวันออก
 *   N-NE-S  → ภาคเหนือ + ภาคตะวันออกเฉียงเหนือ + ภาคใต้ + ภาคตะวันตก
 */
function parseCLineSheet(workbook, sheetName) {
  const fv = v => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];

  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const rows = [];

  // เริ่ม parse จาก row index 7 (row 8 ใน Excel — ข้าม header 6 แถว)
  for (let i = 7; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const colA = row[0]; // น้ำหนัก kg
    const colB = row[1] !== undefined ? String(row[1]).trim() : '';

    // Data row: col A ต้องเป็นตัวเลข > 0
    const weight = parseFloat(colA);
    if (!colA || isNaN(weight) || weight <= 0) continue;
    if (!colB) continue;

    const sdm = fv(row[5]);
    const w1  = fv(row[7]);
    const w2  = fv(row[9]);
    const r2  = fv(row[11]); // col L = R2
    const r1  = fv(row[13]); // col N = R1

    // ข้ามแถวที่ไม่มีราคาใดเลย
    if (sdm === 0 && w1 === 0 && w2 === 0 && r1 === 0 && r2 === 0) continue;

    rows.push({
      productName: colB,
      re:          fv(row[2]),  // C = RE ก่อน VAT
      reInv:       fv(row[3]),  // D = RE inv.
      sdm,
      w1,
      w2,
      r1,
      r2,
    });
  }

  return rows;
}

/**
 * Build name→SKU map from Ref. sheet
 * Ref. sheet: row 0 = ชื่อสินค้า (columns), row 1 = SKU เต็ม 18 หลัก
 * Returns: Map<productName, string>  (1 ชื่อ → 1 SKU)
 */
function buildCLineRefMap(workbook) {
  const nameToSku = new Map();
  const refSheet = workbook.Sheets['Ref.'];
  if (!refSheet) return nameToSku;

  const refData = XLSX.utils.sheet_to_json(refSheet, { header: 1, defval: '' });
  const nameRow = refData[0] || [];
  const skuRow  = refData[1] || [];

  nameRow.forEach((name, col) => {
    if (!name) return;
    const sku = String(skuRow[col] ?? '').trim();
    if (!sku || !sku.startsWith('C')) return;
    nameToSku.set(String(name).trim(), sku);
  });

  return nameToSku;
}

/**
 * Parse ชื่อชีท C-Line เพื่อดึง zones และวันที่
 *
 * รูปแบบ: "C-Line_<zone1>-<zone2>-..._<วันที่>"
 * เช่น:
 *   "C-Line_BKK-C-E_1 May"  → zones: ['BKK','C','E'], date: 1 May
 *   "C-Line_N-NE-S_1 Jun"   → zones: ['N','NE','S'],  date: 1 Jun
 *
 * คืนค่า: { zones: string[], date: Date|null } หรือ null ถ้าไม่ใช่ชีท C-Line_
 */
function parseCLineSheetName(name) {
  if (!name.toLowerCase().startsWith('c-line_')) return null;

  const THAI_MONTHS = {
    'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
    'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11,
  };
  const EN_MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  // ตัด prefix "C-Line_" ออก → "BKK-C-E_1 May"
  const rest = name.slice('C-Line_'.length);

  // แยก zone part กับ date part ด้วย "_" ตัวแรก
  const underscoreIdx = rest.indexOf('_');
  const zonePart = underscoreIdx >= 0 ? rest.slice(0, underscoreIdx) : rest;
  const datePart = underscoreIdx >= 0 ? rest.slice(underscoreIdx + 1) : '';

  // zones = token uppercase ที่คั่นด้วย "-" เช่น "BKK-C-E" → ['BKK','C','E']
  const zones = zonePart.match(/[A-Z]+/g) || [];

  // parse วันที่
  let date = null;
  const enMatch = datePart.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (enMatch) {
    const mon = EN_MONTHS[enMatch[2].toLowerCase()];
    if (mon !== undefined) date = new Date(2000, mon, parseInt(enMatch[1]));
  }
  if (!date) {
    for (const [thMon, idx] of Object.entries(THAI_MONTHS)) {
      const thMatch = datePart.match(new RegExp('(\\d{1,2})\\s*' + thMon.replace('.', '\\.')));
      if (thMatch) { date = new Date(2000, idx, parseInt(thMatch[1])); break; }
    }
  }

  return { zones, date };
}

/**
 * ดึง sheet groups จาก workbook
 * คืนค่า Map<zoneKey, { sheetName, zones, date }>
 * zoneKey = zones.sort().join('-') เช่น "BKK-C-E", "N-NE-S"
 * เลือกเฉพาะ sheet ล่าสุดของแต่ละ zone group (เรียงตามวันที่จริง)
 */
function getCLineSheetGroups(workbook) {
  const groups = new Map();

  workbook.SheetNames.forEach((name, originalIdx) => {
    const parsed = parseCLineSheetName(name);
    if (!parsed || parsed.zones.length === 0) return;

    const zoneKey = [...parsed.zones].sort().join('-');
    const existing = groups.get(zoneKey);

    const isNewer = !existing ||
      (parsed.date && existing.date && parsed.date > existing.date) ||
      (parsed.date && !existing.date) ||
      (!parsed.date && !existing.date && originalIdx > existing.originalIdx);

    if (isNewer) {
      groups.set(zoneKey, { sheetName: name, zones: parsed.zones, date: parsed.date, originalIdx });
    }
  });

  return groups;
}

/**
 * =====================================================
 * Helper: Import C-Line Data from Excel Buffer
 * =====================================================
 */
async function importCLineData(pool, excelBuffer, sheetName, logId = null) {
  let imported = 0;

  try {
    console.log(`[C-Line Parser] Starting import for sheet: ${sheetName}`);

    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    console.log(`[C-Line Parser] Available sheets: ${workbook.SheetNames.join(', ')}`);

    // Build name→SKU map จาก Ref. sheet
    const nameToSku = buildCLineRefMap(workbook);
    console.log(`[C-Line Parser] Ref. map loaded: ${nameToSku.size} products`);

    if (nameToSku.size === 0) {
      console.error('[C-Line Parser] No SKU mapping found in Ref. sheet');
      return 0;
    }

    // Load branch mapping
    const { allBranchCodes, zoneToBranches } = await loadBranchMapping();

    // สร้าง zone → Set<branchCode> map สำหรับ lookup
    const zoneBranchSets = {};
    for (const [zone, codes] of Object.entries(zoneToBranches)) {
      zoneBranchSets[zone] = new Set(codes);
    }

    // Load brand mapping จาก BRAND_CLine
    const brandMap = {};
    try {
      const brandResult = await pool.request().query(`SELECT BRAND_NO, BRAND_NAME FROM BRAND_CLine`);
      brandResult.recordset.forEach(r => {
        brandMap[String(r.BRAND_NO).padStart(2, '0')] = r.BRAND_NAME;
      });
      console.log(`[C-Line Parser] Brand map loaded: ${Object.keys(brandMap).length} brands`);
    } catch (e) {
      console.warn(`[C-Line Parser] Could not load BRAND_CLine: ${e.message}`);
    }

    // Load productName from StockStatusFact
    const allSkus = [...nameToSku.values()];
    const skuNameMap = {};
    if (allSkus.length > 0) {
      try {
        const skuInList = allSkus.map(s => `'${s.replace(/'/g, "''")}'`).join(',');
        const nameResult = await pool.request().query(`
          SELECT DISTINCT skuNumber, productName
          FROM StockStatusFact
          WHERE skuNumber IN (${skuInList})
        `);
        nameResult.recordset.forEach(r => {
          if (r.skuNumber && r.productName) skuNameMap[r.skuNumber] = r.productName;
        });
        console.log(`[C-Line Parser] Loaded ${Object.keys(skuNameMap).length} SKU names from StockStatusFact`);
      } catch (e) {
        console.warn(`[C-Line Parser] Could not load SKU names: ${e.message}`);
      }
    }

    // Check DB columns
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'excel_import_data'
    `);
    const dbCols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices   = dbCols.includes('selling_price_w1');
    const hasSellingPriceSdm = dbCols.includes('selling_price_sdm');

    // Parse zones จากชีทที่ user เลือก
    const parsed = parseCLineSheetName(sheetName);
    if (!parsed || parsed.zones.length === 0) {
      console.error(`[C-Line Parser] Cannot parse zones from sheet: "${sheetName}"`);
      return 0;
    }

    // หา targetBranches จาก zones ของชีทที่เลือก
    const targetBranches = allBranchCodes.filter(b =>
      parsed.zones.some(zone => zoneBranchSets[zone]?.has(b))
    );

    console.log(`[C-Line Parser] Sheet "${sheetName}" → zones: [${parsed.zones.join(',')}] → ${targetBranches.length} branches`);

    const parsedRows = parseCLineSheet(workbook, sheetName);
    console.log(`[C-Line Parser] Parsed ${parsedRows.length} rows from "${sheetName}"`);

    // Build insert rows
    const insertRows = [];

    for (const pr of parsedRows) {
      const sku = nameToSku.get(pr.productName);
      if (!sku) {
        console.warn(`[C-Line Parser] No SKU for "${pr.productName}", skipping`);
        continue;
      }
      const productName = skuNameMap[sku] || pr.productName;
      const brandNo   = sku.substring(1, 3);
      const brandName = brandMap[brandNo] || '';

      for (const branchCode of targetBranches) {
        insertRows.push({
          branch: branchCode, sku, productName, brand: brandName,
          basePrice: pr.re, sdm: pr.sdm, w1: pr.w1, w2: pr.w2, r1: pr.r1, r2: pr.r2,
        });
      }
    }

    console.log(`[C-Line Parser] Prepared ${insertRows.length} rows, inserting in batches...`);

    if (insertRows.length === 0) {
      console.warn('[C-Line Parser] No rows to insert — check Ref. sheet and product name matching');
      return 0;
    }

    // Column definitions
    const insertCols = hasSellingPrices && hasSellingPriceSdm
      ? `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item,
         selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2,
         import_log_id, selling_price_sdm`
      : hasSellingPrices
      ? `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item,
         selling_price_w1, selling_price_w2, selling_price_r1, selling_price_r2, import_log_id`
      : `branch, product_type, sku, product_name, brand, unit,
         base_price, discount_price_1, discount_price_2, discount_price_3,
         project_no, project_discount_1, project_discount_2, project_price,
         carton_price, shipping_cost, free_item, import_log_id`;

    const BATCH_SIZE = 200;
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
        req.input(`sdm_${idx}`,        sql.Decimal(18,2), r.sdm);
        req.input(`logId${idx}`,       sql.Int,           logId);

        if (hasSellingPrices && hasSellingPriceSdm) {
          valueParts.push(
            `(@branch${idx},'C-Line',@sku${idx},@productName${idx},@brand${idx},'',` +
            `@basePrice${idx},0,0,0,'',0,0,0,0,0,'',` +
            `@w1_${idx},@w2_${idx},@r1_${idx},@r2_${idx},@logId${idx},@sdm_${idx})`
          );
        } else if (hasSellingPrices) {
          valueParts.push(
            `(@branch${idx},'C-Line',@sku${idx},@productName${idx},@brand${idx},'',` +
            `@basePrice${idx},0,0,0,'',0,0,0,0,0,'',` +
            `@w1_${idx},@w2_${idx},@r1_${idx},@r2_${idx},@logId${idx})`
          );
        } else {
          valueParts.push(
            `(@branch${idx},'C-Line',@sku${idx},@productName${idx},@brand${idx},'',` +
            `@basePrice${idx},0,0,0,'',0,0,0,0,0,'',@logId${idx})`
          );
        }
      });

      try {
        await req.query(`INSERT INTO excel_import_data (${insertCols}) VALUES ${valueParts.join(',')}`);
        imported += batch.length;
        console.log(`[C-Line Parser] Inserted ${imported}/${insertRows.length}`);
      } catch (err) {
        console.error(`[C-Line Parser] Batch insert error at ${batchStart}:`, err.message);
        // Fallback: insert row by row
        for (const r of batch) {
          try {
            const singleReq = pool.request()
              .input('branch',      sql.NVarChar(100), r.branch)
              .input('sku',         sql.NVarChar(50),  r.sku)
              .input('productName', sql.NVarChar(255), r.productName)
              .input('brand',       sql.NVarChar(100), r.brand)
              .input('basePrice',   sql.Decimal(18,2), r.basePrice)
              .input('w1',          sql.Decimal(18,2), r.w1)
              .input('w2',          sql.Decimal(18,2), r.w2)
              .input('r1',          sql.Decimal(18,2), r.r1)
              .input('r2',          sql.Decimal(18,2), r.r2)
              .input('sdm',         sql.Decimal(18,2), r.sdm)
              .input('logId',       sql.Int,           logId);

            if (hasSellingPrices && hasSellingPriceSdm) {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'C-Line',@sku,@productName,@brand,'',
                        @basePrice,0,0,0,'',0,0,0,0,0,'',@w1,@w2,@r1,@r2,@logId,@sdm)
              `);
            } else if (hasSellingPrices) {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'C-Line',@sku,@productName,@brand,'',
                        @basePrice,0,0,0,'',0,0,0,0,0,'',@w1,@w2,@r1,@r2,@logId)
              `);
            } else {
              await singleReq.query(`
                INSERT INTO excel_import_data (${insertCols})
                VALUES (@branch,'C-Line',@sku,@productName,@brand,'',
                        @basePrice,0,0,0,'',0,0,0,0,0,'',@logId)
              `);
            }
            imported++;
          } catch (e2) {
            console.error(`[C-Line Parser] Row insert error (${r.branch}/${r.sku}):`, e2.message);
          }
        }
      }
    }

    console.log(`[C-Line Parser] Done: ${imported} rows inserted`);
    return imported;

  } catch (err) {
    console.error('[C-Line Parser] Fatal error:', err);
    return 0;
  }
}

/**
 * =====================================================
 * Helper: Preview C-Line Data
 * =====================================================
 * ใช้ sheetName ที่ user เลือก — parse zones จากชื่อชีทนั้น
 * เพื่อหา targetBranches ของชีทนั้นโดยเฉพาะ
 */
async function previewCLineData(excelBuffer, sheetName) {
  try {
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });

    // Parse zones จากชื่อชีทที่เลือก
    const parsed = parseCLineSheetName(sheetName);
    if (!parsed || parsed.zones.length === 0) {
      console.warn(`[C-Line Preview] Cannot parse zones from sheet: "${sheetName}"`);
      return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
    }

    const nameToSku = buildCLineRefMap(workbook);

    const pool = await getPool();

    const brandMap = {};
    try {
      const brandResult = await pool.request().query(`SELECT BRAND_NO, BRAND_NAME FROM BRAND_CLine`);
      brandResult.recordset.forEach(r => {
        brandMap[String(r.BRAND_NO).padStart(2, '0')] = r.BRAND_NAME;
      });
    } catch (e) {
      console.warn(`[C-Line Preview] Could not load BRAND_CLine: ${e.message}`);
    }

    const { allBranchCodes, zoneToBranches } = await loadBranchMapping();

    const zoneBranchSets = {};
    for (const [zone, codes] of Object.entries(zoneToBranches)) {
      zoneBranchSets[zone] = new Set(codes);
    }

    // หา targetBranches จาก zones ของชีทที่เลือก
    const targetBranches = allBranchCodes.filter(b =>
      parsed.zones.some(zone => zoneBranchSets[zone]?.has(b))
    );
    const zoneKey = [...parsed.zones].sort().join('-');

    console.log(`[C-Line Preview] Sheet "${sheetName}" → zones: [${parsed.zones.join(',')}] → ${targetBranches.length} branches`);

    const parsedRows = parseCLineSheet(workbook, sheetName);
    console.log(`[C-Line Preview] Parsed ${parsedRows.length} rows`);

    const previewRows = [];
    const allRows = [];
    let totalSkus = 0;

    for (const pr of parsedRows) {
      const sku = nameToSku.get(pr.productName);
      if (!sku) continue;
      totalSkus++;
      const brandNo   = sku.substring(1, 3);
      const brandName = brandMap[brandNo] || '';
      const rowData = {
        sku,
        productName:      pr.productName,
        brand:            brandName,
        unit:             '',
        branch:           `${zoneKey} (${targetBranches.length})`,
        totalBranches:    targetBranches.length,
        base_price:       pr.re,
        discount_price_1: 0,
        discount_price_2: 0,
        discount_price_3: 0,
        selling_price_w1: pr.w1,
        selling_price_w2: pr.w2,
        selling_price_r1: pr.r1,
        selling_price_r2: pr.r2,
      };
      allRows.push(rowData);
      if (previewRows.length < 20) previewRows.push(rowData);
    }

    const totalRows = totalSkus * targetBranches.length;

    return {
      rows: previewRows,
      allRows,
      totalSkus,
      totalRows,
      branches: targetBranches,
    };

  } catch (err) {
    console.error('[C-Line Preview] Fatal error:', err);
    return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
  }
}

/**
 * =====================================================
 * GET /api/excel/pending-draft?productType=
 * ตรวจสอบว่ามี draft ค้างอยู่ไหม (สำหรับ restore ตอนโหลดหน้า)
 * =====================================================
 */
export async function getPendingDraft(req, res) {
  try {
    const { productType } = req.query;
    const pool = await getPool();

    const req2 = pool.request();
    const whereStr = productType
      ? `WHERE l.status = 'draft' AND l.product_type = @pt`
      : `WHERE l.status = 'draft'`;
    if (productType) req2.input('pt', sql.NVarChar(100), productType);

    const result = await req2.query(`
      SELECT l.id, l.product_type AS productType, l.version_label AS versionLabel,
             l.imported_rows AS importedRows, l.imported_at AS importedAt,
             COUNT(d.id) AS draftCount
      FROM excel_import_logs l
      LEFT JOIN excel_import_data d ON d.import_log_id = l.id AND d.status = 'draft'
      ${whereStr}
      GROUP BY l.id, l.product_type, l.version_label, l.imported_rows, l.imported_at
      ORDER BY l.imported_at DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('getPendingDraft error:', err);
    res.status(500).json({ message: err.message });
  }
}
