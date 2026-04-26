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

    // Parse structure:
    // Block header row: col0=SKU, col1=ProductName, col3="BKK" (branch header repeated)
    // Data rows below: col0=empty, col1=label, col3..=values per branch
    
    let productCount = 0;
    let i = 2;

    while (i < rawData.length) {
      const row = rawData[i];
      if (!row) { i++; continue; }

      const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
      const col3 = row[3] !== undefined ? String(row[3]).trim() : '';

      // Detect block header: col0 has SKU starting with Y AND col3 = "BKK"
      if (col0.startsWith('Y') && col3 === 'BKK') {
        const sku = col0;
        const productName = row[1] ? String(row[1]).trim() : '';
        const brandCode = sku.substring(1, 3);
        const brandName = brandMap[brandCode] || 'ไม่ระบุ';

        // Scan next rows for price data (until next block header or end)
        let priceList = null, reExVat = null;
        let priceW1 = null, priceW2 = null, priceR1 = null, priceR2 = null;

        let j = i + 1;
        while (j < rawData.length) {
          const dataRow = rawData[j];
          if (!dataRow) { j++; continue; }

          const nextCol0 = dataRow[0] !== undefined ? String(dataRow[0]).trim() : '';
          const nextCol3 = dataRow[3] !== undefined ? String(dataRow[3]).trim() : '';

          // Stop if next block header found
          if (nextCol0.startsWith('Y') && nextCol3 === 'BKK') break;

          const label = dataRow[1] !== undefined ? String(dataRow[1]).trim() : '';

          if (label === 'Price List')               priceList = dataRow;
          else if (label === 'RE (ex VAT)')         reExVat   = dataRow;
          else if (label === 'Price : W1')          priceW1   = dataRow;
          else if (label === 'Price : W2')          priceW2   = dataRow;
          else if (label === 'Price : R1')          priceR1   = dataRow;
          else if (label === 'Price : R2')          priceR2   = dataRow;

          j++;
        }

        if (priceW1 && priceW2 && priceR1 && priceR2) {
          for (let b = 0; b < branches.length; b++) {
            const branch = branches[b];
            const colIdx = 3 + b;

            const basePrice  = priceList ? parseFloat(priceList[colIdx]) || 0 : 0;
            const discPrice1 = reExVat   ? parseFloat(reExVat[colIdx])   || 0 : 0;
            const sellW1     = parseFloat(priceW1[colIdx]) || 0;
            const sellW2     = parseFloat(priceW2[colIdx]) || 0;
            const sellR1     = parseFloat(priceR1[colIdx]) || 0;
            const sellR2     = parseFloat(priceR2[colIdx]) || 0;

            try {
              await pool.request()
                .input("branch",           sql.NVarChar(100), branch)
                .input("productType",      sql.NVarChar(100), "Gypsum")
                .input("sku",              sql.NVarChar(50),  sku)
                .input("productName",      sql.NVarChar(255), productName)
                .input("brand",            sql.NVarChar(100), brandName)
                .input("unit",             sql.NVarChar(50),  "")
                .input("basePrice",        sql.Decimal(18,2), basePrice)
                .input("discountPrice1",   sql.Decimal(18,2), discPrice1)
                .input("discountPrice2",   sql.Decimal(18,2), 0)
                .input("discountPrice3",   sql.Decimal(18,2), 0)
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
                .query(`
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
              imported++;
            } catch (err) {
              console.error(`[Gypsum Parser] Insert error (${branch}/${sku}):`, err.message);
            }
          }
          productCount++;
          console.log(`[Gypsum Parser] Product ${productCount}: ${productName} (${sku}) → ${branches.length} rows`);
        } else {
          console.warn(`[Gypsum Parser] Missing price rows for ${productName} (${sku}) W1=${!!priceW1} W2=${!!priceW2} R1=${!!priceR1} R2=${!!priceR2}`);
        }

        i = j; // jump to next block
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

    let whereParts = [];
    if (productType) whereParts.push("[product_type] = @productType");
    if (branch)      whereParts.push("[branch] = @branch");
    if (search)      whereParts.push("([sku] LIKE @search OR [product_name] LIKE @search)");
    else if (sku)    whereParts.push("[sku] LIKE @search");

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

    // Check if selling_price columns exist
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'excel_import_data'
    `);
    const cols = colCheck.recordset.map(r => r.COLUMN_NAME.toLowerCase());
    const hasSellingPrices = cols.includes('selling_price_w1');

    const sellingCols = hasSellingPrices ? `
        [selling_price_w1] AS [sellingPriceW1],
        [selling_price_w2] AS [sellingPriceW2],
        [selling_price_r1] AS [sellingPriceR1],
        [selling_price_r2] AS [sellingPriceR2],` : `
        NULL AS [sellingPriceW1], NULL AS [sellingPriceW2],
        NULL AS [sellingPriceR1], NULL AS [sellingPriceR2],`;

    // Get total count
    const countReq = pool.request();
    if (productType) countReq.input("productType", sql.NVarChar(100), productType);
    if (branch)      countReq.input("branch",      sql.NVarChar(100), branch);
    if (search || sku) countReq.input("search",    sql.NVarChar(255), `%${search || sku}%`);

    const countResult = await countReq.query(`
      SELECT COUNT(*) AS [total] FROM [excel_import_data] ${whereClause}
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
        [id], [branch], [product_type] AS [productType],
        [sku], [product_name] AS [productName], [brand], [unit],
        [base_price]       AS [basePrice],
        [discount_price_1] AS [discountPrice1],
        [discount_price_2] AS [discountPrice2],
        [discount_price_3] AS [discountPrice3],
        ${sellingCols}
        [created_at] AS [createdAt]
      FROM [excel_import_data]
      ${whereClause}
      ORDER BY [created_at] DESC, [product_type], [sku], [branch]
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
