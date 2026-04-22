import { getPool, sql } from "../config/db.js";

export const getSupplierDealsSimple = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    // Auto-close deals ที่หมดอายุแล้ว — ใช้ DATE comparison ป้องกัน timezone issue
    await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        UPDATE supplier_deal_price
        SET status = 'CLOSED', updated_at = GETDATE()
        WHERE supplier_no = @supplier_no
          AND status IN ('OPEN', 'USE')
          AND end_date IS NOT NULL
          AND CAST(GETDATE() AS DATE) > end_date
      `);

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

    const stepsMap = {};
    stepsResult.recordset.forEach(s => {
      if (!stepsMap[s.deal_id]) stepsMap[s.deal_id] = [];
      stepsMap[s.deal_id].push(s);
    });

    deals.forEach(d => {
      d.steps = stepsMap[d.deal_id] || [];
    });

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
      contact_person,
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
        AND COLUMN_NAME IN ('require_pallet', 'supplier_delivery', 'project_no', 'note', 'contact_person')
    `);
    const existingCols = new Set(colCheck.recordset.map(r => r.COLUMN_NAME));
    const hasRequirePallet    = existingCols.has('require_pallet');
    const hasSupplierDelivery = existingCols.has('supplier_delivery');
    const hasProjectNo        = existingCols.has('project_no');
    const hasNote             = existingCols.has('note');
    const hasContactPerson    = existingCols.has('contact_person');

    // ตรวจสอบว่ามี deal เดิมที่ยัง active อยู่ (OPEN/USE) สำหรับ SKU+branch+deal_name+ช่วงวันที่นี้หรือไม่
    const existingCheck = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .input("sku",         sql.NVarChar, sku || "")
      .input("branch",      sql.NVarChar, branch || "")
      .input("deal_name",   sql.NVarChar, deal_name || "")
      .input("start_date",  sql.Date,     start_date && String(start_date).trim() !== "" ? start_date : null)
      .input("end_date",    sql.Date,     end_date   && String(end_date).trim()   !== "" ? end_date   : null)
      .query(`
        SELECT TOP 1 deal_id
        FROM supplier_deal_price
        WHERE supplier_no = @supplier_no
          AND sku         = @sku
          AND branch      = @branch
          AND deal_name   = @deal_name
          AND (
            (@start_date IS NULL AND start_date IS NULL) OR CAST(start_date AS DATE) = CAST(@start_date AS DATE)
          )
          AND (
            (@end_date IS NULL AND end_date IS NULL) OR CAST(end_date AS DATE) = CAST(@end_date AS DATE)
          )
          AND status IN ('OPEN', 'USE')
        ORDER BY deal_id DESC
      `);

    const existingDealId = existingCheck.recordset[0]?.deal_id ?? null;

    if (existingDealId) {
      // ===== เปรียบเทียบข้อมูลก่อน UPDATE =====
      const currentResult = await pool.request()
        .input("deal_id", sql.Int, existingDealId)
        .query(`
          SELECT base_price, condition_mode, deal_type, price_value, price_unit,
                 start_date, end_date, note, project_no,
                 require_pallet, supplier_delivery
          FROM supplier_deal_price WHERE deal_id = @deal_id
        `);
      const cur = currentResult.recordset[0];

      // ดึง steps เดิม
      const curStepsResult = await pool.request()
        .input("deal_id", sql.Int, existingDealId)
        .query(`
          SELECT step_number, from_qty, to_qty, price_value, price_unit
          FROM supplier_deal_price_steps
          WHERE deal_id = @deal_id
          ORDER BY step_number
        `);
      const curSteps = curStepsResult.recordset;

      // helper เปรียบเทียบ date (ตัด timezone)
      const fmtDate = v => v ? String(v).split("T")[0] : null;

      // เปรียบเทียบ field หลัก
      const sameMain =
        Number(cur.base_price)  === (parseFloat(base_price)  || 0) &&
        cur.condition_mode      === (condition_mode || "normal")    &&
        cur.deal_type           === (deal_type || "Discount")       &&
        Number(cur.price_value) === (parseFloat(price_value) || 0)  &&
        (cur.price_unit || "")  === (price_unit || "")              &&
        fmtDate(cur.start_date) === (start_date || null)            &&
        fmtDate(cur.end_date)   === (end_date   || null)            &&
        (cur.note        || "") === (note        || "")             &&
        (cur.project_no  || "") === (project_no  || "");

      // เปรียบเทียบ steps (ถ้าเป็น stepped)
      let sameSteps = true;
      if (condition_mode === "stepped" && steps && steps.length > 0) {
        const newStepsSorted = [...steps].sort((a, b) => a.tier - b.tier);
        sameSteps =
          curSteps.length === newStepsSorted.length &&
          newStepsSorted.every((ns, i) => {
            const cs = curSteps[i];
            return cs &&
              cs.step_number      === (ns.tier || i + 1)          &&
              Number(cs.from_qty) === (parseFloat(ns.from_qty) || 0) &&
              Number(cs.to_qty)   === (parseFloat(ns.to_qty)   || 0) &&
              Number(cs.price_value) === (parseFloat(ns.price_value) || 0) &&
              (cs.price_unit || "") === (ns.price_unit || "");
          });
      }

      // ถ้าไม่มีอะไรเปลี่ยน → ข้ามไปเลย
      if (sameMain && sameSteps) {
        return res.json({ success: true, deal_id: existingDealId, action: "skipped" });
      }
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
      if (hasContactPerson) { updateReq.input("contact_person", sql.NVarChar, contact_person || null); updateCols.push("contact_person = @contact_person"); }
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
    if (hasContactPerson)    { cols.push('contact_person');    vals.push('@contact_person'); }
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
    if (hasContactPerson)    insertReq.input("contact_person",    sql.NVarChar, contact_person || null);
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

export const getSupplierDealHistory = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        SELECT
          d.deal_id,
          d.deal_ref,
          d.status,
          d.deal_name,
          d.contact_person,
          d.project_no,
          d.sku,
          d.branch,
          d.category,
          d.brand,
          d.product_group,
          d.condition_mode,
          d.deal_type,
          d.base_price,
          d.price_value,
          d.price_unit,
          d.limited_qty,
          d.limited_unit,
          d.start_date,
          d.end_date,
          d.require_pallet,
          d.supplier_delivery,
          d.note,
          d.has_been_used,
          FORMAT(d.created_at, 'yyyy-MM-dd HH:mm:ss') AS created_at,
          FORMAT(ISNULL(d.updated_at, d.created_at), 'yyyy-MM-dd HH:mm:ss') AS updated_at
        FROM supplier_deal_price d
        WHERE d.supplier_no = @supplier_no
        ORDER BY d.created_at DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getSupplierDealHistory error:", err);
    res.status(500).json({ error: "Failed to load deal history: " + err.message });
  }
};

