import { getPool, sql } from "../config/db.js";

export const getSupplierDealsSimple = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    console.log("getSupplierDealsSimple called for:", supplierNo);
    const pool = await getPool();

    // ดึง deals พร้อม steps ในคำสั่งเดียว
    const dealResult = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        SELECT * FROM supplier_deal_price 
        WHERE supplier_no = @supplier_no
        ORDER BY deal_id DESC
      `);

    const deals = dealResult.recordset;

    if (deals.length === 0) {
      return res.json([]);
    }

    // ดึง steps ของทุก deal ในครั้งเดียว
    const dealIds = deals.map(d => d.deal_id);
    const stepsResult = await pool.request()
      .query(`
        SELECT deal_id, step_number, from_qty, to_qty, price_value, price_unit
        FROM supplier_deal_price_steps
        WHERE deal_id IN (${dealIds.join(",")})
        ORDER BY deal_id, step_number
      `);

    // Group steps by deal_id
    const stepsMap = {};
    stepsResult.recordset.forEach(s => {
      if (!stepsMap[s.deal_id]) stepsMap[s.deal_id] = [];
      stepsMap[s.deal_id].push(s);
    });

    // แนบ steps เข้ากับแต่ละ deal
    deals.forEach(d => {
      d.steps = stepsMap[d.deal_id] || [];
    });

    console.log("Query result:", deals.length, "records");
    res.json(deals);
  } catch (err) {
    console.error("getSupplierDealsSimple error:", err);
    res.status(500).json({ error: "Failed to load deals: " + err.message });
  }
};

export const saveSupplierDealSimple = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const {
      sku,
      branch,
      base_price,
      deal_name,
      project_no,
      note,
      condition_mode,
      deal_type,
      price_value,
      price_unit,
      start_date,
      end_date,
      require_pallet,
      supplier_delivery,
      steps
    } = req.body;

    // ตรวจสอบว่า optional columns มีอยู่ใน table หรือไม่
    const colCheck = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'supplier_deal_price'
        AND COLUMN_NAME IN ('require_pallet', 'supplier_delivery', 'project_no', 'note')
    `);
    const existingCols = new Set(colCheck.recordset.map(r => r.COLUMN_NAME));
    const hasRequirePallet    = existingCols.has('require_pallet');
    const hasSupplierDelivery = existingCols.has('supplier_delivery');
    const hasProjectNo        = existingCols.has('project_no');
    const hasNote             = existingCols.has('note');

    // ตรวจสอบว่ามี deal เดิมที่ยัง active อยู่ (OPEN/USE) สำหรับ SKU+branch+deal_name นี้หรือไม่
    const existingCheck = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .input("sku",         sql.NVarChar, sku || "")
      .input("branch",      sql.NVarChar, branch || "")
      .input("deal_name",   sql.NVarChar, deal_name || "")
      .query(`
        SELECT TOP 1 deal_id
        FROM supplier_deal_price
        WHERE supplier_no = @supplier_no
          AND sku         = @sku
          AND branch      = @branch
          AND deal_name   = @deal_name
          AND status IN ('OPEN', 'USE')
        ORDER BY deal_id DESC
      `);

    const existingDealId = existingCheck.recordset[0]?.deal_id ?? null;

    if (existingDealId) {
      // ===== UPDATE deal เดิม =====
      const updateReq = pool.request()
        .input("deal_id",      sql.Int,          existingDealId)
        .input("base_price",   sql.Decimal(18,2), base_price || 0)
        .input("condition_mode", sql.NVarChar,   condition_mode || "normal")
        .input("deal_type",    sql.NVarChar,     deal_type || "Discount")
        .input("price_value",  sql.Decimal(18,2), price_value || 0)
        .input("price_unit",   sql.NVarChar,     price_unit || "บาท")
        .input("start_date",   sql.Date,         start_date && String(start_date).trim() !== "" ? start_date : null)
        .input("end_date",     sql.Date,         end_date   && String(end_date).trim()   !== "" ? end_date   : null);

      const updateCols = [
        "base_price = @base_price",
        "condition_mode = @condition_mode",
        "deal_type = @deal_type",
        "price_value = @price_value",
        "price_unit = @price_unit",
        "start_date = @start_date",
        "end_date = @end_date",
        "updated_at = GETDATE()"
      ];

      if (hasProjectNo)  { updateReq.input("project_no", sql.NVarChar, project_no || ""); updateCols.push("project_no = @project_no"); }
      if (hasNote)       { updateReq.input("note",       sql.NVarChar, note || "");       updateCols.push("note = @note"); }
      if (hasRequirePallet)    { updateReq.input("require_pallet",    sql.Bit, require_pallet    !== undefined ? require_pallet    : true);  updateCols.push("require_pallet = @require_pallet"); }
      if (hasSupplierDelivery) { updateReq.input("supplier_delivery", sql.Bit, supplier_delivery !== undefined ? supplier_delivery : true); updateCols.push("supplier_delivery = @supplier_delivery"); }

      await updateReq.query(`
        UPDATE supplier_deal_price
        SET ${updateCols.join(", ")}
        WHERE deal_id = @deal_id
      `);

      // อัปเดต steps ถ้ามี
      if (steps && steps.length > 0) {
        await pool.request()
          .input("deal_id", sql.Int, existingDealId)
          .query(`DELETE FROM supplier_deal_price_steps WHERE deal_id = @deal_id`);

        for (const step of steps) {
          await pool.request()
            .input("deal_id",     sql.Int,          existingDealId)
            .input("step_number", sql.Int,          step.tier || 1)
            .input("from_qty",    sql.Decimal(18,2), step.from_qty || 0)
            .input("to_qty",      sql.Decimal(18,2), step.to_qty || 0)
            .input("price_value", sql.Decimal(18,2), step.price_value || 0)
            .input("price_unit",  sql.NVarChar,     step.price_unit || "บาท")
            .query(`
              INSERT INTO supplier_deal_price_steps (deal_id, step_number, from_qty, to_qty, price_value, price_unit)
              VALUES (@deal_id, @step_number, @from_qty, @to_qty, @price_value, @price_unit)
            `);
        }
      }

      return res.json({ success: true, deal_id: existingDealId, action: "updated" });
    }

    // ===== INSERT deal ใหม่ =====
    const cols = [
      'supplier_no', 'status', 'deal_name',
      'sku', 'branch', 'base_price', 'condition_mode', 'deal_type',
      'price_value', 'price_unit', 'start_date', 'end_date', 'created_at'
    ];
    const vals = [
      '@supplier_no', '@status', '@deal_name',
      '@sku', '@branch', '@base_price', '@condition_mode', '@deal_type',
      '@price_value', '@price_unit', '@start_date', '@end_date', 'GETDATE()'
    ];

    if (hasProjectNo)        { cols.push('project_no');        vals.push('@project_no'); }
    if (hasNote)             { cols.push('note');              vals.push('@note'); }
    if (hasRequirePallet)    { cols.push('require_pallet');    vals.push('@require_pallet'); }
    if (hasSupplierDelivery) { cols.push('supplier_delivery'); vals.push('@supplier_delivery'); }

    const insertReq = pool.request()
      .input("supplier_no",    sql.NVarChar,     supplierNo)
      .input("status",         sql.NVarChar,     "OPEN")
      .input("deal_name",      sql.NVarChar,     deal_name || "")
      .input("sku",            sql.NVarChar,     sku || "")
      .input("branch",         sql.NVarChar,     branch || "")
      .input("base_price",     sql.Decimal(18,2), base_price || 0)
      .input("condition_mode", sql.NVarChar,     condition_mode || "normal")
      .input("deal_type",      sql.NVarChar,     deal_type || "Discount")
      .input("price_value",    sql.Decimal(18,2), price_value || 0)
      .input("price_unit",     sql.NVarChar,     price_unit || "บาท")
      .input("start_date",     sql.Date,         start_date && String(start_date).trim() !== "" ? start_date : null)
      .input("end_date",       sql.Date,         end_date   && String(end_date).trim()   !== "" ? end_date   : null);

    if (hasProjectNo)        insertReq.input("project_no",        sql.NVarChar, project_no || "");
    if (hasNote)             insertReq.input("note",              sql.NVarChar, note || "");
    if (hasRequirePallet)    insertReq.input("require_pallet",    sql.Bit,      require_pallet    !== undefined ? require_pallet    : true);
    if (hasSupplierDelivery) insertReq.input("supplier_delivery", sql.Bit,      supplier_delivery !== undefined ? supplier_delivery : true);

    const result = await insertReq.query(`
      INSERT INTO supplier_deal_price (${cols.join(", ")})
      VALUES (${vals.join(", ")});
      SELECT SCOPE_IDENTITY() AS deal_id;
    `);

    const newDealId = result.recordset[0].deal_id;

    if (steps && steps.length > 0) {
      for (const step of steps) {
        await pool.request()
          .input("deal_id",     sql.Int,          newDealId)
          .input("step_number", sql.Int,          step.tier || 1)
          .input("from_qty",    sql.Decimal(18,2), step.from_qty || 0)
          .input("to_qty",      sql.Decimal(18,2), step.to_qty || 0)
          .input("price_value", sql.Decimal(18,2), step.price_value || 0)
          .input("price_unit",  sql.NVarChar,     step.price_unit || "บาท")
          .query(`
            INSERT INTO supplier_deal_price_steps (deal_id, step_number, from_qty, to_qty, price_value, price_unit)
            VALUES (@deal_id, @step_number, @from_qty, @to_qty, @price_value, @price_unit)
          `);
      }
    }

    res.json({ success: true, deal_id: newDealId, action: "inserted" });
  } catch (err) {
    console.error("saveSupplierDealSimple error:", err);
    res.status(500).json({ error: "Failed to save deal: " + err.message });
  }
};

export const deleteSupplierDealSimple = async (req, res) => {
  try {
    const { supplierNo, id } = req.params;
    const pool = await getPool();

    // Delete steps first
    await pool.request()
      .input("deal_id", sql.Int, id)
      .query(`DELETE FROM supplier_deal_price_steps WHERE deal_id = @deal_id`);

    // Delete deal
    await pool.request()
      .input("deal_id", sql.Int, id)
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`DELETE FROM supplier_deal_price WHERE deal_id = @deal_id AND supplier_no = @supplier_no`);

    res.json({ success: true });
  } catch (err) {
    console.error("deleteSupplierDealSimple error:", err);
    res.status(500).json({ error: "Failed to delete deal" });
  }
};
