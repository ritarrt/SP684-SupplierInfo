import { getPool } from "../config/db.js";

/**
 * GET /api/suppliers/groups?categories=Glass,Sealant,Accessories
 */
export async function getGroupsByCategories(req, res) {
  try {
    const { categories } = req.query;

    // ถ้าไม่ส่ง category มา → ส่ง array ว่าง
    if (!categories) {
      return res.json([]);
    }

    const categoryList = categories
      .split(",")
      .map(c => c.trim())
      .filter(Boolean);

    // map category → table
    const tableMap = {
      Glass: "GROUP_Glass",
      Aluminum: "GROUP_Aluminium",
      Gypsum: "GROUP_Gypsum",
      Sealant: "GROUP_Sealant",
      "C-Line": "GROUP_CLine",
      Accessories: "Accessory_GROUP",
    };

    const SUBGROUP_TABLE_MAP = {
  Accessories: "SUBGROUP_Accessory",
  Glass: "SUBGROUP_Glass",
  Aluminum: "SUBGROUP_Aluminum",
  Gypsum: "SUBGROUP_Gypsum",
  Sealant: "SUBGROUP_Sealant",
  "C-Line": "SUBGROUP_CLine",
};


    const pool = await getPool();
    let results = [];

    for (const cat of categoryList) {
      const table = tableMap[cat];

      if (!table) {
        console.warn(`⚠️ [Group] No table mapping for category: ${cat}`);
        continue;
      }

      const result = await pool.request().query(`
        SELECT
          '${cat}' AS category,
          Group_ID,
          GroupCode,
          GroupName
        FROM dbo.${table}
        ORDER BY GroupCode
      `);

      results = results.concat(result.recordset);
    }

    return res.json(results);

  } catch (err) {
    console.error("❌ getGroupsByCategories error:", err);
    return res.status(500).json({
      message: "Failed to load groups by category",
    });
  }
}

export async function getSubGroupsByCategory(req, res) {
  try {
    const { category } = req.query;
    if (!category) {
      return res.status(400).json({ message: "category is required" });
    }

    const tableName = SUBGROUP_TABLE_MAP[category];
    if (!tableName) {
      return res.status(400).json({ message: "unsupported category" });
    }

    const pool = await req.app.locals.db;

    const result = await pool.request().query(`
      SELECT
        SUBGROUP_ID,
        SUBGROUP_NAME,
        SUBGROUP_NO
      FROM ${tableName}
      ORDER BY SUBGROUP_NO
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getSubGroupsByCategory error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export async function getAccessorySubGroups(req, res) {
  try {
    const pool = await req.app.locals.db;

    const result = await pool.request().query(`
      SELECT
        SUBGROUP_ID,
        SUBGROUP_NAME,
        SUBGROUP_NO
      FROM SUBGROUP_Accessory
      ORDER BY SUBGROUP_NO
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getAccessorySubGroups error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
