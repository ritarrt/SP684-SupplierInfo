import { getPool, sql } from "../config/db.js";

// Helper function to parse dd/MM/yyyy date string to Date object
function parseDateString(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
  const year = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

/* =====================================
   GET DEAL LIST
===================================== */
export const getSupplierDeals = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const { condition } = req.query; // Filter by condition_mode
    const pool = await getPool();

    // Auto-close deals when end_date has passed
    await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        UPDATE supplier_deal_price
        SET status = 'CLOSED',
            updated_at = GETDATE()
        WHERE supplier_no = @supplier_no
          AND status IN ('OPEN', 'USE')
          AND end_date IS NOT NULL
          AND GETDATE() > DATEADD(DAY, 1, end_date)
      `);

    // Check if has_been_used column exists
    const columnCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'has_been_used'
      `);
    const hasBeenUsedColumnExists = columnCheck.recordset[0].column_exists > 0;

    // Check if limited_type column exists
    const limitedTypeCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'limited_type'
      `);
    const limitedTypeExists = limitedTypeCheck.recordset[0].column_exists > 0;

    // Check if limited_unit column exists
    const limitedUnitCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'limited_unit'
      `);
    const limitedUnitExists = limitedUnitCheck.recordset[0].column_exists > 0;

    // Check if limited_qty column exists
    const limitedQtyCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'limited_qty'
      `);
    const limitedQtyExists = limitedQtyCheck.recordset[0].column_exists > 0;

    // Check if limited_discount_value column exists
    const limitedDiscountValueCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'limited_discount_value'
      `);
    const limitedDiscountValueExists = limitedDiscountValueCheck.recordset[0].column_exists > 0;

    // Check if limited_discount_unit column exists
    const limitedDiscountUnitCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'limited_discount_unit'
      `);
    const limitedDiscountUnitExists = limitedDiscountUnitCheck.recordset[0].column_exists > 0;

    const result = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .input("condition", sql.NVarChar, condition || null)
      .query(`
        SELECT 
          deal_id,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'deal_ref'
            ) THEN deal_ref
            ELSE NULL
          END AS deal_ref,
          supplier_no,
          status,
          ${hasBeenUsedColumnExists ? 'has_been_used' : '0 AS has_been_used'},
          deal_name,
          contact_person,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'project_no'
            ) THEN project_no
            ELSE NULL
          END AS project_no,
          region,
          province,
          branch,
          category,
          brand,
          product_group,
          sub_group,
          color,
          thickness,
          mold,
          sku,
          deal_type,
          price_value,
          price_unit,
          condition_mode,
          ${limitedQtyExists ? 'limited_qty' : 'NULL AS limited_qty'},
          ${limitedUnitExists ? 'limited_unit' : 'NULL AS limited_unit'},
          ${limitedTypeExists ? 'limited_type' : 'NULL AS limited_type'},
          ${limitedDiscountValueExists ? 'limited_discount_value' : 'NULL AS limited_discount_value'},
          ${limitedDiscountUnitExists ? 'limited_discount_unit' : 'NULL AS limited_discount_unit'},
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'require_pallet'
            ) THEN require_pallet
            ELSE 0
          END AS require_pallet,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'supplier_delivery'
            ) THEN supplier_delivery
            ELSE 1
          END AS supplier_delivery,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'base_price'
            ) THEN base_price
            ELSE NULL
          END AS base_price,
          FORMAT(start_date, 'dd/MM/yyyy') AS start_date,
          FORMAT(end_date, 'dd/MM/yyyy') AS end_date,
          note,
          FORMAT(created_at, 'dd/MM/yyyy HH:mm:ss') AS created_at,
          FORMAT(ISNULL(updated_at, created_at), 'dd/MM/yyyy HH:mm:ss') AS updated_at
        FROM supplier_deal_price
        WHERE supplier_no = @supplier_no
        ${condition ? `AND condition_mode = @condition` : ''}
        ORDER BY created_at DESC
      `);

    // Fetch stepped pricing for each deal
    const deals = result.recordset;
    for (let deal of deals) {
      if (deal.condition_mode === 'stepped') {
        const stepsResult = await pool.request()
          .input("deal_id", sql.Int, deal.deal_id)
          .query(`
            SELECT 
              step_id,
              step_number AS tier,
              from_qty,
              to_qty,
              unit,
              price_value,
              price_unit
            FROM supplier_deal_price_steps
            WHERE deal_id = @deal_id
            ORDER BY step_number
          `);
        deal.steps = stepsResult.recordset;
        
        // Add tier info to the main deal for easier frontend access
        if (deal.steps && deal.steps.length > 0) {
          deal.tier = deal.steps[0].tier;
          deal.from_qty = deal.steps[0].from_qty;
          deal.to_qty = deal.steps[0].to_qty;
        }
      }

      // Calculate actual received quantities for limited and stepped deals
      // Only calculate if deal status is 'USE'
      if ((deal.condition_mode === 'limited' || deal.condition_mode === 'stepped') && deal.status === 'USE') {
        console.log(`🔍 [DEBUG] Deal ${deal.deal_id} - Status is USE, calculating actual values`);
        try {
          console.log(`🔍 [DEBUG] Deal ${deal.deal_id} - Status is USE, calculating actual values`);
          console.log(`🔍 Calculating actual for deal ${deal.deal_id}:`, {
            category: deal.category,
            brand: deal.brand,
            product_group: deal.product_group,
            sub_group: deal.sub_group,
            sku: deal.sku,
            branch: deal.branch,
            start_date: deal.start_date,
            end_date: deal.end_date,
            limited_unit: deal.limited_unit,
            limited_type: deal.limited_type
          });

          // Get brand_no for SKU matching
          const brandNoResult = await pool.request()
            .input("category", sql.NVarChar, deal.category)
            .input("brand", sql.NVarChar, deal.brand)
            .query(`
              SELECT 
                CASE @category
                  WHEN 'Gypsum' THEN (SELECT BRAND_NO FROM BRAND_Gypsum WHERE BRAND_ID = @brand)
                  WHEN 'Glass' THEN (SELECT BRAND_NO FROM BRAND_Glass WHERE BRAND_ID = @brand)
                  WHEN 'Aluminum' THEN (SELECT BRAND_NO FROM BRAND_Aluminium WHERE BRAND_ID = @brand)
                  WHEN 'C-Line' THEN (SELECT BRAND_NO FROM BRAND_CLine WHERE BRAND_ID = @brand)
                  WHEN 'Sealant' THEN (SELECT BRAND_NO FROM BRAND_Sealant WHERE BRAND_ID = @brand)
                  WHEN 'Accessories' THEN (SELECT BRAND_NO FROM Accessory_BRAND WHERE BRAND_ID = @brand)
                END AS brand_no
            `);
          
          const brandNo = brandNoResult.recordset[0]?.brand_no;
          console.log(`🔍 brandNo for deal ${deal.deal_id}:`, brandNo);

          // Calculate actual received quantities
          // Skip calculation if start_date or end_date is null
          if (!deal.start_date || !deal.end_date) {
            deal.actual_qty = 0;
            deal.actual_amount = 0;
            deal.actual_weight = 0;
            deal.actual_area = 0;
            deal.actual_value = 0;
            deal.achievement_percent = 0;
            deal.is_limit_reached = false;
            continue;
          }

          // Convert dd/MM/yyyy to Date objects for parameterized query
          const startDateParts = deal.start_date.split('/');
          const endDateParts = deal.end_date.split('/');
          const startDateObj = new Date(
            parseInt(startDateParts[2]),
            parseInt(startDateParts[1]) - 1,
            parseInt(startDateParts[0])
          );
          const endDateObj = new Date(
            parseInt(endDateParts[2]),
            parseInt(endDateParts[1]) - 1,
            parseInt(endDateParts[0])
          );

          console.log(`🔍 Query parameters for deal ${deal.deal_id}:`, {
            sku: deal.sku,
            category: deal.category,
            brand_no: brandNo,
            product_group_code: deal.product_group,
            sub_group_code: deal.sub_group,
            branch: deal.branch,
            project_no: deal.project_no,
            start_date: startDateObj,
            end_date: endDateObj,
            limited_unit: deal.limited_unit
          });

          const actualResult = await pool.request()
            .input("deal_id", sql.Int, deal.deal_id)
            .input("supplier_no", sql.NVarChar, supplierNo)
            .input("sku", sql.NVarChar, deal.sku)
            .input("category", sql.NVarChar, deal.category)
            .input("brand_no", sql.NVarChar, brandNo)
            .input("product_group_code", sql.NVarChar, deal.product_group || null)
            .input("sub_group_code", sql.NVarChar, deal.sub_group || null)
            .input("branch", sql.NVarChar, deal.branch)
            .input("start_date", sql.Date, startDateObj)
            .input("end_date", sql.Date, endDateObj)
            .input("project_no", sql.NVarChar, deal.project_no || null)
            .query(`
              SELECT 
                SUM(r.Quantity) AS actual_qty,
                SUM(r.Total_Cost) AS actual_amount,
                SUM(ISNULL(r.Gross_Weight, 0)) AS actual_weight,
                SUM(ISNULL(r.Area_SQFT, 0)) AS actual_area
              FROM RE_Detail_WithCost r
              WHERE r.Posting_Date >= @start_date
                AND r.Posting_Date < DATEADD(DAY, 1, @end_date)
                AND (
                  (
                    (@category = 'Accessories'
                      AND r.SKU LIKE CONCAT(
                        'E',
                        @brand_no,
                        RIGHT('00' + @product_group_code, 2),
                        RIGHT('000' + @sub_group_code, 3),
                        '%'
                      )
                    )
                    OR
                    (@category <> 'Accessories'
                      AND r.SKU LIKE CONCAT(
                        CASE @category
                          WHEN 'Glass' THEN 'G'
                          WHEN 'Aluminum' THEN 'A'
                          WHEN 'Sealant' THEN 'S'
                          WHEN 'Gypsum' THEN 'Y'
                          WHEN 'C-Line' THEN 'C'
                        END,
                        RIGHT('00' + @brand_no, 2),
                        RIGHT('00' + @product_group_code, 2),
                        RIGHT('000' + @sub_group_code, 3),
                        '%'
                      )
                    )
                  )
                  OR
                  (
                    @sku IS NOT NULL 
                    AND @sku <> ''
                    AND EXISTS (
                      SELECT 1
                      FROM STRING_SPLIT(@sku, ',') s
                      WHERE LTRIM(RTRIM(s.value)) <> ''
                        AND r.SKU = LTRIM(RTRIM(s.value))
                    )
                  )
                )
                AND (
                  @branch IS NULL 
                  OR @branch = ''
                  OR UPPER(LTRIM(RTRIM(r.Branch))) IN (
                    SELECT UPPER(LTRIM(RTRIM(value)))
                    FROM STRING_SPLIT(@branch, ',')
                    WHERE LTRIM(RTRIM(value)) <> ''
                  )
                )
                AND (
                  @project_no IS NULL 
                  OR @project_no = ''
                  OR r.Project_No = @project_no
                )
            `);

          deal.actual_qty = actualResult.recordset[0]?.actual_qty || 0;
          deal.actual_amount = actualResult.recordset[0]?.actual_amount || 0;
          deal.actual_weight = actualResult.recordset[0]?.actual_weight || 0;
          deal.actual_area = actualResult.recordset[0]?.actual_area || 0;
          
          console.log(`🔍 Query result for deal ${deal.deal_id}:`, {
            actual_qty: deal.actual_qty,
            actual_amount: deal.actual_amount,
            actual_weight: deal.actual_weight,
            actual_area: deal.actual_area,
            startDate: startDateObj,
            endDate: endDateObj,
            raw_result: actualResult.recordset[0]
          });

          // Calculate achievement percentage based on limited_unit
          // For stepped deals, we only calculate actual_qty, not achievement
          if (deal.condition_mode === 'limited') {
            if (deal.limited_unit === 'ตัน' || deal.limited_unit === 'ton') {
              deal.actual_value = deal.actual_weight / 1000.0; // Convert kg to tons
              deal.achievement_percent = deal.limited_qty > 0 
                ? (deal.actual_value / deal.limited_qty) * 100 
                : 0;
            } else if (deal.limited_unit === 'บาท') {
              deal.actual_value = deal.actual_amount;
              deal.achievement_percent = deal.limited_qty > 0 
                ? (deal.actual_value / deal.limited_qty) * 100 
                : 0;
            } else if (deal.limited_unit === 'ตร.ฟ.' || deal.limited_unit === 'sqft') {
              deal.actual_value = deal.actual_area;
              deal.achievement_percent = deal.limited_qty > 0 
                ? (deal.actual_value / deal.limited_qty) * 100 
                : 0;
            } else {
              // Default: use actual_qty for 'ชิ้น', 'pcs', etc.
              deal.actual_value = deal.actual_qty;
              deal.achievement_percent = deal.limited_qty > 0 
                ? (deal.actual_value / deal.limited_qty) * 100 
                : 0;
            }

            // Determine if limit is reached or exceeded
            deal.is_limit_reached = deal.actual_value >= deal.limited_qty;
            deal.is_limit_exceeded = deal.actual_value > deal.limited_qty;
          } else if (deal.condition_mode === 'stepped') {
            // For stepped deals, just set actual_value to actual_qty
            deal.actual_value = deal.actual_qty;
            deal.achievement_percent = null; // Not applicable for stepped deals
            deal.is_limit_reached = false;
            deal.is_limit_exceeded = false;
          }

          console.log(`🔍 Final calculated values for deal ${deal.deal_id}:`, {
            actual_value: deal.actual_value,
            achievement_percent: deal.achievement_percent,
            is_limit_reached: deal.is_limit_reached,
            is_limit_exceeded: deal.is_limit_exceeded,
            limited_qty: deal.limited_qty,
            limited_unit: deal.limited_unit,
            limited_type: deal.limited_type
          });

        } catch (err) {
          console.error(`❌ Calculate actual for deal ${deal.deal_id} error:`, err);
          deal.actual_qty = 0;
          deal.actual_weight = 0;
          deal.actual_value = 0;
          if (deal.condition_mode === 'limited') {
            deal.achievement_percent = 0;
            deal.is_limit_reached = false;
            deal.is_limit_exceeded = false;
          } else if (deal.condition_mode === 'stepped') {
            deal.achievement_percent = null;
            deal.is_limit_reached = false;
            deal.is_limit_exceeded = false;
          }
        }
      }
    }

    res.json(deals);

  } catch (err) {
    console.error("❌ GET DEAL ERROR:", err);
    res.status(500).send(err.message);
  }
};


/* =====================================
   SAVE DEAL
===================================== */
export const saveSupplierDeal = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const {
      deal_name,
      contact_person,
      project_no,
      region,
      province,
      branch,
      category,
      brand,
      product_group,
      sub_group,
      color,
      thickness,
      mold,
      sku,
      deal_type,
      price_value,
      price_unit,
      condition_mode,
      limited_qty,
      limited_unit,
      limited_type,
      limited_discount_value,
      limited_discount_unit,
      steps,
      start_date,
      end_date,
      note,
      is_reopen,
      old_deal_id,
      require_pallet,
      supplier_delivery,
      base_price
    } = req.body;

    // REOPEN: Create new deal from cancelled deal
    if (is_reopen && old_deal_id) {
      const oldResult = await pool.request()
        .input("deal_id", sql.Int, old_deal_id)
        .query(`SELECT * FROM supplier_deal_price WHERE deal_id = @deal_id`);

      if (oldResult.recordset.length === 0) {
        return res.status(404).json({ error: 'ไม่พบดีลที่ต้องการเปิดใหม่' });
      }

      const oldDeal = oldResult.recordset[0];

      // Check if has_been_used column exists
      const columnCheck = await pool.request()
        .query(`
          SELECT COUNT(*) AS column_exists
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'has_been_used'
        `);
      const hasBeenUsedColumnExists = columnCheck.recordset[0].column_exists > 0;

      // Get has_been_used value
      let hasBeenUsed = false;
      if (hasBeenUsedColumnExists) {
        const hasBeenUsedResult = await pool.request()
          .input("deal_id", sql.Int, old_deal_id)
          .query(`SELECT has_been_used FROM supplier_deal_price WHERE deal_id = @deal_id`);
        hasBeenUsed = hasBeenUsedResult.recordset[0]?.has_been_used || false;
      }

      // If reopening and old deal has been used OR has expired, require changing dates
      const now = new Date();
      const oldEndDate = oldDeal.end_date ? new Date(oldDeal.end_date) : null;
      const isExpired = oldEndDate && now > oldEndDate;

      if (hasBeenUsed || isExpired) {
        const oldStartDate = oldDeal.start_date ? new Date(oldDeal.start_date) : null;
        const newStartDate = start_date ? new Date(start_date) : null;
        const newEndDate = end_date ? new Date(end_date) : null;

        const startDateChanged = oldStartDate && newStartDate && newStartDate.getTime() !== oldStartDate.getTime();
        const endDateChanged = oldEndDate && newEndDate && newEndDate.getTime() !== oldEndDate.getTime();

        if (!startDateChanged || !endDateChanged) {
          return res.status(400).json({ error: 'กรุณาเปลี่ยนวันที่เริ่มใช้ราคาและวันสิ้นสุดให้ต่างจากเดิม' });
        }
      }

      // Generate new deal_ref
      const buddhistYear = String(now.getFullYear() + 543).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const prefix = `PD${buddhistYear}${month}`;

      let deal_ref = null;
      try {
        const runningResult = await pool.request()
          .input("prefix", sql.NVarChar, prefix)
          .query(`
            SELECT ISNULL(MAX(TRY_CAST(RIGHT(deal_ref, 3) AS INT)), 0) + 1 AS next_running
            FROM supplier_deal_price WITH (UPDLOCK, HOLDLOCK)
            WHERE deal_ref LIKE @prefix + '%'
          `);
        const running = runningResult.recordset[0].next_running;
        deal_ref = `${prefix}${String(running).padStart(3, "0")}`;
      } catch (err) {
        console.log("deal_ref column not found, skipping reference generation");
      }

      const request = pool.request()
        .input("supplier_no", sql.NVarChar, supplierNo)
        .input("status", sql.NVarChar, "OPEN")
        .input("deal_name", sql.NVarChar, deal_name || oldDeal.deal_name)
        .input("contact_person", sql.NVarChar, contact_person || oldDeal.contact_person)
        .input("project_no", sql.NVarChar, project_no || oldDeal.project_no)
        .input("region", sql.NVarChar, region || oldDeal.region)
        .input("province", sql.NVarChar, province || oldDeal.province)
        .input("branch", sql.NVarChar, branch || oldDeal.branch)
        .input("category", sql.NVarChar, category || oldDeal.category)
        .input("brand", sql.NVarChar, brand || oldDeal.brand)
        .input("product_group", sql.NVarChar, product_group || oldDeal.product_group)
        .input("sub_group", sql.NVarChar, sub_group || oldDeal.sub_group)
        .input("color", sql.NVarChar, color || oldDeal.color)
        .input("thickness", sql.NVarChar, thickness || oldDeal.thickness)
        .input("mold", sql.NVarChar, mold || oldDeal.mold)
        .input("sku", sql.NVarChar, sku || oldDeal.sku)
        .input("deal_type", sql.NVarChar, deal_type || oldDeal.deal_type)
        .input("price_value", sql.Decimal(18,2), price_value ?? oldDeal.price_value)
        .input("price_unit", sql.NVarChar, price_unit || oldDeal.price_unit)
        .input("condition_mode", sql.NVarChar, condition_mode || oldDeal.condition_mode)
        .input("limited_qty", sql.Decimal(18,2), limited_qty ?? oldDeal.limited_qty)
        .input("limited_unit", sql.NVarChar, limited_unit || oldDeal.limited_unit)
        .input("limited_type", sql.NVarChar, limited_type || oldDeal.limited_type)
        .input("limited_discount_value", sql.Decimal(18,2), limited_discount_value ?? oldDeal.limited_discount_value)
        .input("limited_discount_unit", sql.NVarChar, limited_discount_unit || oldDeal.limited_discount_unit)
        .input("start_date", sql.Date, start_date || oldDeal.start_date)
        .input("end_date", sql.Date, end_date || oldDeal.end_date)
        .input("note", sql.NVarChar, note || oldDeal.note)
        .input("require_pallet", sql.Bit, require_pallet !== undefined ? require_pallet : (oldDeal.require_pallet || false))
        .input("supplier_delivery", sql.Bit, supplier_delivery !== undefined ? supplier_delivery : (oldDeal.supplier_delivery ?? true))
        .input("base_price", sql.Decimal(18,2), base_price ?? oldDeal.base_price);

      if (deal_ref) {
        request.input("deal_ref", sql.NVarChar, deal_ref);
      }

      const insertColumns = deal_ref
        ? `supplier_no, deal_ref, status, deal_name, contact_person, project_no, region, province, branch, category, brand, product_group, sub_group, color, thickness, mold, sku, deal_type, price_value, price_unit, condition_mode, limited_qty, limited_unit, limited_type, limited_discount_value, limited_discount_unit, start_date, end_date, note, require_pallet, supplier_delivery, base_price, created_at`
        : `supplier_no, status, deal_name, contact_person, project_no, region, province, branch, category, brand, product_group, sub_group, color, thickness, mold, sku, deal_type, price_value, price_unit, condition_mode, limited_qty, limited_unit, limited_type, limited_discount_value, limited_discount_unit, start_date, end_date, note, require_pallet, supplier_delivery, base_price, created_at`;

      const insertValues = deal_ref
        ? `@supplier_no, @deal_ref, @status, @deal_name, @contact_person, @project_no, @region, @province, @branch, @category, @brand, @product_group, @sub_group, @color, @thickness, @mold, @sku, @deal_type, @price_value, @price_unit, @condition_mode, @limited_qty, @limited_unit, @limited_type, @limited_discount_value, @limited_discount_unit, @start_date, @end_date, @note, @require_pallet, @supplier_delivery, @base_price, GETDATE()`
        : `@supplier_no, @status, @deal_name, @contact_person, @project_no, @region, @province, @branch, @category, @brand, @product_group, @sub_group, @color, @thickness, @mold, @sku, @deal_type, @price_value, @price_unit, @condition_mode, @limited_qty, @limited_unit, @limited_type, @limited_discount_value, @limited_discount_unit, @start_date, @end_date, @note, @require_pallet, @supplier_delivery, @base_price, GETDATE()`;

      const dealResult = await request.query(`
        INSERT INTO supplier_deal_price (${insertColumns}) VALUES (${insertValues});
        SELECT SCOPE_IDENTITY() AS deal_id;
      `);

      const new_deal_id = dealResult.recordset[0].deal_id;

      // Copy steps from old deal
      const oldStepsResult = await pool.request()
        .input("old_deal_id", sql.Int, old_deal_id)
        .query(`SELECT * FROM supplier_deal_price_steps WHERE deal_id = @old_deal_id`);

      for (const step of oldStepsResult.recordset) {
        await pool.request()
          .input("deal_id", sql.Int, new_deal_id)
          .input("step_number", sql.Int, step.step_number)
          .input("from_qty", sql.Decimal(18,2), step.from_qty)
          .input("to_qty", sql.Decimal(18,2), step.to_qty)
          .input("unit", sql.NVarChar, step.unit)
          .input("price_value", sql.Decimal(18,2), step.price_value)
          .input("price_unit", sql.NVarChar, step.price_unit)
          .query(`
            INSERT INTO supplier_deal_price_steps (deal_id, step_number, from_qty, to_qty, unit, price_value, price_unit)
            VALUES (@deal_id, @step_number, @from_qty, @to_qty, @unit, @price_value, @price_unit)
          `);
      }

      // Cancel old deal
      await pool.request()
        .input("deal_id", sql.Int, old_deal_id)
        .query(`
          UPDATE supplier_deal_price SET status = 'CANCELLED', updated_at = GETDATE() WHERE deal_id = @deal_id
        `);

      return res.json({ success: true, is_reopen: true, new_deal_id });
    }

    // Generate deal reference: PD/YYMM/NNN
    const now = new Date();
    const buddhistYear = String(now.getFullYear() + 543).slice(-2); // 2 หลักท้าย พ.ศ. (69)
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `PD${buddhistYear}${month}`;

    // Get next running number (handle case where deal_ref column doesn't exist yet)
    let deal_ref = null;
    try {
      const runningResult = await pool.request()
        .input("prefix", sql.NVarChar, prefix)
        .query(`
          SELECT ISNULL(MAX(
            TRY_CAST(RIGHT(deal_ref, 3) AS INT)
          ), 0) + 1 AS next_running
          FROM supplier_deal_price WITH (UPDLOCK, HOLDLOCK)
          WHERE deal_ref LIKE @prefix + '%'
        `);
      const running = runningResult.recordset[0].next_running;
      deal_ref = `${prefix}${String(running).padStart(3, "0")}`;
    } catch (err) {
      // deal_ref column doesn't exist yet, skip generating reference
      console.log("deal_ref column not found, skipping reference generation");
    }

    // Validate required fields
    const requiredFields = {
      deal_name: 'ชื่อดีลราคา',
      region: 'ภาค',
      province: 'จังหวัด',
      branch: 'สาขา',
      category: 'ประเภทสินค้า',
      brand: 'แบรนด์',
      product_group: 'กลุ่มสินค้า',
      deal_type: 'ประเภทดีล',
      condition_mode: 'กรอบเงื่อนไข'
    };

    const missingFields = [];
    for (const [field, label] of Object.entries(requiredFields)) {
      if (!req.body[field] && req.body[field] !== 0) {
        missingFields.push(label);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: `กรุณากรอกข้อมูลที่จำเป็น: ${missingFields.join(', ')}` 
      });
    }

    // Validate based on condition_mode
    if (condition_mode === 'normal') {
      // Normal mode - validate price_value and price_unit
      if (!price_value && price_value !== 0) {
        return res.status(400).json({ error: 'กรุณากรอกราคา' });
      }
      if (!price_unit) {
        return res.status(400).json({ error: 'กรุณาเลือกหน่วยราคา' });
      }
      if (isNaN(price_value) || price_value < 0) {
        return res.status(400).json({ error: 'กรุณากรอกราคาที่ถูกต้อง' });
      }
    } else if (condition_mode === 'limited') {
      // Limited mode - validate limited_qty and limited_unit
      if (!limited_qty && limited_qty !== 0) {
        return res.status(400).json({ error: 'กรุณากรอกจำนวนจำกัด' });
      }
      if (!limited_unit) {
        return res.status(400).json({ error: 'กรุณาเลือกหน่วยจำนวนจำกัด' });
      }
      if (isNaN(limited_qty) || limited_qty <= 0) {
        return res.status(400).json({ error: 'กรุณากรอกจำนวนจำกัดที่ถูกต้อง' });
      }
    } else if (condition_mode === 'stepped') {
      // Stepped mode - validate steps
      if (!steps || steps.length === 0) {
        return res.status(400).json({ error: 'กรุณาเพิ่มขั้นบันได้อย่างน้อย 1 ขั้น' });
      }
    }

    // Insert deal
    const pool2 = await getPool();
    const request = pool2.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .input("status", sql.NVarChar, "OPEN")
      .input("deal_name", sql.NVarChar, deal_name)
      .input("contact_person", sql.NVarChar, contact_person || null)
      .input("project_no", sql.NVarChar, project_no || null)
      .input("region", sql.NVarChar, region || null)
      .input("province", sql.NVarChar, province || null)
      .input("branch", sql.NVarChar, branch || null)
      .input("category", sql.NVarChar, category || null)
      .input("brand", sql.NVarChar, brand || null)
      .input("product_group", sql.NVarChar, product_group || null)
      .input("sub_group", sql.NVarChar, sub_group || null)
      .input("color", sql.NVarChar, color || null)
      .input("thickness", sql.NVarChar, thickness || null)
      .input("mold", sql.NVarChar, mold || null)
      .input("sku", sql.NVarChar, sku || null)
      .input("deal_type", sql.NVarChar, deal_type || null)
      .input("price_value", sql.Decimal(18,2), (condition_mode === 'normal' || condition_mode === 'limited') ? (price_value || 0) : null)
      .input("price_unit", sql.NVarChar, (condition_mode === 'normal' || condition_mode === 'limited') ? (price_unit || null) : null)
      .input("condition_mode", sql.NVarChar, condition_mode || 'limited')
      .input("limited_qty", sql.Decimal(18,2), limited_qty || null)
      .input("limited_unit", sql.NVarChar, limited_unit || null)
      .input("limited_type", sql.NVarChar, limited_type || null)
      .input("limited_discount_value", sql.Decimal(18,2), limited_discount_value || null)
      .input("limited_discount_unit", sql.NVarChar, limited_discount_unit || null)
      .input("start_date", sql.Date, start_date || null)
      .input("end_date", sql.Date, end_date || null)
      .input("note", sql.NVarChar, note || null)
      .input("require_pallet", sql.Bit, require_pallet !== undefined ? require_pallet : false)
      .input("supplier_delivery", sql.Bit, supplier_delivery !== undefined ? supplier_delivery : true)
      .input("base_price", sql.Decimal(18,2), base_price || null);

    // Add deal_ref only if it was generated
    if (deal_ref) {
      request.input("deal_ref", sql.NVarChar, deal_ref);
    }

    // Build INSERT query dynamically based on whether deal_ref exists
    const insertColumns = deal_ref 
? `supplier_no, deal_ref, status, deal_name, contact_person, project_no, region, province, branch, category, brand, product_group, sub_group, color, thickness, mold, sku, deal_type, price_value, price_unit, condition_mode, limited_qty, limited_unit, limited_type, limited_discount_value, limited_discount_unit, start_date, end_date, note, require_pallet, supplier_delivery, base_price, created_at`
        : `supplier_no, status, deal_name, contact_person, project_no, region, province, branch, category, brand, product_group, sub_group, color, thickness, mold, sku, deal_type, price_value, price_unit, condition_mode, limited_qty, limited_unit, limited_type, limited_discount_value, limited_discount_unit, start_date, end_date, note, require_pallet, supplier_delivery, base_price, created_at`;

      const insertValues = deal_ref
        ? `@supplier_no, @deal_ref, @status, @deal_name, @contact_person, @project_no, @region, @province, @branch, @category, @brand, @product_group, @sub_group, @color, @thickness, @mold, @sku, @deal_type, @price_value, @price_unit, @condition_mode, @limited_qty, @limited_unit, @limited_type, @limited_discount_value, @limited_discount_unit, @start_date, @end_date, @note, @require_pallet, @supplier_delivery, @base_price, GETDATE()`
        : `@supplier_no, @status, @deal_name, @contact_person, @project_no, @region, @province, @branch, @category, @brand, @product_group, @sub_group, @color, @thickness, @mold, @sku, @deal_type, @price_value, @price_unit, @condition_mode, @limited_qty, @limited_unit, @limited_type, @limited_discount_value, @limited_discount_unit, @start_date, @end_date, @note, @require_pallet, @supplier_delivery, @base_price, GETDATE()`;

    const dealResult = await request.query(`
        INSERT INTO supplier_deal_price (
          ${insertColumns}
        )
        VALUES (
          ${insertValues}
        );
        SELECT SCOPE_IDENTITY() AS deal_id;
      `);

    const deal_id = dealResult.recordset[0].deal_id;

    // Validate stepped pricing if condition_mode is 'stepped'
    if (condition_mode === 'stepped' && steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Validate step data
        if (!step.from_qty || !step.to_qty || !step.price_value) {
          return res.status(400).json({ error: `กรุณากรอกข้อมูลขั้นบันไดให้ครบถ้วน (ขั้นที่ ${i + 1})` });
        }
        
        if (isNaN(step.from_qty) || isNaN(step.to_qty) || isNaN(step.price_value)) {
          return res.status(400).json({ error: `กรุณากรอกตัวเลขที่ถูกต้องสำหรับขั้นบันได (ขั้นที่ ${i + 1})` });
        }
        
        if (step.from_qty >= step.to_qty) {
          return res.status(400).json({ error: `จำนวนเริ่มต้นต้องน้อยกว่าจำนวนสิ้นสุด (ขั้นที่ ${i + 1})` });
        }
        
        if (step.price_value < 0) {
          return res.status(400).json({ error: `ราคาต้องไม่ติดลบ (ขั้นที่ ${i + 1})` });
        }
      }
      
      // Check for overlapping ranges
      for (let i = 0; i < steps.length; i++) {
        for (let j = i + 1; j < steps.length; j++) {
          if (steps[i].from_qty < steps[j].to_qty && steps[i].to_qty > steps[j].from_qty) {
            return res.status(400).json({ error: `ขั้นบันไดทับซ้อนกันระหว่างขั้นที่ ${i + 1} และ ${j + 1}` });
          }
        }
      }
    }

    // Save stepped pricing if condition_mode is 'stepped'
    if (condition_mode === 'stepped' && steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await pool.request()
          .input("deal_id", sql.Int, deal_id)
          .input("step_number", sql.Int, i + 1)
          .input("from_qty", sql.Decimal(18,2), step.from_qty)
          .input("to_qty", sql.Decimal(18,2), step.to_qty)
          .input("unit", sql.NVarChar, step.unit || 'ชิ้น')
          .input("price_value", sql.Decimal(18,2), step.price_value)
          .input("price_unit", sql.NVarChar, step.price_unit)
          .query(`
            INSERT INTO supplier_deal_price_steps (
              deal_id,
              step_number,
              from_qty,
              to_qty,
              unit,
              price_value,
              price_unit,
              created_at
            )
            VALUES (
              @deal_id,
              @step_number,
              @from_qty,
              @to_qty,
              @unit,
              @price_value,
              @price_unit,
              GETDATE()
            )
          `);
      }
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ SAVE DEAL ERROR:", err);
    res.status(500).send(err.message);
  }
};


/* =====================================
   TOGGLE STATUS
===================================== */
export const toggleSupplierDealStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Check if has_been_used column exists
    const columnCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'has_been_used'
      `);
    const hasBeenUsedColumnExists = columnCheck.recordset[0].column_exists > 0;

    // Get current status and has_been_used flag to validate transition
    const currentResult = await pool.request()
      .input("deal_id", sql.Int, id)
      .query(`
        SELECT status${hasBeenUsedColumnExists ? ', has_been_used' : ''} FROM supplier_deal_price
        WHERE deal_id = @deal_id
      `);

    if (currentResult.recordset.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลที่ต้องการ' });
    }

    const currentStatus = currentResult.recordset[0].status;
    const hasBeenUsed = hasBeenUsedColumnExists ? currentResult.recordset[0].has_been_used : false;

    // Validate status transition: Cannot change from USE to OPEN directly
    if (currentStatus === 'USE') {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสถานะจาก USE เป็น OPEN ได้โดยตรง' });
    }

    // If reopening from CANCELLED or CLOSED, create new deal (reopen) instead of just changing status
    if (currentStatus === 'CANCELLED' || currentStatus === 'CLOSED') {
      // Get old deal data
      const oldDealResult = await pool.request()
        .input("deal_id", sql.Int, id)
        .query(`SELECT * FROM supplier_deal_price WHERE deal_id = @deal_id`);

      if (oldDealResult.recordset.length === 0) {
        return res.status(404).json({ error: 'ไม่พบดีลที่ต้องการ' });
      }

      const oldDeal = oldDealResult.recordset[0];
      let useNewDates = false;

      // Check if deal has expired
      const now = new Date();
      const endDate = oldDeal.end_date ? new Date(oldDeal.end_date) : null;
      const isExpired = endDate && now > endDate;

      // If has been used before OR deal has expired, require changing dates
      if (hasBeenUsed || isExpired) {
        const { start_date: newStartDate, end_date: newEndDate } = req.body || {};
        
        if (!newStartDate || !newEndDate) {
          return res.status(400).json({ error: 'กรุณาระบุวันที่เริ่มใช้ราคาและวันสิ้นสุด' });
        }

        const oldStartDate = oldDeal.start_date ? new Date(oldDeal.start_date) : null;
        const oldEndDate = oldDeal.end_date ? new Date(oldDeal.end_date) : null;
        const reqStartDate = new Date(newStartDate);
        const reqEndDate = new Date(newEndDate);

        const startDateChanged = oldStartDate && reqStartDate.getTime() !== oldStartDate.getTime();
        const endDateChanged = oldEndDate && reqEndDate.getTime() !== oldEndDate.getTime();

        if (!startDateChanged || !endDateChanged) {
          return res.status(400).json({ error: 'กรุณาเปลี่ยนวันที่เริ่มใช้ราคาและวันสิ้นสุดให้ต่างจากเดิม' });
        }

        useNewDates = true;
      }

      // Generate new deal_ref
      const buddhistYear = String(now.getFullYear() + 543).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const prefix = `PD${buddhistYear}${month}`;

      let deal_ref = null;
      try {
        const runningResult = await pool.request()
          .input("prefix", sql.NVarChar, prefix)
          .query(`
            SELECT ISNULL(MAX(TRY_CAST(RIGHT(deal_ref, 3) AS INT)), 0) + 1 AS next_running
            FROM supplier_deal_price WITH (UPDLOCK, HOLDLOCK)
            WHERE deal_ref LIKE @prefix + '%'
          `);
        const running = runningResult.recordset[0].next_running;
        deal_ref = `${prefix}${String(running).padStart(3, "0")}`;
      } catch (err) {
        console.log("deal_ref column not found, skipping reference generation");
      }

      // Create new deal with same dates as old deal (user can edit later)
      const request = pool.request()
        .input("supplier_no", sql.NVarChar, oldDeal.supplier_no)
        .input("status", sql.NVarChar, "OPEN")
        .input("deal_name", sql.NVarChar, oldDeal.deal_name)
        .input("contact_person", sql.NVarChar, oldDeal.contact_person)
        .input("project_no", sql.NVarChar, oldDeal.project_no)
        .input("region", sql.NVarChar, oldDeal.region)
        .input("province", sql.NVarChar, oldDeal.province)
        .input("branch", sql.NVarChar, oldDeal.branch)
        .input("category", sql.NVarChar, oldDeal.category)
        .input("brand", sql.NVarChar, oldDeal.brand)
        .input("product_group", sql.NVarChar, oldDeal.product_group)
        .input("sub_group", sql.NVarChar, oldDeal.sub_group)
        .input("color", sql.NVarChar, oldDeal.color)
        .input("thickness", sql.NVarChar, oldDeal.thickness)
        .input("mold", sql.NVarChar, oldDeal.mold)
        .input("sku", sql.NVarChar, oldDeal.sku)
        .input("deal_type", sql.NVarChar, oldDeal.deal_type)
        .input("price_value", sql.Decimal(18,2), oldDeal.price_value)
        .input("price_unit", sql.NVarChar, oldDeal.price_unit)
        .input("condition_mode", sql.NVarChar, oldDeal.condition_mode)
        .input("limited_qty", sql.Decimal(18,2), oldDeal.limited_qty)
        .input("limited_unit", sql.NVarChar, oldDeal.limited_unit)
        .input("limited_type", sql.NVarChar, oldDeal.limited_type)
        .input("limited_discount_value", sql.Decimal(18,2), oldDeal.limited_discount_value)
        .input("limited_discount_unit", sql.NVarChar, oldDeal.limited_discount_unit)
        .input("start_date", sql.Date, useNewDates ? req.body.start_date : oldDeal.start_date)
        .input("end_date", sql.Date, useNewDates ? req.body.end_date : oldDeal.end_date)
        .input("note", sql.NVarChar, oldDeal.note);

      if (deal_ref) {
        request.input("deal_ref", sql.NVarChar, deal_ref);
      }

      const insertColumns = deal_ref
        ? `supplier_no, deal_ref, status, deal_name, contact_person, project_no, region, province, branch, category, brand, product_group, sub_group, color, thickness, mold, sku, deal_type, price_value, price_unit, condition_mode, limited_qty, limited_unit, limited_type, limited_discount_value, limited_discount_unit, start_date, end_date, note, created_at`
        : `supplier_no, status, deal_name, contact_person, project_no, region, province, branch, category, brand, product_group, sub_group, color, thickness, mold, sku, deal_type, price_value, price_unit, condition_mode, limited_qty, limited_unit, limited_type, limited_discount_value, limited_discount_unit, start_date, end_date, note, created_at`;

      const insertValues = deal_ref
        ? `@supplier_no, @deal_ref, @status, @deal_name, @contact_person, @project_no, @region, @province, @branch, @category, @brand, @product_group, @sub_group, @color, @thickness, @mold, @sku, @deal_type, @price_value, @price_unit, @condition_mode, @limited_qty, @limited_unit, @limited_type, @limited_discount_value, @limited_discount_unit, @start_date, @end_date, @note, GETDATE()`
        : `@supplier_no, @status, @deal_name, @contact_person, @project_no, @region, @province, @branch, @category, @brand, @product_group, @sub_group, @color, @thickness, @mold, @sku, @deal_type, @price_value, @price_unit, @condition_mode, @limited_qty, @limited_unit, @limited_type, @limited_discount_value, @limited_discount_unit, @start_date, @end_date, @note, GETDATE()`;

      const dealResult = await request.query(`
        INSERT INTO supplier_deal_price (${insertColumns}) VALUES (${insertValues});
        SELECT SCOPE_IDENTITY() AS deal_id;
      `);

      const new_deal_id = dealResult.recordset[0].deal_id;

      // Copy steps from old deal
      const oldStepsResult = await pool.request()
        .input("deal_id", sql.Int, id)
        .query(`SELECT * FROM supplier_deal_price_steps WHERE deal_id = @deal_id`);

      for (const step of oldStepsResult.recordset) {
        await pool.request()
          .input("deal_id", sql.Int, new_deal_id)
          .input("step_number", sql.Int, step.step_number)
          .input("from_qty", sql.Decimal(18,2), step.from_qty)
          .input("to_qty", sql.Decimal(18,2), step.to_qty)
          .input("unit", sql.NVarChar, step.unit)
          .input("price_value", sql.Decimal(18,2), step.price_value)
          .input("price_unit", sql.NVarChar, step.price_unit)
          .query(`
            INSERT INTO supplier_deal_price_steps (deal_id, step_number, from_qty, to_qty, unit, price_value, price_unit)
            VALUES (@deal_id, @step_number, @from_qty, @to_qty, @unit, @price_value, @price_unit)
          `);
      }

      return res.json({ success: true, is_reopen: true, new_deal_id, message: 'ทำซ้ำดีลสำเร็จ กรุณาแก้ไขวันที่และบันทึก' });
    }

    // Normal status toggle for OPEN -> CANCELLED
    await pool.request()
      .input("deal_id", sql.Int, id)
      .query(`
        UPDATE supplier_deal_price
        SET
          status = CASE 
                     WHEN status = 'OPEN' THEN 'CANCELLED'
                     WHEN status = 'CANCELLED' THEN 'OPEN'
                     WHEN status = 'CLOSED' THEN 'OPEN'
                     ELSE status
                   END,
          updated_at = GETDATE()
        WHERE deal_id = @deal_id
      `);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ TOGGLE DEAL ERROR:", err);
    res.status(500).send(err.message);
  }
};