// ===================================================
// IMPORT LOG: สร้าง log session ใหม่
// ===================================================
export const createImportLog = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const { total_rows, inserted, updated, skipped, errors, note } = req.body;
    const pool = await getPool();

    const result = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .input("total_rows",  sql.Int,      total_rows || 0)
      .input("inserted",    sql.Int,      inserted   || 0)
      .input("updated",     sql.Int,      updated    || 0)
      .input("skipped",     sql.Int,      skipped    || 0)
      .input("errors",      sql.Int,      errors     || 0)
      .input("note",        sql.NVarChar, note       || null)
      .query(`
        INSERT INTO deal_import_logs (supplier_no, total_rows, inserted, updated, skipped, errors, note)
        VALUES (@supplier_no, @total_rows, @inserted, @updated, @skipped, @errors, @note);
        SELECT SCOPE_IDENTITY() AS log_id;
      `);

    res.json({ success: true, log_id: result.recordset[0].log_id });
  } catch (err) {
    console.error("createImportLog error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===================================================
// IMPORT LOG: บันทึก items ของ log
// ===================================================
export const createImportLogItems = async (req, res) => {
  try {
    const { logId } = req.params;
    const { items } = req.body; // [{ deal_id, sku, branch, deal_name, action, error_msg }]
    const pool = await getPool();

    for (const item of items) {
      await pool.request()
        .input("log_id",    sql.Int,      parseInt(logId))
        .input("deal_id",   sql.Int,      item.deal_id   || null)
        .input("sku",       sql.NVarChar, item.sku       || null)
        .input("branch",    sql.NVarChar, item.branch    || null)
        .input("deal_name", sql.NVarChar, item.deal_name || null)
        .input("action",    sql.NVarChar, item.action    || null)
        .input("error_msg", sql.NVarChar, item.error_msg || null)
        .query(`
          INSERT INTO deal_import_log_items (log_id, deal_id, sku, branch, deal_name, action, error_msg)
          VALUES (@log_id, @deal_id, @sku, @branch, @deal_name, @action, @error_msg)
        `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("createImportLogItems error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===================================================
// IMPORT LOG: ดึงรายการ log ทั้งหมดของ supplier
// ===================================================
export const getImportLogs = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        SELECT TOP 100
          log_id,
          FORMAT(imported_at, 'yyyy-MM-dd HH:mm:ss') AS imported_at,
          total_rows, inserted, updated, skipped, errors, note
        FROM deal_import_logs
        WHERE supplier_no = @supplier_no
        ORDER BY imported_at DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getImportLogs error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ===================================================
// IMPORT LOG: ดึง items ของ log ครั้งนั้น
// ===================================================
export const getImportLogItems = async (req, res) => {
  try {
    const { logId } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input("log_id", sql.Int, parseInt(logId))
      .query(`
        SELECT item_id, deal_id, sku, branch, deal_name, action, error_msg
        FROM deal_import_log_items
        WHERE log_id = @log_id
        ORDER BY item_id
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getImportLogItems error:", err);
    res.status(500).json({ error: err.message });
  }
};
