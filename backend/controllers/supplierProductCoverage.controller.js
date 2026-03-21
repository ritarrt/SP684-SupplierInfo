// controllers/supplierProductCoverage.controller.js
import { getPool } from "../config/db.js";
import sql from "mssql";


// ===============================
// LOAD (GET)
// ===============================
export async function getSupplierProductCoverage(req, res) {
  const { supplierNo } = req.params;

  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input("supplierNo", supplierNo)
      .query(`
        SELECT
          Categories,
          Brands,
          [Groups],
          SubGroups,
          SKUs
        FROM Supplier_ProductCoverage
        WHERE SupplierNo = @supplierNo
      `);

    if (result.recordset.length === 0) {
      return res.json({
        categories: [],
        brands: [],
        groups: [],
        subGroups: [],
        skus: [],
      });
    }

    const row = result.recordset[0];

    res.json({
      categories: JSON.parse(row.Categories || "[]"),
      brands: JSON.parse(row.Brands || "[]"),
      groups: JSON.parse(row.Groups || "[]"),
      subGroups: JSON.parse(row.SubGroups || "[]"),
      skus: JSON.parse(row.SKUs || "[]"),
    });
  } catch (err) {
    console.error("❌ getSupplierProductCoverage error:", err);
    res.status(500).json({ error: "load failed" });
  }
}

// ===============================
// SAVE (POST)
// ===============================
export async function saveSupplierProductCoverage(req, res) {
  const { supplierNo } = req.params;
  const {
    categories = [],
    brands = [],
    groups = [],
    subGroups = [],
    skus = [],
  } = req.body;

  try {
    const pool = await getPool();

    await pool
      .request()
      .input("supplierNo", supplierNo)
      .input("categories", JSON.stringify(categories))
      .input("brands", JSON.stringify(brands))
      .input("groups", JSON.stringify(groups))
      .input("subGroups", JSON.stringify(subGroups))
      .input("skus", JSON.stringify(skus))
      .query(`
        MERGE Supplier_ProductCoverage AS target
        USING (SELECT @supplierNo AS SupplierNo) AS src
        ON target.SupplierNo = src.SupplierNo

        WHEN MATCHED THEN
          UPDATE SET
            Categories = @categories,
            Brands     = @brands,
            [Groups]   = @groups,
            SubGroups  = @subGroups,
            SKUs       = @skus,
            UpdatedAt  = GETDATE()

        WHEN NOT MATCHED THEN
          INSERT (
            SupplierNo,
            Categories,
            Brands,
            [Groups],
            SubGroups,
            SKUs
          )
          VALUES (
            @supplierNo,
            @categories,
            @brands,
            @groups,
            @subGroups,
            @skus
          );
      `);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ saveSupplierProductCoverage error:", err);
    res.status(500).json({ error: "save failed" });
  }
}

// ===============================
// HISTORY
// ===============================

export async function createProductCoverageHistory(req, res) {
  const { supplierNo } = req.params;
  const { items } = req.body;

  const pool = await getPool();

  await pool.request()
    .input("SupplierNo", supplierNo)
    .input("PayloadJson", JSON.stringify(items))
    .input("CreatedBy", req.user?.username || "system")
    .query(`
      INSERT INTO Supplier_ProductCoverage_History
      (SupplierNo, PayloadJson, CreatedBy)
      VALUES (@SupplierNo, @PayloadJson, @CreatedBy)
    `);

  res.json({ success: true });
}


export async function getProductCoverageHistory(req, res) {
  const { supplierNo } = req.params;
  const limitNum = Number(req.query.limit) || 10;

  try {
    const pool = await getPool();

    const result = await pool
  .request()
  .input("SupplierNo", sql.NVarChar, supplierNo)
  .input("limit", sql.Int, limitNum)
  .query(`
    SELECT TOP (@limit)
      h.Id,
      h.CreatedAt,
      h.CreatedBy,
      (
        SELECT
          i.category,
          i.brand,
          NULL AS brand_name,
          i.[group],
          COALESCE(
            g_glass.GroupName,
            g_sealant.GroupName,
            g_acc.GroupName,
            g_cline.GroupName
          ) AS group_name,
          i.subGroup,
          i.sku
        FROM OPENJSON(h.PayloadJson)
        WITH (
          category NVARCHAR(50),
          brand NVARCHAR(50),
          [group] NVARCHAR(50),
          subGroup NVARCHAR(50),
          sku NVARCHAR(100)
        ) i

       LEFT JOIN dbo.GROUP_Glass g_glass
  ON i.category = 'Glass'
 AND i.[group] = CAST(g_glass.Group_ID AS NVARCHAR(10))

LEFT JOIN dbo.GROUP_Sealant g_sealant
  ON i.category = 'Sealant'
 AND i.[group] = CAST(g_sealant.Group_ID AS NVARCHAR(10))

LEFT JOIN dbo.Accessory_GROUP g_acc
  ON i.category = 'Accessories'
 AND i.[group] = CAST(g_acc.Group_ID AS NVARCHAR(10))

LEFT JOIN dbo.GROUP_CLine g_cline
  ON i.category = 'C-Line'
 AND i.[group] = CAST(g_cline.Group_ID AS NVARCHAR(10))



        FOR JSON PATH
      ) AS items
    FROM Supplier_ProductCoverage_History h
    WHERE h.SupplierNo = @SupplierNo
    ORDER BY h.CreatedAt DESC
  `);




    const rows = result.recordset.map(r => ({
      id: r.Id,
      createdAt: r.CreatedAt,
      createdBy: r.CreatedBy,
      items: r.items ? JSON.parse(r.items) : []
    }));

    res.json(rows);
  } catch (err) {
    console.error("❌ getProductCoverageHistory error:", err);
    res.status(500).json({ message: "load history failed" });
  }
}