/* =====================================
   UPDATE DEAL
===================================== */
export const updateSupplierDeal = async (req, res) => {
  try {
    const { supplierNo, id } = req.params;
    const pool = await getPool();

    const {
      deal_name,
      contact_person,
      project_no,
      region,
      province,
      branch,
      category,
      brand,
      product_group,
      sub_group,
      color,
      thickness,
      mold,
      sku,
      deal_type,
      price_value,
      price_unit,
      condition_mode,
      limited_qty,
      limited_unit,
      limited_type,
      limited_discount_value,
      limited_discount_unit,
      steps,
      start_date,
      end_date,
      note,
      require_pallet
    } = req.body;

    // Validate required fields
    const requiredFields = {
      deal_name: 'ชื่อดีลราคา',
      region: 'ภาค',
      province: 'จังหวัด',
      branch: 'สาขา',
      category: 'ประเภทสินค้า',
      brand: 'แบรนด์',
      product_group: 'กลุ่มสินค้า',
      deal_type: 'ประเภทดีล',
      condition_mode: 'กรอบเงื่อนไข'
    };

    const missingFields = [];
    for (const [field, label] of Object.entries(requiredFields)) {
      if (!req.body[field] && req.body[field] !== 0) {
        missingFields.push(label);
      }
    }

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: `กรุณากรอกข้อมูลที่จำเป็น: ${missingFields.join(', ')}` 
      });
    }

    // Validate based on condition_mode
    if (condition_mode === 'normal') {
      if (!price_value && price_value !== 0) {
        return res.status(400).json({ error: 'กรุณากรอกราคา' });
      }
      if (!price_unit) {
        return res.status(400).json({ error: 'กรุณาเลือกหน่วยราคา' });
      }
      if (isNaN(price_value) || price_value < 0) {
        return res.status(400).json({ error: 'กรุณากรอกราคาที่ถูกต้อง' });
      }
    } else if (condition_mode === 'limited') {
      if (!limited_qty && limited_qty !== 0) {
        return res.status(400).json({ error: 'กรุณากรอกจำนวนจำกัด' });
      }
      if (!limited_unit) {
        return res.status(400).json({ error: 'กรุณาเลือกหน่วยจำนวนจำกัด' });
      }
      if (isNaN(limited_qty) || limited_qty <= 0) {
        return res.status(400).json({ error: 'กรุณากรอกจำนวนจำกัดที่ถูกต้อง' });
      }
    } else if (condition_mode === 'stepped') {
      if (!steps || steps.length === 0) {
        return res.status(400).json({ error: 'กรุณาเพิ่มขั้นบันได้อย่างน้อย 1 ขั้น' });
      }
    }

    // Check if deal exists and belongs to this supplier
    const dealCheck = await pool.request()
      .input("deal_id", sql.Int, id)
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        SELECT deal_id, status, start_date, end_date, has_been_used FROM supplier_deal_price
        WHERE deal_id = @deal_id AND supplier_no = @supplier_no
      `);

    if (dealCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลที่ต้องการ' });
    }

    const currentStatus = dealCheck.recordset[0].status;
    const currentStartDate = dealCheck.recordset[0].start_date;
    const currentEndDate = dealCheck.recordset[0].end_date;
    const hasBeenUsed = dealCheck.recordset[0].has_been_used;

    // Check if deal has expired
    const isExpired = currentEndDate && new Date() > new Date(currentEndDate);

    // Cannot edit if status is USE
    if (currentStatus === 'USE') {
      return res.status(400).json({ error: 'ไม่สามารถแก้ไขได้ เนื่องจากดีลกำลังถูกใช้งาน' });
    }

    // Update deal
    const updateRequest = pool.request()
      .input("deal_id", sql.Int, id)
      .input("deal_name", sql.NVarChar, deal_name)
      .input("contact_person", sql.NVarChar, contact_person || null)
      .input("project_no", sql.NVarChar, project_no || null)
      .input("region", sql.NVarChar, region || null)
      .input("province", sql.NVarChar, province || null)
      .input("branch", sql.NVarChar, branch || null)
      .input("category", sql.NVarChar, category || null)
      .input("brand", sql.NVarChar, brand || null)
      .input("product_group", sql.NVarChar, product_group || null)
      .input("sub_group", sql.NVarChar, sub_group || null)
      .input("color", sql.NVarChar, color || null)
      .input("thickness", sql.NVarChar, thickness || null)
      .input("mold", sql.NVarChar, mold || null)
      .input("sku", sql.NVarChar, sku || null)
      .input("deal_type", sql.NVarChar, deal_type || null)
      .input("price_value", sql.Decimal(18,2), (condition_mode === 'normal' || condition_mode === 'limited') ? (price_value || 0) : null)
      .input("price_unit", sql.NVarChar, (condition_mode === 'normal' || condition_mode === 'limited') ? (price_unit || null) : null)
      .input("condition_mode", sql.NVarChar, condition_mode || 'limited')
      .input("limited_qty", sql.Decimal(18,2), limited_qty || null)
      .input("limited_unit", sql.NVarChar, limited_unit || null)
      .input("limited_type", sql.NVarChar, limited_type || null)
      .input("limited_discount_value", sql.Decimal(18,2), limited_discount_value || null)
      .input("limited_discount_unit", sql.NVarChar, limited_discount_unit || null)
      .input("start_date", sql.Date, start_date || null)
      .input("end_date", sql.Date, end_date || null)
      .input("note", sql.NVarChar, note || null)
      .input("require_pallet", sql.Bit, require_pallet !== undefined ? require_pallet : false);

    // Build UPDATE query
    const updateColumns = `
      deal_name = @deal_name,
      contact_person = @contact_person,
      project_no = @project_no,
      region = @region,
      province = @province,
      branch = @branch,
      category = @category,
      brand = @brand,
      product_group = @product_group,
      sub_group = @sub_group,
      color = @color,
      thickness = @thickness,
      mold = @mold,
      sku = @sku,
      deal_type = @deal_type,
      price_value = @price_value,
      price_unit = @price_unit,
      condition_mode = @condition_mode,
      limited_qty = @limited_qty,
      limited_unit = @limited_unit,
      limited_type = @limited_type,
      limited_discount_value = @limited_discount_value,
      limited_discount_unit = @limited_discount_unit,
      start_date = @start_date,
      end_date = @end_date,
      note = @note,
      require_pallet = @require_pallet,
      updated_at = GETDATE()
    `;

    await updateRequest.query(`
        UPDATE supplier_deal_price
        SET
          ${updateColumns}
        WHERE deal_id = @deal_id
      `);

    // Update stepped pricing if condition_mode is 'stepped'
    if (condition_mode === 'stepped' && steps && steps.length > 0) {
      // Delete existing steps
      await pool.request()
        .input("deal_id", sql.Int, id)
        .query(`DELETE FROM supplier_deal_price_steps WHERE deal_id = @deal_id`);

      // Validate steps
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        if (!step.from_qty || !step.to_qty || !step.price_value) {
          return res.status(400).json({ error: `กรุณากรอกข้อมูลขั้นบันไดให้ครบถ้วน (ขั้นที่ ${i + 1})` });
        }
        
        if (isNaN(step.from_qty) || isNaN(step.to_qty) || isNaN(step.price_value)) {
          return res.status(400).json({ error: `กรุณากรอกตัวเลขที่ถูกต้องสำหรับขั้นบันได (ขั้นที่ ${i + 1})` });
        }
        
        if (step.from_qty >= step.to_qty) {
          return res.status(400).json({ error: `จำนวนเริ่มต้นต้องน้อยกว่าจำนวนสิ้นสุด (ขั้นที่ ${i + 1})` });
        }
        
        if (step.price_value < 0) {
          return res.status(400).json({ error: `ราคาต้องไม่ติดลบ (ขั้นที่ ${i + 1})` });
        }
      }
      
      // Check for overlapping ranges
      for (let i = 0; i < steps.length; i++) {
        for (let j = i + 1; j < steps.length; j++) {
          if (steps[i].from_qty < steps[j].to_qty && steps[i].to_qty > steps[j].from_qty) {
            return res.status(400).json({ error: `ขั้นบันไดทับซ้อนกันระหว่างขั้นที่ ${i + 1} และ ${j + 1}` });
          }
        }
      }
      
      // Insert new steps
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await pool.request()
          .input("deal_id", sql.Int, id)
          .input("step_number", sql.Int, i + 1)
          .input("from_qty", sql.Decimal(18,2), step.from_qty)
          .input("to_qty", sql.Decimal(18,2), step.to_qty)
          .input("unit", sql.NVarChar, step.unit || 'ชิ้น')
          .input("price_value", sql.Decimal(18,2), step.price_value)
          .input("price_unit", sql.NVarChar, step.price_unit)
          .query(`
            INSERT INTO supplier_deal_price_steps (
              deal_id,
              step_number,
              from_qty,
              to_qty,
              unit,
              price_value,
              price_unit,
              created_at
            )
            VALUES (
              @deal_id,
              @step_number,
              @from_qty,
              @to_qty,
              @unit,
              @price_value,
              @price_unit,
              GETDATE()
            )
          `);
      }
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ UPDATE DEAL ERROR:", err);
    res.status(500).send(err.message);
  }
};

/* =====================================
   UPDATE STATUS
===================================== */
export const updateSupplierDealStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const pool = await getPool();

    // Validate status
    const validStatuses = ['OPEN', 'USE', 'CANCELLED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
    }

    // Check if has_been_used column exists
    const columnCheck = await pool.request()
      .query(`
        SELECT COUNT(*) AS column_exists
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'has_been_used'
      `);
    const hasBeenUsedColumnExists = columnCheck.recordset[0].column_exists > 0;

    // Get current status and has_been_used flag to validate transition
    const currentResult = await pool.request()
      .input("deal_id", sql.Int, id)
      .query(`
        SELECT status${hasBeenUsedColumnExists ? ', has_been_used' : ''} FROM supplier_deal_price
        WHERE deal_id = @deal_id
      `);

    if (currentResult.recordset.length === 0) {
      return res.status(404).json({ error: 'ไม่พบดีลที่ต้องการ' });
    }

    const currentStatus = currentResult.recordset[0].status;
    const hasBeenUsed = hasBeenUsedColumnExists ? currentResult.recordset[0].has_been_used : false;

    // Validate status transition: Cannot change from USE to OPEN directly
    // But allow reopening CANCELLED deals even if they were used before
    if (currentStatus === 'USE' && status === 'OPEN') {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสถานะจาก USE เป็น OPEN ได้โดยตรง' });
    }

    // Cannot change from CANCELLED directly to USE - must be OPEN first
    if (currentStatus === 'CANCELLED' && status === 'USE') {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสถานะจาก CANCELLED เป็น USE ได้โดยตรง กรุณาเปลี่ยนเป็น OPEN ก่อน' });
    }

    // Cannot change from CLOSED directly to USE - must be OPEN first
    if (currentStatus === 'CLOSED' && status === 'USE') {
      return res.status(400).json({ error: 'ไม่สามารถเปลี่ยนสถานะจาก CLOSED เป็น USE ได้โดยตรง กรุณาเปลี่ยนเป็น OPEN ก่อน' });
    }

    // Set has_been_used flag when status changes to USE (only if column exists)
    if (hasBeenUsedColumnExists) {
      const setHasBeenUsed = status === 'USE' ? 1 : 0;

      await pool.request()
        .input("deal_id", sql.Int, id)
        .input("status", sql.NVarChar, status)
        .input("has_been_used", sql.Bit, setHasBeenUsed)
        .query(`
          UPDATE supplier_deal_price
          SET
            status = @status,
            has_been_used = CASE WHEN @has_been_used = 1 THEN 1 ELSE has_been_used END,
            updated_at = GETDATE()
          WHERE deal_id = @deal_id
        `);
    } else {
      await pool.request()
        .input("deal_id", sql.Int, id)
        .input("status", sql.NVarChar, status)
        .query(`
          UPDATE supplier_deal_price
          SET
            status = @status,
            updated_at = GETDATE()
          WHERE deal_id = @deal_id
        `);
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ UPDATE DEAL STATUS ERROR:", err);
    res.status(500).send(err.message);
  }
};
