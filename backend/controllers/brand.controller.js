import { getPool } from "../config/db.js";

// ===============================
// GET Brands by Categories
// ===============================
export async function getBrandsByCategories(req, res) {
  try {
    console.log("🔥 /brands called", req.query);

    const { categories } = req.query;

    // ป้องกัน query ว่าง
    if (!categories) {
      return res.json([]);
    }

    const categoryList = categories
      .split(",")
      .map(c => c.trim())
      .filter(Boolean);

    if (categoryList.length === 0) {
      return res.json([]);
    }

    // map category → table
    const tableMap = {
      Glass: "BRAND_Glass",
      Aluminum: "BRAND_Aluminium",
      Gypsum: "BRAND_Gypsum",
      Sealant: "BRAND_Sealant",
      "C-Line": "BRAND_CLine",
      Accessories: "Accessory_BRAND",
    };

    const pool = await getPool();
    let results = [];

    for (const cat of categoryList) {
      const table = tableMap[cat];
      if (!table) continue;

      const result = await pool.request().query(`
        SELECT
          '${cat}' AS category,
          BRAND_ID,
          BRAND_NAME,
          BRAND_NO
        FROM dbo.${table}
        ORDER BY BRAND_NO
      `);

      results = results.concat(result.recordset);
    }

    res.json(results);
  } catch (err) {
    console.error("❌ brand.controller error:", err);
    res.status(500).json({ error: "load brands failed" });
  }
}