export async function getProductCoverageHistoryById(req, res) {
  const { id } = req.params;

  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input("Id", sql.Int, id)
      .query(`
        SELECT PayloadJson
        FROM Supplier_ProductCoverage_History
        WHERE Id = @Id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: "not found" });
    }

    res.json(JSON.parse(result.recordset[0].PayloadJson));
  } catch (err) {
    console.error("❌ getProductCoverageHistoryById error:", err);
    res.status(500).json({ message: "load history by id failed" });
  }
}


export async function searchSku(req, res) {
  const { q, category } = req.query;

  if (!q || q.length < 1) {
    return res.json([]);
  }

  try {
    const pool = await getPool();
    const request = pool.request();

    let where = `
      WHERE (Item_No LIKE @q OR Description LIKE @q)
    `;

    request.input("q", sql.NVarChar, `%${q}%`);

    // ============================
    // CATEGORY PREFIX FILTER
    // ============================
    if (category) {
      let prefix = "";

      switch (category) {
        case "Glass":
          prefix = "G";
          break;
        case "Aluminum":
          prefix = "A";
          break;
        case "Gypsum":
          prefix = "Y";
          break;
        case "Sealant":
          prefix = "S";
          break;
        case "C-Line":
          prefix = "C";
          break;
        case "Accessories":
          prefix = "E";
          break;
      }

      if (prefix) {
        where += ` AND Item_No LIKE @prefix`;
        request.input("prefix", sql.NVarChar, `${prefix}%`);
      }
    }

    const result = await request.query(`
      SELECT TOP 20
        Item_No,
        Description
      FROM ItemMaster
      ${where}
      ORDER BY Item_No
    `);

    res.json(result.recordset);

  } catch (err) {
    console.error("❌ searchSku error:", err);
    res.status(500).json({ error: "search failed" });
  }
}

export const getSupplierCoverageMaster = async (req, res) => {
  try {
    const pool = await getPool();
    const supplierNo = req.params.supplierNo;

    const result = await pool.request()
      .input("supplierNo", supplierNo)
      .query(`
        SELECT TOP 1 PayloadJson
        FROM Supplier_ProductCoverage_History
        WHERE SupplierNo = @supplierNo
        ORDER BY CreatedAt DESC
      `);

    if (!result.recordset.length)
      return res.json([]);

    const items = JSON.parse(result.recordset[0].PayloadJson);

    // 🔥 เติมชื่อ subgroup เพิ่มเท่านั้น
    for (const item of items) {

      let tableName = "";

      switch (item.category) {
        case "Glass":
          tableName = "dbo.SUBGROUP_GLASS";
          break;
        case "Accessories":
          tableName = "dbo.SUBGROUP_Accessory";
          break;
        case "Aluminum":
          tableName = "dbo.SUBGROUP_Aluminium";
          break;
        case "Sealant":
          tableName = "dbo.SUBGROUP_Sealant";
          break;
        case "Gypsum":
          tableName = "dbo.SUBGROUP_Gypsum";
          break;
        case "C-Line":
          tableName = "dbo.SUBGROUP_CLine";
          break;
      }

      if (!tableName || item.subGroup == null || item.subGroup === "") continue;

      // ✅ ใช้ NVARCHAR เพื่อรองรับทั้ง "106", "01", "000" และกรณีมีศูนย์นำหน้า
      const id = String(item.subGroup).trim();

      // ✅ Query แบบ "ปลอดภัยกับ schema ต่างกัน"
      // - ถ้าตารางมี SUBGROUP_NO (Accessory/Aluminium) ให้ใช้ SUBGROUP_NO
      // - ถ้าตารางไม่มี SUBGROUP_NO (Glass/Gypsum/Sealant) จะไม่พัง เพราะเราจะไม่อ้างมัน
      // วิธีทำ: แยก query ตาม category ที่รู้ schema ชัด
      let sg;

      if (item.category === "Accessories" || item.category === "Aluminum") {
        // ตารางมี SUBGROUP_NO (จากรูปมีแน่นอน)
        sg = await pool.request()
          .input("id", sql.NVarChar, id)
          .query(`
            SELECT TOP 1 SUBGROUP_NAME
            FROM ${tableName}
            WHERE CAST(SUBGROUP_NO AS NVARCHAR(50)) = @id
               OR CAST(SUBGROUP_ID AS NVARCHAR(50)) = @id
          `);
      } else {
        // Glass / Gypsum / Sealant (จากรูป: มี SUBGROUP_ID, ไม่มี SUBGROUP_NO)
        sg = await pool.request()
          .input("id", sql.NVarChar, id)
          .query(`
            SELECT TOP 1 SUBGROUP_NAME
            FROM ${tableName}
            WHERE CAST(SUBGROUP_ID AS NVARCHAR(50)) = @id
          `);
      }

      if (sg.recordset.length) {
        item.sub_group_name = sg.recordset[0].SUBGROUP_NAME;
      }
    }

    // ✅ คืนของเดิมทั้งหมด + เพิ่ม sub_group_name เท่านั้น
    res.json(items);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Coverage load failed" });
  }
};

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
      SELECT COLOR_ID, COLOR_NAME, COLOR_NO
      FROM ${tableName}
      ORDER BY COLOR_NO
    `);

    res.json(result.recordset);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Color load failed" });
  }
};