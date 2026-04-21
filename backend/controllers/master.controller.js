import { getPool, sql } from "../config/db.js";

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

// Get SKU by branch (limited for performance)
export const getSkuByBranch = async (req, res) => {
  try {
    const pool = await getPool();
    const { branchCode } = req.query;

    let query = `
      SELECT TOP 50000
        branchCode,
        skuNumber AS sku,
        productName,
        category,
        brandName,
        baseUnit,
        colorName,
        colorNo,
        ThicknessName,
        thicknessNo
      FROM StockStatusFact
      WHERE skuNumber IS NOT NULL AND skuNumber != ''
    `;

    if (branchCode) {
      query += ` AND branchCode = @branchCode`;
    }

    query += ` ORDER BY branchCode, category, productName`;

    const request = pool.request();
    if (branchCode) {
      request.input("branchCode", sql.VarChar, branchCode);
    }

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error("getSkuByBranch error:", err);
    res.status(500).json({ error: "Failed to load SKU data" });
  }
};

// Get only branches for filter dropdown
export const getBranchesForFilter = async (req, res) => {
  try {
    const pool = await getPool();
    
    const ssResult = await pool.request().query(`
      SELECT DISTINCT branchCode
      FROM StockStatusFact
      WHERE branchCode IS NOT NULL AND branchCode != ''
    `);
    
    const bmResult = await pool.request().query(`
      SELECT branchCode FROM BranchMaster
    `);
    
    const ssBranches = ssResult.recordset.map(r => r.branchCode);
    const bmBranches = bmResult.recordset.map(r => r.branchCode);
    const combined = [...new Set([...ssBranches, ...bmBranches])].filter(b => b);
    combined.sort();
    
    res.json(combined);
  } catch (err) {
    console.error("getBranchesForFilter error:", err);
    res.status(500).json({ error: "Failed to load branches" });
  }
};

// Get only categories for filter dropdown
export const getCategoriesForFilter = async (req, res) => {
  try {
    const pool = await getPool();
    const { branchCode } = req.query;
    
    let query = `
      SELECT DISTINCT category
      FROM StockStatusFact
      WHERE category IS NOT NULL AND category != ''
    `;
    
    if (branchCode) {
      query += ` AND branchCode = @branchCode`;
    }
    
    query += ` ORDER BY category`;
    
    const request = pool.request();
    if (branchCode) {
      request.input("branchCode", sql.VarChar, branchCode);
    }
    
    const result = await request.query(query);
    res.json(result.recordset.map(r => r.category));
  } catch (err) {
    console.error("getCategoriesForFilter error:", err);
    res.status(500).json({ error: "Failed to load categories" });
  }
};
