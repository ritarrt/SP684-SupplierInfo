// backend/controllers/supplierSpecialTerms.controller.js

import { getPool, sql } from "../config/db.js";

/**
 * =====================================================
 * GET: ดึงเงื่อนไขพิเศษของ Supplier
 * =====================================================
 */
export async function getSupplierSpecialTerms(req, res) {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("SupplierNo", sql.NVarChar, supplierNo)
      .query(`
        SELECT
          SupplierNo,
          PayloadJson,
          UpdatedAt,
          UpdatedBy
        FROM dbo.Supplier_SpecialTerms_Current
        WHERE SupplierNo = @SupplierNo
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ getSupplierSpecialTerms error:", err);
    res.status(500).json({ message: "โหลดเงื่อนไขพิเศษไม่สำเร็จ" });
  }
}


/**
 * =====================================================
 * POST: บันทึก / แก้ไข เงื่อนไขพิเศษ
 * =====================================================
 */
export async function saveSupplierSpecialTerms(req, res) {
  try {
    const { supplierNo } = req.params;
    const payload = req.body;

    const pool = await getPool();

    // 1️⃣ ลบ current เดิม
    await pool
      .request()
      .input("SupplierNo", sql.NVarChar, supplierNo)
      .query(`
        DELETE FROM dbo.Supplier_SpecialTerms_Current
        WHERE SupplierNo = @SupplierNo
      `);

    // 2️⃣ insert current ใหม่ (ใช้ UpdatedAt / UpdatedBy)
    await pool
      .request()
      .input("SupplierNo", sql.NVarChar, supplierNo)
      .input("PayloadJson", sql.NVarChar(sql.MAX), JSON.stringify(payload))
      .input("UpdatedBy", sql.NVarChar, "system")
      .query(`
        INSERT INTO dbo.Supplier_SpecialTerms_Current
          (SupplierNo, PayloadJson, UpdatedAt, UpdatedBy)
        VALUES
          (
            @SupplierNo,
            @PayloadJson,
            SYSDATETIMEOFFSET(),
            @UpdatedBy
          )
      `);

    // 3️⃣ บันทึกเป็นประวัติด้วย (ใช้ CreatedAt / CreatedBy)
    await pool
      .request()
      .input("SupplierNo", sql.NVarChar, supplierNo)
      .input("PayloadJson", sql.NVarChar(sql.MAX), JSON.stringify(payload))
      .input("CreatedBy", sql.NVarChar, "system")
      .query(`
        INSERT INTO dbo.Supplier_SpecialTerms_History
          (SupplierNo, PayloadJson, CreatedAt, CreatedBy)
        VALUES
          (
            @SupplierNo,
            @PayloadJson,
            SYSDATETIMEOFFSET(),
            @CreatedBy
          )
      `);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ saveSupplierSpecialTerms error:", err);
    res.status(500).json({ message: "บันทึกเงื่อนไขพิเศษไม่สำเร็จ" });
  }
}



/**
 * =====================================================
 * POST: บันทึก HISTORY เงื่อนไขพิเศษ (snapshot)
 * =====================================================
 */
export async function createSupplierSpecialTermsHistory(req, res) {
  try {
    const { supplierNo } = req.params;
    const payload = req.body;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("SupplierNo", sql.NVarChar, supplierNo)
      .input("PayloadJson", sql.NVarChar(sql.MAX), JSON.stringify(payload))
      .input("CreatedBy", sql.NVarChar, req.body.createdBy || "system")
      .query(`
        INSERT INTO dbo.Supplier_SpecialTerms_History
          (SupplierNo, PayloadJson, CreatedAt, CreatedBy)
        VALUES
          (
            @SupplierNo,
            @PayloadJson,
            SYSDATETIMEOFFSET(),
            @CreatedBy
          )
      `);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ createSupplierSpecialTermsHistory error:", err);
    res.status(500).json({ message: "บันทึก history เงื่อนไขพิเศษไม่สำเร็จ" });
  }
}


/**
 * =====================================================
 * GET: ดึง HISTORY เงื่อนไขพิเศษ
 * =====================================================
 */
export async function getSupplierSpecialTermsHistory(req, res) {
  try {
    const { supplierNo } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("SupplierNo", sql.NVarChar, supplierNo)
      .input("Limit", sql.Int, limit)
      .query(`
        SELECT TOP (@Limit)
          Id,
          SupplierNo,
          PayloadJson,
          CreatedAt,
          CreatedBy
        FROM dbo.Supplier_SpecialTerms_History
        WHERE SupplierNo = @SupplierNo
        ORDER BY CreatedAt DESC
      `);

    const mapped = result.recordset.map(r => ({
      id: r.Id,
      createdAt: r.CreatedAt,
      createdBy: r.CreatedBy,
      payload: safeParse(r.PayloadJson)
    }));

    res.json(mapped);
  } catch (err) {
    console.error("❌ getSupplierSpecialTermsHistory error:", err);
    res.status(500).json({ message: "โหลดประวัติเงื่อนไขพิเศษไม่สำเร็จ" });
  }
}


function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
