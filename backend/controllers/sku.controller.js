import { getPool } from "../config/db.js";

export async function searchSku(req, res) {
  const { q } = req.query;

  if (!q || q.length < 2) {
    return res.json([]);
  }

  try {
    const pool = await getPool();

    const result = await pool.request()
      .input("keyword", `%${q}%`)
      .query(`
        SELECT TOP 20
          Item_No,
          Description
        FROM ItemMaster
        WHERE Item_No LIKE @keyword
           OR Description LIKE @keyword
        ORDER BY Item_No
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("SKU search error:", err);
    res.status(500).json({ message: "error searching sku" });
  }
}