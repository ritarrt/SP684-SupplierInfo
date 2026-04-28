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
    let detectedType = productType;
    if (!detectedType || detectedType === 'Glass') {
      const sheetLower = sheetName.toLowerCase();
      if (sheetLower.includes('gypsum') || sheetLower.includes('ยิปซั่ม') || sheetLower.includes('y1') || sheetLower.includes('sb')) {
        detectedType = 'Gypsum';
      } else if (sheetLower.includes('glass') || sheetLower.includes('กระจก')) {
        detectedType = 'Glass';
      } else if (sheetLower.includes('aluminum') || sheetLower.includes('อลูมิเนียม')) {
        detectedType = 'Aluminum';
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
        imported = await importGlassData(pool, data, null);
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

    // Row 1: Branch names starting from col 3
    const branches = [];
    if (rawData[1]) {
      for (let col = 3; col < rawData[1].length; col++) {
        const branch = rawData[1][col];
        if (branch && typeof branch === 'string' && branch.trim()) {
          branches.push(branch.trim());
        }
      }
    }

    if (branches.length === 0) {
      console.error("[Gypsum Parser] No branches found");
      return 0;
    }
    console.log(`[Gypsum Parser] Branches (${branches.length}):`, branches.join(', '));

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
    let i = 2;

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
        } else if (col1 && col3 === 'BKK') {
          // Format C: col0=SKU, col1=ProductName, col3="BKK" → Price List แถวถัดไป
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

            for (let b = 0; b < branches.length; b++) {
              const branch = branches[b];
              const colIdx = 3 + b;

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

              const discPct1 = discountPctRows[0] ? parseFloat(discountPctRows[0][colIdx]) || 0 : 0;
              const discPct2 = discountPctRows[1] ? parseFloat(discountPctRows[1][colIdx]) || 0 : 0;
              const discPct3 = discountPctRows[2] ? parseFloat(discountPctRows[2][colIdx]) || 0 : 0;

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
 * Helper: Import Glass Data
 * =====================================================
 */
async function importGlassData(pool, data, logId) {
  let imported = 0;

  for (const row of data) {
    try {
      const sku = row["SKU"] || row.sku || "";
      const productName = row["ชื่อสินค้า"] || row.product_name || "";
      const branch = row["สาขา"] || row.branch || "";
      const basePrice = parseFloat(row["ราคาตั้งต้น"] || row.base_price || 0) || 0;

      if (!sku) continue;

      await pool
        .request()
        .input("branch", sql.NVarChar(100), branch)
        .input("productType", sql.NVarChar(100), "Glass")
        .input("sku", sql.NVarChar(50), sku)
        .input("productName", sql.NVarChar(255), productName)
        .input("brand", sql.NVarChar(100), "")
        .input("unit", sql.NVarChar(50), "")
        .input("basePrice", sql.Decimal(18, 2), basePrice)
        .input("discountPrice1", sql.Decimal(18, 2), 0)
        .input("discountPrice2", sql.Decimal(18, 2), 0)
        .input("discountPrice3", sql.Decimal(18, 2), 0)
        .input("projectNo", sql.NVarChar(50), "")
        .input("projectDiscount1", sql.Decimal(18, 2), 0)
        .input("projectDiscount2", sql.Decimal(18, 2), 0)
        .input("projectPrice", sql.Decimal(18, 2), 0)
        .input("cartonPrice", sql.Decimal(18, 2), 0)
        .input("shippingCost", sql.Decimal(18, 2), 0)
        .input("freeItem", sql.NVarChar(255), "")
        .query(`
          INSERT INTO excel_import_data (
            branch, product_type, sku, product_name, brand, unit,
            base_price, discount_price_1, discount_price_2, discount_price_3,
            project_no, project_discount_1, project_discount_2, project_price,
            carton_price, shipping_cost, free_item
          )
          VALUES (
            @branch, @productType, @sku, @productName, @brand, @unit,
            @basePrice, @discountPrice1, @discountPrice2, @discountPrice3,
            @projectNo, @projectDiscount1, @projectDiscount2, @projectPrice,
            @cartonPrice, @shippingCost, @freeItem
          )
        `);

      imported++;
    } catch (err) {
      console.error("Error importing glass row:", err);
    }
  }

  return imported;
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
        [discount_pct_1] AS [discountPct1],
        [discount_pct_2] AS [discountPct2],
        [discount_pct_3] AS [discountPct3],` : `
        NULL AS [discountPct1], NULL AS [discountPct2], NULL AS [discountPct3],`;

    // CTE: เลือกเฉพาะ row ล่าสุดต่อ sku+branch ด้วย ROW_NUMBER()
    const latestCte = `
      WITH latest AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY [sku], [branch]
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
          ROW_NUMBER() OVER (PARTITION BY [sku], [branch] ORDER BY [created_at] DESC) AS rn
        FROM [excel_import_data]
      )
      SELECT COUNT(*) AS [total] FROM latest WHERE rn = 1 ${whereParts.length > 0 ? 'AND ' + whereParts.join(' AND ') : ''}
    `);
    const total = countResult.recordset[0].total;

    // Get data — latest per sku+branch only
    const dataReq = pool.request();
    if (productType) dataReq.input("productType", sql.NVarChar(100), productType);
    if (branch)      dataReq.input("branch",      sql.NVarChar(100), branch);
    if (search || sku) dataReq.input("search",    sql.NVarChar(255), `%${search || sku}%`);
    dataReq.input("limit",  sql.Int, parseInt(limit));
    dataReq.input("offset", sql.Int, offset);

    const result = await dataReq.query(`
      WITH latest AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY [sku], [branch] ORDER BY [created_at] DESC) AS rn
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

    let detectedType = productType;
    if (!detectedType || detectedType === 'Glass') {
      const sheetLower = sheetName.toLowerCase();
      if (sheetLower.includes('gypsum') || sheetLower.includes('ยิปซั่ม') || sheetLower.includes('y1') || sheetLower.includes('sb')) {
        detectedType = 'Gypsum';
      } else if (sheetLower.includes('glass') || sheetLower.includes('กระจก')) {
        detectedType = 'Glass';
      }
    }

    console.log(`[Preview] Detected product type: ${detectedType} (from sheet: ${sheetName})`);

    let previewData = [];

    try {
      if (detectedType === "Gypsum") {
        const bufferData = Buffer.from(excelBuffer, 'base64');
        previewData = await previewGypsumData(bufferData, sheetName);
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

    const branches = [];
    if (rawData[1]) {
      for (let col = 3; col < rawData[1].length; col++) {
        const b = rawData[1][col];
        if (b && typeof b === 'string' && b.trim()) branches.push(b.trim());
      }
    }
    if (branches.length === 0) return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };

    const previewRows = []; // แถวตัวอย่าง (สาขาแรกของแต่ละ SKU)
    let totalSkus = 0;
    let totalRows = 0;
    let i = 2;

    while (i < rawData.length) {
      const row = rawData[i];
      if (!row) { i++; continue; }

      const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
      const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
      const col2 = row[2] !== undefined ? String(row[2]).trim() : '';
      const col3 = row[3] !== undefined ? String(row[3]).trim() : '';
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
        } else if (col1 && col3 === 'BKK') {
          // Format C: col0=SKU, col1=ProductName, col3="BKK"
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
        let discountRow1 = null, discountRow2 = null;

        let nextBlockIndex = priceListRowIndex + 1;
        while (nextBlockIndex < rawData.length) {
          const dr = rawData[nextBlockIndex];
          if (!dr) { nextBlockIndex++; continue; }
          const nc0 = dr[0] !== undefined ? String(dr[0]).trim() : '';
          const nc1 = dr[1] !== undefined ? String(dr[1]).trim() : '';
          const nextIsPriceLabel = PRICE_LABELS.has(nc1);

          if (/^Y\d/.test(nc0) && !nextIsPriceLabel && nc1 !== '') break;

          // ไม่เพิ่ม SKU จาก merged cells — ใช้ Sheet1 lookup เท่านั้น

          if (nc1 === 'RE (ex VAT)')         reExVat = dr;
          else if (nc1 === 'Price : W1')     priceW1 = dr;
          else if (nc1 === 'Price : W2')     priceW2 = dr;
          else if (nc1 === 'Price : R1')     priceR1 = dr;
          else if (nc1 === 'Price : R2')     priceR2 = dr;
          else if (nc1 === 'Discount' && !priceW1) {
            if (!discountRow1) discountRow1 = dr;
            else if (!discountRow2) discountRow2 = dr;
          }

          nextBlockIndex++;
        }

        if (priceW1 && priceW2 && priceR1 && priceR2) {
          totalSkus += skusInBlock.size;
          totalRows += skusInBlock.size * branches.length;

          // สร้างแถว preview สำหรับแต่ละ SKU (ใช้สาขาแรกเป็นตัวอย่าง)
          for (const [sku, skuName] of skusInBlock) {
            const brandCode = sku.substring(1, 3);
            const brandName = brandMap[brandCode] || 'ไม่ระบุ';
            const colIdx = 3; // BKK

            let basePrice = priceList ? parseFloat(priceList[colIdx]) || 0 : 0;
            if (basePrice === 0 && reExVat) basePrice = parseFloat(reExVat[colIdx]) || 0;

            const discPct1 = discountRow1 ? parseFloat(discountRow1[colIdx]) || 0 : 0;
            const discPct2 = discountRow2 ? parseFloat(discountRow2[colIdx]) || 0 : 0;

            previewRows.push({
              sku,
              productName: skuName,
              brand: brandName,
              branch: branches[0],           // ตัวอย่างสาขาแรก
              totalBranches: branches.length, // จำนวนสาขาจริง
              // คอลัมน์ที่จะเก็บ
              base_price:         basePrice,
              discount_pct_1:     discPct1,
              discount_pct_2:     discPct2,
              discount_price_1:   reExVat ? parseFloat(reExVat[colIdx]) || 0 : 0,
              discount_price_2:   0,
              discount_price_3:   0,
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

    return { rows: previewRows, totalSkus, totalRows, branches };

  } catch (err) {
    console.error("[Preview] Fatal error:", err);
    return { rows: [], totalSkus: 0, totalRows: 0, branches: [] };
  }
}
