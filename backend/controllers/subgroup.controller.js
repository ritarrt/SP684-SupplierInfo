import { getPool } from "../config/db.js";

export async function getSubgroupsByCategory(req, res) {
  const { category } = req.query;

  if (!category) return res.json([]);

  try {
    const pool = await getPool();

    let tableName = "";

    switch (category) {
      case "Glass":
        tableName = "dbo.SUBGROUP_GLASS";
        break;
      case "Aluminum":
        tableName = "dbo.SUBGROUP_Aluminium";
        break;
      case "Gypsum":
        tableName = "dbo.SUBGROUP_Gypsum";
        break;
      case "Sealant":
        tableName = "dbo.SUBGROUP_Sealant";
        break;
      case "Accessories":
        tableName = "dbo.SUBGROUP_Accessory";
        break;
      case "C-Line":
        tableName = "dbo.SUBGROUP_CLine";
        break;
      default:
        return res.json([]);
    }

    const result = await pool.request().query(`
      SELECT SUBGROUP_ID, SUBGROUP_NAME
      FROM ${tableName}
      ORDER BY SUBGROUP_NAME
    `);

    res.json(result.recordset);

  } catch (err) {
    console.error("❌ Subgroup error:", err);
    res.status(500).json({ message: "Server error" });
  }
}