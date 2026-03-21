import { getPool } from "../config/db.js";

export const getColorsByCategory = async (req, res) => {
  try {
    const pool = await getPool();
    const { category } = req.params;

    let tableName = "";

    switch (category) {
      case "Glass":
        tableName = "dbo.COLOR_Glass";
        break;
      case "Aluminum":
        tableName = "dbo.COLOR_Aluminium";
        break;
      case "Accessories":
        tableName = "dbo.COLOR_Accessory";
        break;
      case "Sealant":
        tableName = "dbo.COLOR_Sealant";
        break;
      case "Gypsum":
        tableName = "dbo.COLOR_Gypsum";
        break;
      case "C-Line":
        tableName = "dbo.COLOR_CLine";
        break;
      default:
        return res.json([]);
    }

    const result = await pool.request().query(`
      SELECT COLOR_NO, COLOR_NAME
      FROM ${tableName}
      ORDER BY COLOR_NO
    `);

    res.json(result.recordset);

  } catch (err) {
    console.error("Color master error:", err);
    res.status(500).json({ error: "Color load failed" });
  }
};

export const getThicknessByCategory = async (req, res) => {
  try {
    const pool = await getPool();
    const { category } = req.params;

    let tableName = "";

    switch (category) {
      case "Glass":
        tableName = "dbo.THICKNESS_Glass";
        break;
      case "Aluminum":
        tableName = "dbo.THICKNESS_Aluminium";
        break;
      case "C-Line":
        tableName = "dbo.THICKNESS_CLine";
        break;
      case "Gypsum":
        tableName = "dbo.THICKNESS_Gypsum";
        break;
      default:
        return res.json([]);
    }

    const result = await pool.request().query(`
      SELECT THICKNESS_NO, THICKNESS_NAME
      FROM ${tableName}
      ORDER BY THICKNESS_NO
    `);

    res.json(result.recordset);

  } catch (err) {
    console.error("Thickness master error:", err);
    res.status(500).json({ error: "Thickness load failed" });
  }
};

export const getBranches = async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT 
        branchCode,
        branchName,
        province,
        region
      FROM BranchMaster
    `);

    res.json(result.recordset);

  } catch (err) {
    console.error("Get Branch Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getProvinces = async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT provinceCode, provinceName, region
      FROM Province
      ORDER BY provinceName
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getProvinces error:", err);
    res.status(500).json({ error: "Failed to load provinces" });
  }
};