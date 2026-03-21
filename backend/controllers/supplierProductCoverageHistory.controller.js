import { getPool, sql } from "../config/db.js";
console.log("🔥 HISTORY SQL HIT");

/**
 * =====================================================
 * POST: บันทึก snapshot ประวัติการดูแลสินค้า
 * =====================================================
 */
export async function createProductCoverageHistory(req, res) {
  try {
    const { supplierNo } = req.params;
    const { items } = req.body;

    if (!supplierNo || !Array.isArray(items)) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    const pool = await getPool();

    await pool
      .request()
      .input("SupplierNo", sql.NVarChar, supplierNo)
      .input("PayloadJson", sql.NVarChar(sql.MAX), JSON.stringify(items))
      .input("CreatedBy", sql.NVarChar, "system")
      .query(`
        INSERT INTO Supplier_ProductCoverage_History
        (SupplierNo, PayloadJson, CreatedAt, CreatedBy)
        VALUES
        (@SupplierNo, @PayloadJson, SYSDATETIMEOFFSET() AT TIME ZONE 'SE Asia Standard Time', @CreatedBy)
      `);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ createProductCoverageHistory error:", err);
    res.status(500).json({ message: "บันทึกประวัติสินค้าไม่สำเร็จ" });
  }
}

/**
 * =====================================================
 * GET: ดึง history ล่าสุด (default 10 รายการ)
 * =====================================================
 */
export async function getProductCoverageHistory(req, res) {
  const { supplierNo } = req.params;
  const limitNum = Number(req.query.limit) || 10;

  const pool = await getPool();

  const result = await pool.request()
    .input("SupplierNo", sql.NVarChar, supplierNo)
    .query(`
      SELECT TOP (${limitNum})
        Id,
        FORMAT(
    SWITCHOFFSET(CreatedAt, '+07:00'),
    'yyyy-MM-dd HH:mm:ss'
  ) AS CreatedAt,
        CreatedBy,
        PayloadJson
      FROM Supplier_ProductCoverage_History
      WHERE SupplierNo = @SupplierNo
      ORDER BY CreatedAt DESC
    `);

  const response = result.recordset.map(r => ({
    id: r.Id,
    createdAt: r.CreatedAt,
    createdBy: r.CreatedBy,
    items: JSON.parse(r.PayloadJson || "[]")
  }));

  res.json(response);
}


/**
 * =====================================================
 * GET: ดึง history รายการเดียว (กด “ดู”)
 * =====================================================
 */
export async function getProductCoverageHistoryById(req, res) {
  try {
    const { id } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT
          Id,
          SupplierNo,
          PayloadJson,
          CreatedAt,
          CreatedBy
        FROM Supplier_ProductCoverage_History
        WHERE Id = @Id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: "ไม่พบข้อมูล" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ getProductCoverageHistoryById error:", err);
    res.status(500).json({ message: "โหลดรายละเอียดไม่สำเร็จ" });
  }
}
