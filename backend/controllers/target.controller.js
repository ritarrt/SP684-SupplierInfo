// backend/controllers/target.controller.js

import { getPool, sql } from "../config/db.js";

/* ============================================================
   CREATE TARGET
============================================================ */
export const createTarget = async (req, res) => {
  try {
    console.log("TARGET BODY:", req.body);
    const pool = await getPool();
    const d = req.body;

    const now = new Date();
const year = String(now.getFullYear()).slice(-2); // หลัง 2 หลัก
const month = String(now.getMonth() + 1).padStart(2, "0");

const prefix = `PT/${year}${month}`;

    await pool.request()
      .input("supplier_code", sql.NVarChar, d.supplier_code)
      .input(
  "provider_contact_id",
  sql.Int,
  d.provider_contact_id || null
)
      .input("target_name", sql.NVarChar, d.target_name)
      .input("parent_target_ref", sql.NVarChar, d.parent_target_ref ?? null)
      .input("status", sql.NVarChar, "OPEN")
      .input("region", sql.NVarChar, d.region)
      .input("province", sql.NVarChar, d.province)
      .input("branch", sql.NVarChar, d.branch)
      .input("category", sql.NVarChar, d.category)

      .input("brand", sql.NVarChar, d.brand_name || null)
      .input("brand_code", sql.NVarChar, d.brand_code || d.brand_no || d.brand || null)

      .input("product_group", sql.NVarChar, d.group_name || null)
      .input("product_group_code", sql.NVarChar, d.group_code || d.group || null)

      .input("sub_group", sql.NVarChar, d.sub_group_name || d.sub_group || null)
      .input("sub_group_code", sql.NVarChar, d.sub_group_code || null)
      .input("color", sql.NVarChar, d.color || null)
      .input("thickness", sql.NVarChar, d.thickness || null)
      .input("mold", sql.NVarChar, d.mold)
      .input("sku", sql.NVarChar, d.sku)
      .input("benefit_period", sql.NVarChar, d.benefit_period)
      .input("target_type", sql.NVarChar, d.target_type)
      .input("target_qty", sql.Decimal(18, 2), parseFloat(String(d.target_qty).replace(/,/g, "")) || 0)
      .input("target_unit", sql.NVarChar, String(d.target_unit || "").trim())
      .input("start_date", sql.Date, d.start_date)
      .input("end_date", sql.Date, d.end_date)
      .query(`
DECLARE @prefix NVARCHAR(20) = '${prefix}';

DECLARE @running INT;

SELECT @running = ISNULL(MAX(
    TRY_CAST(RIGHT(target_ref, 3) AS INT)
), 0) + 1
FROM supplier_targets WITH (UPDLOCK, HOLDLOCK)
WHERE target_ref LIKE @prefix + '%';

DECLARE @target_ref NVARCHAR(50) =
    @prefix + '/' + RIGHT('000' + CAST(@running AS VARCHAR), 3);

INSERT INTO supplier_targets (
  supplier_code,
  provider_contact_id,
  target_name,
  target_ref,
  status,
  region,
  province,
  branch,
  category,
  brand,
  brand_code,
  product_group,
  product_group_code,
  sub_group,
  sub_group_code,
  color,
  thickness,
  mold,
  sku,
  benefit_period,
  target_type,
  target_qty,
  target_unit,
  parent_target_ref,
  start_date,
  end_date
)
VALUES (
  @supplier_code,
  @provider_contact_id,
  @target_name,
  @target_ref,  -- 🔥 ใช้ตัว generate
  @status,
  @region,
  @province,
  @branch,
  @category,
  @brand,
  @brand_code,
  @product_group,
  @product_group_code,
  @sub_group,
  @sub_group_code,
  @color,
  @thickness,
  @mold,
  @sku,
  @benefit_period,
  @target_type,
  @target_qty,
  @target_unit,
  @parent_target_ref,
  @start_date,
  @end_date
);
`);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Create Target Error:", err);
    res.status(500).json({ error: err.message || "Create Target Failed" });
  }
};


/* ============================================================
   GET TARGET BY SUPPLIER
============================================================ */
export const getTargetsBySupplier = async (req, res) => {
  try {
    const pool = await getPool();
    const supplierCode = req.params.supplierCode;
    console.log("📡 Fetching targets for:", supplierCode);

    const result = await pool.request()
      .input("supplier_code", sql.NVarChar, supplierCode)
      .input("color", sql.NVarChar, null)
      .query(`
UPDATE supplier_targets
SET status = 'CLOSED',
     updated_at = GETDATE()
WHERE status = 'OPEN'
  AND CONVERT(DATE, GETDATE()) > end_date;
SELECT
    t.*,
    -- brand_name: ถ้าเลือกหลายแบรนด์ ใช้ค่าที่เก็บใน t.brand (brand_name) โดยตรง
    -- ถ้าว่างค่อย fallback ไปหา join
    CASE
        WHEN t.brand IS NOT NULL AND t.brand <> '' THEN t.brand
        WHEN t.category = 'Aluminum' THEN ba.BRAND_NAME
        WHEN t.category = 'Glass' THEN bg.BRAND_NAME
        WHEN t.category = 'Gypsum' THEN gy.BRAND_NAME
        WHEN t.category = 'C-Line' THEN bc.BRAND_NAME
        WHEN t.category = 'Sealant' THEN bs.BRAND_NAME
        WHEN t.category = 'Accessories' THEN accb.BRAND_NAME
    END AS brand_name,
    -- group_name: ใช้ t.product_group ที่เก็บ name ไว้แล้ว
    CASE
        WHEN t.product_group IS NOT NULL AND t.product_group <> '' THEN t.product_group
        ELSE accg.GroupName
    END AS group_name,
    ISNULL(a.actual_qty,0) AS actual_qty,
    ISNULL(a.actual_amount,0) AS actual_amount,
    ISNULL(a.actual_weight,0) AS actual_weight,
    ISNULL(a.actual_area,0) AS actual_area,
    v.actual_value,
    CASE
      WHEN ISNULL(t.target_qty,0) = 0 THEN 0
      ELSE (v.actual_value * 100.0) / ISNULL(t.target_qty,0)
    END AS achievement_percent,
CASE
  WHEN CONVERT(DATE, GETDATE()) < t.start_date
    THEN N'ยังไม่เริ่ม'
  WHEN CONVERT(DATE, GETDATE()) > t.end_date
       AND v.actual_value >= ISNULL(t.target_qty,0)
    THEN N'บรรลุแล้ว (หมดอายุ)'
  WHEN CONVERT(DATE, GETDATE()) > t.end_date
       AND v.actual_value < ISNULL(t.target_qty,0)
    THEN N'ไม่ถึงเป้า (หมดอายุ)'
  WHEN v.actual_value >= ISNULL(t.target_qty,0)
    THEN N'บรรลุเป้า'
  ELSE N'ยังไม่ถึงเป้า'
END AS target_state,
CASE
  WHEN v.actual_value >= ISNULL(t.target_qty,0)
       AND ISNULL(t.target_qty,0) > 0
  THEN 1
  ELSE 0
END AS is_achieved,
CASE
  WHEN t.parent_target_ref IS NULL THEN (
    CASE
      WHEN ISNULL(t.target_qty,0) = 0 THEN 0
      ELSE (ISNULL(sub_agg.sub_actual_value, ISNULL(v.actual_value,0)) * 100.0) / ISNULL(t.target_qty,0)
    END
  )
  ELSE 0
END AS combined_achievement_percent,
CASE
  WHEN t.parent_target_ref IS NULL THEN ISNULL(sub_agg.sub_actual_value, ISNULL(v.actual_value,0))
  ELSE v.actual_value
END AS combined_actual_value,
CASE
  WHEN t.parent_target_ref IS NULL AND sub_agg.sub_actual_value IS NOT NULL THEN 1
  ELSE 0
END AS has_sub_targets
FROM supplier_targets t
OUTER APPLY (
    SELECT t.brand_code AS brand_no
) b
OUTER APPLY (
    SELECT 
        SUM(r.Quantity) AS actual_qty,
        SUM(r.Total_Cost) AS actual_amount,
        SUM(ISNULL(r.Gross_Weight,0)) AS actual_weight,
        SUM(ISNULL(r.Area_SQFT,0)) AS actual_area
    FROM RE_Detail_WithCost r
    WHERE r.Posting_Date >= t.start_date
      AND r.Posting_Date < DATEADD(DAY, 1, t.end_date)
    AND (
        (t.category = 'Accessories'
            AND EXISTS (
              SELECT 1
              FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''), ',') bc_s
              CROSS JOIN (
                SELECT CAST(NULL AS NVARCHAR(10)) AS sub_val
                WHERE NULLIF(t.sub_group_code,'') IS NULL
                UNION ALL
                SELECT LTRIM(RTRIM(sc_s.value))
                FROM STRING_SPLIT(REPLACE(ISNULL(t.sub_group_code,''),' ',''), ',') sc_s
                WHERE LTRIM(RTRIM(sc_s.value)) <> ''
                  AND NULLIF(t.sub_group_code,'') IS NOT NULL
              ) sub_s
              WHERE LTRIM(RTRIM(bc_s.value)) <> ''
                AND r.SKU LIKE CONCAT(
                  'E',
                  RIGHT('000' + LTRIM(RTRIM(bc_s.value)), 3),   -- brand 3 หลัก
                  CASE WHEN NULLIF(t.product_group_code,'') IS NULL THEN ''
                       ELSE RIGHT('00' + LTRIM(RTRIM(
                              (SELECT TOP 1 LTRIM(RTRIM(gc_s.value))
                               FROM STRING_SPLIT(REPLACE(t.product_group_code,' ',''),',') gc_s
                               WHERE LTRIM(RTRIM(gc_s.value))<>'')
                            )), 2)
                  END,
                  CASE WHEN sub_s.sub_val IS NULL THEN '%'
                       ELSE RIGHT('00' + sub_s.sub_val, 2) + '%'  -- sub 2 หลัก
                  END
                )
            )
        )
        OR
        (t.category <> 'Accessories'
            AND EXISTS (
              SELECT 1
              FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''), ',') bc_s
              CROSS JOIN (
                SELECT CAST(NULL AS NVARCHAR(10)) AS sub_val
                WHERE NULLIF(t.sub_group_code,'') IS NULL
                UNION ALL
                SELECT LTRIM(RTRIM(sc_s.value))
                FROM STRING_SPLIT(REPLACE(ISNULL(t.sub_group_code,''),' ',''), ',') sc_s
                WHERE LTRIM(RTRIM(sc_s.value)) <> ''
                  AND NULLIF(t.sub_group_code,'') IS NOT NULL
              ) sub_s
              WHERE LTRIM(RTRIM(bc_s.value)) <> ''
                AND r.SKU LIKE CONCAT(
                  CASE t.category
                    WHEN 'Glass'    THEN 'G'
                    WHEN 'Aluminum' THEN 'A'
                    WHEN 'Sealant'  THEN 'S'
                    WHEN 'Gypsum'   THEN 'Y'
                    WHEN 'C-Line'   THEN 'C'
                  END,
                  RIGHT('00' + LTRIM(RTRIM(bc_s.value)), 2),    -- brand 2 หลัก
                  CASE WHEN NULLIF(t.product_group_code,'') IS NULL THEN ''
                       ELSE RIGHT('00' + LTRIM(RTRIM(
                              (SELECT TOP 1 LTRIM(RTRIM(gc_s.value))
                               FROM STRING_SPLIT(REPLACE(t.product_group_code,' ',''),',') gc_s
                               WHERE LTRIM(RTRIM(gc_s.value))<>'')
                            )), 2)
                  END,
                  CASE WHEN sub_s.sub_val IS NULL THEN '%'
                       ELSE RIGHT('000' + sub_s.sub_val, 3) + '%'  -- sub 3 หลัก
                  END
                )
            )
        )
    )
    AND (
        NULLIF(t.color,'') IS NULL
        OR EXISTS (
          SELECT 1 FROM STRING_SPLIT(REPLACE(t.color,' ',''), ',') col_s
          WHERE LTRIM(RTRIM(col_s.value)) <> ''
            AND (
              CASE 
                WHEN t.category = 'Gypsum' THEN SUBSTRING(r.SKU, 9, 3)
                ELSE SUBSTRING(r.SKU, 9, 2)
              END
            ) = LTRIM(RTRIM(col_s.value))
        )
    )
    AND (
        NULLIF(t.thickness,'') IS NULL
        OR EXISTS (
          SELECT 1 FROM STRING_SPLIT(REPLACE(t.thickness,' ',''), ',') th_s
          WHERE LTRIM(RTRIM(th_s.value)) <> ''
            AND (
              CASE 
                WHEN t.category = 'Gypsum' THEN SUBSTRING(r.SKU, 12, 2)
                ELSE SUBSTRING(r.SKU, 11, 2)
              END
            ) = LTRIM(RTRIM(th_s.value))
        )
    )
AND (
      NULLIF(t.branch,'') IS NULL
      OR EXISTS (
        SELECT 1 FROM STRING_SPLIT(REPLACE(t.branch,' ',''), ',') b
        WHERE LTRIM(RTRIM(b.value)) <> ''
          AND UPPER(LTRIM(RTRIM(r.Branch))) = UPPER(LTRIM(RTRIM(b.value)))
      )
    )
) a
OUTER APPLY (
    SELECT
        CASE
          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ชิ้น','pcs')
            THEN ISNULL(a.actual_qty,0)
          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) = N'บาท'
            THEN ISNULL(a.actual_amount,0)
          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ตัน','ton')
            THEN ISNULL(a.actual_weight,0) / 1000.0
WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ตร.ฟ.','ตร.ฟุต','sqft','sq ft')
            THEN ISNULL(a.actual_area,0)
        END AS actual_value
) v
LEFT JOIN BRAND_Aluminium ba
  ON ba.BRAND_NO = RIGHT('00' + LTRIM(RTRIM(
       (SELECT TOP 1 value FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''),',') WHERE LTRIM(RTRIM(value))<>'')
     )), 2)
 AND t.category = 'Aluminum'
LEFT JOIN BRAND_Glass bg
  ON bg.BRAND_NO = RIGHT('00' + LTRIM(RTRIM(
       (SELECT TOP 1 value FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''),',') WHERE LTRIM(RTRIM(value))<>'')
     )), 2)
 AND t.category = 'Glass'
LEFT JOIN BRAND_Gypsum gy
  ON gy.BRAND_NO = RIGHT('00' + LTRIM(RTRIM(
       (SELECT TOP 1 value FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''),',') WHERE LTRIM(RTRIM(value))<>'')
     )), 2)
 AND t.category = 'Gypsum'
LEFT JOIN BRAND_CLine bc
  ON bc.BRAND_NO = RIGHT('00' + LTRIM(RTRIM(
       (SELECT TOP 1 value FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''),',') WHERE LTRIM(RTRIM(value))<>'')
     )), 2)
 AND t.category = 'C-Line'
LEFT JOIN BRAND_Sealant bs
  ON bs.BRAND_NO = RIGHT('00' + LTRIM(RTRIM(
       (SELECT TOP 1 value FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''),',') WHERE LTRIM(RTRIM(value))<>'')
     )), 2)
 AND t.category = 'Sealant'
LEFT JOIN Accessory_BRAND accb
  ON accb.BRAND_NO = RIGHT('000' + LTRIM(RTRIM(
       (SELECT TOP 1 value FROM STRING_SPLIT(REPLACE(ISNULL(t.brand_code,''),' ',''),',') WHERE LTRIM(RTRIM(value))<>'')
     )), 3)
 AND t.category = 'Accessories'
LEFT JOIN Accessory_GROUP accg
  ON accg.Group_ID = RIGHT('00' + LTRIM(RTRIM(
       (SELECT TOP 1 value FROM STRING_SPLIT(REPLACE(ISNULL(t.product_group_code,''),' ',''),',') WHERE LTRIM(RTRIM(value))<>'')
     )), 2)
OUTER APPLY (
  SELECT SUM(ISNULL(sub_calc.actual_value,0)) AS sub_actual_value
  FROM supplier_targets sub
  OUTER APPLY (
    SELECT 
      CASE
        WHEN LOWER(LTRIM(RTRIM(sub.target_unit))) IN (N'ชิ้น','pcs')
          THEN ISNULL(sa.actual_qty,0)
        WHEN LOWER(LTRIM(RTRIM(sub.target_unit))) = N'บาท'
          THEN ISNULL(sa.actual_amount,0)
        WHEN LOWER(LTRIM(RTRIM(sub.target_unit))) IN (N'ตัน','ton')
          THEN ISNULL(sa.actual_weight,0) / 1000.0
        WHEN LOWER(LTRIM(RTRIM(sub.target_unit))) IN (N'ตร.ฟ.','ตร.ฟุต','sqft','sq ft')
          THEN ISNULL(sa.actual_area,0)
      END AS actual_value
    FROM (
      SELECT 
        SUM(ISNULL(r.Quantity,0)) AS actual_qty,
        SUM(ISNULL(r.Total_Cost,0)) AS actual_amount,
        SUM(ISNULL(r.Gross_Weight,0)) AS actual_weight,
        SUM(ISNULL(r.Area_SQFT,0)) AS actual_area
      FROM RE_Detail_WithCost r
      WHERE r.Posting_Date >= sub.start_date
        AND r.Posting_Date < DATEADD(DAY, 1, sub.end_date)
        AND (
          (sub.category = 'Accessories'
            AND EXISTS (
              SELECT 1
              FROM STRING_SPLIT(REPLACE(ISNULL(sub.brand_code,''),' ',''), ',') bc_s
              CROSS JOIN (
                SELECT CAST(NULL AS NVARCHAR(10)) AS sub_val
                WHERE NULLIF(sub.sub_group_code,'') IS NULL
                UNION ALL
                SELECT LTRIM(RTRIM(sc_s.value))
                FROM STRING_SPLIT(REPLACE(ISNULL(sub.sub_group_code,''),' ',''), ',') sc_s
                WHERE LTRIM(RTRIM(sc_s.value)) <> ''
                  AND NULLIF(sub.sub_group_code,'') IS NOT NULL
              ) sub_s
              WHERE LTRIM(RTRIM(bc_s.value)) <> ''
                AND r.SKU LIKE CONCAT(
                  'E',
                  RIGHT('000' + LTRIM(RTRIM(bc_s.value)), 3),   -- brand 3 หลัก
                  CASE WHEN NULLIF(sub.product_group_code,'') IS NULL THEN ''
                       ELSE RIGHT('00' + LTRIM(RTRIM(
                              (SELECT TOP 1 LTRIM(RTRIM(gc_s.value))
                               FROM STRING_SPLIT(REPLACE(sub.product_group_code,' ',''),',') gc_s
                               WHERE LTRIM(RTRIM(gc_s.value))<>'')
                            )), 2)
                  END,
                  CASE WHEN sub_s.sub_val IS NULL THEN '%'
                       ELSE RIGHT('00' + sub_s.sub_val, 2) + '%'  -- sub 2 หลัก
                  END
                )
            )
          )
          OR
          (sub.category <> 'Accessories'
            AND EXISTS (
              SELECT 1
              FROM STRING_SPLIT(REPLACE(ISNULL(sub.brand_code,''),' ',''), ',') bc_s
              CROSS JOIN (
                SELECT CAST(NULL AS NVARCHAR(10)) AS sub_val
                WHERE NULLIF(sub.sub_group_code,'') IS NULL
                UNION ALL
                SELECT LTRIM(RTRIM(sc_s.value))
                FROM STRING_SPLIT(REPLACE(ISNULL(sub.sub_group_code,''),' ',''), ',') sc_s
                WHERE LTRIM(RTRIM(sc_s.value)) <> ''
                  AND NULLIF(sub.sub_group_code,'') IS NOT NULL
              ) sub_s
              WHERE LTRIM(RTRIM(bc_s.value)) <> ''
                AND r.SKU LIKE CONCAT(
                  CASE sub.category
                    WHEN 'Glass'    THEN 'G'
                    WHEN 'Aluminum' THEN 'A'
                    WHEN 'Sealant'  THEN 'S'
                    WHEN 'Gypsum'   THEN 'Y'
                    WHEN 'C-Line'   THEN 'C'
                  END,
                  RIGHT('00' + LTRIM(RTRIM(bc_s.value)), 2),    -- brand 2 หลัก
                  CASE WHEN NULLIF(sub.product_group_code,'') IS NULL THEN ''
                       ELSE RIGHT('00' + LTRIM(RTRIM(
                              (SELECT TOP 1 LTRIM(RTRIM(gc_s.value))
                               FROM STRING_SPLIT(REPLACE(sub.product_group_code,' ',''),',') gc_s
                               WHERE LTRIM(RTRIM(gc_s.value))<>'')
                            )), 2)
                  END,
                  CASE WHEN sub_s.sub_val IS NULL THEN '%'
                       ELSE RIGHT('000' + sub_s.sub_val, 3) + '%'  -- sub 3 หลัก
                  END
                )
            )
          )
        )
        AND (
          NULLIF(sub.branch,'') IS NULL
          OR EXISTS (
            SELECT 1 FROM STRING_SPLIT(REPLACE(sub.branch,' ',''), ',') b
            WHERE LTRIM(RTRIM(b.value)) <> ''
              AND UPPER(LTRIM(RTRIM(r.Branch))) = UPPER(LTRIM(RTRIM(b.value)))
          )
        )
    ) sa
  ) sub_calc
  WHERE sub.parent_target_ref = t.target_ref
    AND sub.status IN ('OPEN','CLOSED')
) sub_agg
WHERE t.supplier_code = @supplier_code
ORDER BY t.created_at DESC;`);

    // Debug output
    result.recordset.forEach(t => {
      console.log(`📊 ${t.target_ref}: qty=${t.target_qty}, actual=${t.actual_qty}, start=${t.start_date}, end=${t.end_date}, branch=${t.branch}`);
    });

    res.json(result.recordset);

  } catch (err) {
    console.error("❌ Fetch Target Error:", err);
    res.status(500).json({ error: err.message });
  }
};


/* ============================================================
   TOGGLE TARGET STATUS  (แก้ตรงนี้)
============================================================ */
export const cancelTarget = async (req, res) => {
  try {
    const pool = await getPool();
    const id = req.params.id;

    // 🔍 เช็คสถานะก่อน
    const check = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT status
        FROM supplier_targets
        WHERE id = @id
      `);

    if (check.recordset.length === 0) {
      return res.status(404).json({ error: "Target not found" });
    }

    const currentStatus = check.recordset[0].status;

    // 🔒 ถ้า CLOSED ห้ามแก้
    if (currentStatus === "CLOSED") {
      return res.status(400).json({
        error: "CLOSED target cannot be reopened"
      });
    }

    // 🔁 Toggle เฉพาะ OPEN <-> CANCELLED
    await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE supplier_targets
        SET status =
          CASE
            WHEN status = 'OPEN' THEN 'CANCELLED'
            WHEN status = 'CANCELLED' THEN 'OPEN'
          END,
          updated_at = GETDATE()
        WHERE id = @id
      `);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Toggle Target Error:", err);
    res.status(500).json({ error: "Toggle failed" });
  }
};

/* ============================================================
   MASTER DATA
============================================================ */
export const getTargetMasterData = async (req, res) => {
  try {
    const pool = await getPool();

    const regions = await pool.request()
      .query(`SELECT DISTINCT region FROM supplier_targets`);

    const categories = await pool.request()
      .query(`SELECT DISTINCT category FROM supplier_targets`);

    const brands = await pool.request()
      .query(`SELECT DISTINCT brand FROM supplier_targets`);

    const groups = await pool.request()
      .query(`SELECT DISTINCT product_group FROM supplier_targets`);

    const subGroups = await pool.request()
  .query(`
    SELECT DISTINCT 
      sub_group,
      sub_group_code
    FROM supplier_targets
  `);

    const colors = await pool.request()
      .query(`SELECT DISTINCT color FROM supplier_targets`);

    const thickness = await pool.request()
      .query(`SELECT DISTINCT thickness FROM supplier_targets`);

    const molds = await pool.request()
      .query(`SELECT DISTINCT mold FROM supplier_targets`);

    res.json({
      regions: regions.recordset,
      categories: categories.recordset,
      brands: brands.recordset,
      groups: groups.recordset,
      subGroups: subGroups.recordset,
      colors: colors.recordset,
      thickness: thickness.recordset,
      molds: molds.recordset
    });

  } catch (err) {
    console.error("Master Data Error:", err);
    res.status(500).json({ error: "Fetch Master Data Failed" });
  }
};

/* ============================================================
   GET THICKNESS BY CATEGORY
============================================================ */
export const getThicknessByCategory = async (req, res) => {
  try {
    const pool = await getPool();
    const category = req.params.category;

    let tableName = "";

    switch (category) {
      case "Glass":
        tableName = "THICKNESS_Glass";
        break;
      case "Aluminum":
        tableName = "THICKNESS_Aluminium";
        break;
      case "C-Line":
        tableName = "THICKNESS_CLine";
        break;
      case "Gypsum":
        tableName = "THICKNESS_Gypsum";
        break;
      default:
        return res.json([]);
    }

    const result = await pool.request()
      .query(`SELECT THICKNESS_NO, THICKNESS_NAME FROM ${tableName} ORDER BY THICKNESS_NO`);

    res.json(result.recordset);

  } catch (err) {
    console.error("Thickness Error:", err);
    res.status(500).json({ error: "Fetch Thickness Failed" });
  }
};

/* ============================================================
   GET BRANDS BY SUPPLIER
============================================================ */
export const getBrandsBySupplier = async (req, res) => {
  try {
    const pool = await getPool();
    const supplierNo = req.params.supplierCode;

    const result = await pool.request()
      .input("supplierNo", supplierNo)
      .query(`
        WITH Latest AS (
          SELECT TOP 1 *
          FROM Supplier_ProductCoverage_History
          WHERE SupplierNo = @supplierNo
          ORDER BY CreatedAt DESC
        )

        SELECT DISTINCT
          CASE 
            WHEN JSON_VALUE(j.value,'$.category') = 'Aluminum'
              THEN ba.BRAND_NAME
            WHEN JSON_VALUE(j.value,'$.category') = 'Glass'
              THEN bg.BRAND_NAME
            WHEN JSON_VALUE(j.value,'$.category') = 'C-Line'
              THEN bc.BRAND_NAME
            WHEN JSON_VALUE(j.value,'$.category') = 'Gypsum'
              THEN gy.BRAND_NAME
            WHEN JSON_VALUE(j.value,'$.category') = 'Sealant'
              THEN bs.BRAND_NAME
          END AS brand

        FROM Latest
        CROSS APPLY OPENJSON(Latest.PayloadJson) j

        LEFT JOIN BRAND_Aluminium ba
          ON ba.BRAND_NO = RIGHT('00' + JSON_VALUE(j.value,'$.brand'), 2)

        LEFT JOIN BRAND_Glass bg
          ON bg.BRAND_NO = RIGHT('00' + JSON_VALUE(j.value,'$.brand'), 2)

        LEFT JOIN BRAND_CLine bc
          ON bc.BRAND_NO = RIGHT('00' + JSON_VALUE(j.value,'$.brand'), 2)

        LEFT JOIN BRAND_Gypsum gy
          ON gy.BRAND_NO = RIGHT('00' + JSON_VALUE(j.value,'$.brand'), 2)

        LEFT JOIN BRAND_Sealant bs
          ON bs.BRAND_NO = RIGHT('00' + JSON_VALUE(j.value,'$.brand'), 2)

        WHERE JSON_VALUE(j.value,'$.brand') IS NOT NULL
        ORDER BY brand
      `);

    res.json(result.recordset);

  } catch (err) {
    console.error("Brand by Supplier Error:", err);
    res.status(500).json({ error: "Fetch Brands Failed" });
  }
};

/* ============================================================
   GET PARENT TARGETS (สำหรับ dropdown เลือกเป้าหลัก)
============================================================ */
export const getParentTargets = async (req, res) => {
  try {
    const pool = await getPool();
    const supplierCode = req.params.supplierCode;

    const result = await pool.request()
      .input("supplier_code", sql.NVarChar, supplierCode)
      .query(`
        SELECT 
          id, 
          target_ref, 
          target_name, 
          category, 
          brand,
          region,
          province,
          branch,
          product_group,
          product_group_code,
          sub_group,
          sub_group_code,
          color,
          thickness,
          mold,
          sku
        FROM supplier_targets
        WHERE supplier_code = @supplier_code
          AND parent_target_ref IS NULL
          AND status = 'OPEN'
        ORDER BY created_at DESC
      `);

    res.json(result.recordset);

  } catch (err) {
    console.error("Fetch Parent Targets Error:", err);
    res.status(500).json({ error: "Fetch Parent Targets Failed" });
  }
};

/* ============================================================
   TEST: Check RE_Detail_WithCost
============================================================ */
export const testREDetail = async (req, res) => {
  try {
    const pool = await getPool();
    const { sku, startDate, endDate } = req.query;

    let query = `
      SELECT TOP 20 
        Posting_Date, SKU, Branch, Quantity, Total_Cost, Area_SQFT
      FROM RE_Detail_WithCost
      WHERE Area_SQFT > 0
      ORDER BY Posting_Date DESC
    `;

    if (sku) {
      query = `
        SELECT 
          Posting_Date, SKU, Branch, Quantity, Total_Cost, Area_SQFT
        FROM RE_Detail_WithCost
        WHERE SKU LIKE '%' + @sku + '%'
          ${startDate ? "AND Posting_Date >= @startDate" : ""}
          ${endDate ? "AND Posting_Date < DATEADD(DAY,1,@endDate)" : ""}
        ORDER BY Posting_Date DESC
      `;
    }

    const request = pool.request();
    if (sku) request.input("sku", sql.NVarChar, sku);
    if (startDate) request.input("startDate", sql.Date, startDate);
    if (endDate) request.input("endDate", sql.Date, endDate);

    const result = await request.query(query);
    res.json(result.recordset);

  } catch (err) {
    console.error("Test RE Detail Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================================================
   DEBUG: Check Glass Target Area Calculation
============================================================ */
export const debugGlassTargetArea = async (req, res) => {
  try {
    const pool = await getPool();
    const targetId = req.params.id;

    const targetResult = await pool.request()
      .input("targetId", sql.Int, targetId)
      .query(`
        SELECT 
          t.id, t.target_ref, t.target_name, t.brand_code, t.product_group_code, t.sub_group_code,
          t.target_unit, t.target_qty, t.start_date, t.end_date, t.sku,
          t.brand_code AS brand_no
        FROM supplier_targets t
        WHERE t.id = @targetId
      `);

    if (targetResult.recordset.length === 0) {
      return res.status(404).json({ error: "Target not found" });
    }

    const t = targetResult.recordset[0];
    const brandNo = t.brand_no;
    const startDate = t.start_date;
    const endDate = t.end_date;

    const skuPattern = `G${String(brandNo).padStart(2, '0')}${String(t.product_group_code || '').padStart(2, '0')}${t.sub_group_code ? String(t.sub_group_code).padStart(3, '0') : ''}%`;

    const areaResult = await pool.request()
      .input("startDate", sql.Date, startDate)
      .input("endDate", sql.Date, endDate)
      .input("skuPattern", sql.NVarChar, skuPattern)
      .query(`
        SELECT 
          SUM(ISNULL(Area_SQFT, 0)) AS total_area,
          COUNT(*) AS record_count,
          (SELECT TOP 10 SKU, Posting_Date, Area_SQFT, Branch, Quantity
           FROM RE_Detail_WithCost
           WHERE Posting_Date >= @startDate
             AND Posting_Date < DATEADD(DAY, 1, @endDate)
             AND SKU LIKE @skuPattern
           ORDER BY Posting_Date DESC
           FOR JSON PATH, ROOT('samples')
          ) AS sample_data
        FROM RE_Detail_WithCost
        WHERE Posting_Date >= @startDate
          AND Posting_Date < DATEADD(DAY, 1, @endDate)
          AND SKU LIKE @skuPattern
      `);

    res.json({
      target: t,
      sku_pattern: skuPattern,
      date_range: { startDate, endDate },
      result: areaResult.recordset[0]
    });

  } catch (err) {
    console.error("Debug Glass Target Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================================================
   CALCULATE ALL OPEN TARGETS FOR SUPPLIER (with cache)
============================================================ */
export const calculateSupplierTargets = async (req, res) => {
  try {
    const pool = await getPool();
    const supplierCode = req.params.supplierCode;

    const targetsResult = await pool.request()
      .input("supplierCode", sql.NVarChar, supplierCode)
      .query(`
        SELECT t.*,
          t.brand_code AS glass_brand_no,
          t.brand_code AS alu_brand_no,
          t.brand_code AS gyro_brand_no,
          t.brand_code AS cline_brand_no,
          t.brand_code AS sealant_brand_no,
          t.brand_code AS acc_brand_no
        FROM supplier_targets t
        WHERE t.supplier_code = @supplierCode AND t.status = 'OPEN'
        ORDER BY t.id
      `);

    if (targetsResult.recordset.length === 0) {
      return res.json({ 
        supplier_code: supplierCode, 
        status: "OPEN",
        targets: [] 
      });
    }

    const results = [];

    for (let i = 0; i < targetsResult.recordset.length; i++) {
      const t = targetsResult.recordset[i];
      const isLatest = i === 0;
      const brandNo = t.category === 'Glass' ? t.glass_brand_no
        : t.category === 'Aluminum' ? t.alu_brand_no
        : t.category === 'Gypsum' ? t.gyro_brand_no
        : t.category === 'C-Line' ? t.cline_brand_no
        : t.category === 'Sealant' ? t.sealant_brand_no
        : t.category === 'Accessories' ? t.acc_brand_no
        : null;

      const categoryPrefix = t.category === 'Glass' ? 'G'
        : t.category === 'Aluminum' ? 'A'
        : t.category === 'Sealant' ? 'S'
        : t.category === 'Gypsum' ? 'Y'
        : t.category === 'C-Line' ? 'C'
        : t.category === 'Accessories' ? 'E'
        : null;

      const skuPattern = categoryPrefix && brandNo 
        ? `${categoryPrefix}${String(brandNo).padStart(2, '0')}${String(t.product_group_code || '').padStart(2, '0')}${t.sub_group_code ? String(t.sub_group_code).padStart(3, '0') : ''}%`
        : null;

      // แปลงวันที่ พ.ศ. เป็น ค.ศ. ก่อนส่งให้ SQL (ถ้าจำเป็น)
      const startDateBE = new Date(t.start_date);
      const endDateBE = new Date(t.end_date);
      const startYear = startDateBE.getFullYear();
      const endYear = endDateBE.getFullYear();
      
      const startDateCE = new Date(
        startYear > 2500 ? startYear - 543 : startYear,
        startDateBE.getMonth(),
        startDateBE.getDate()
      );
      const endDateCE = new Date(
        endYear > 2500 ? endYear - 543 : endYear,
        endDateBE.getMonth(),
        endDateBE.getDate()
      );

      const actualResult = await pool.request()
        .input("startDate", sql.Date, startDateCE.toISOString().split('T')[0])
        .input("endDate", sql.Date, endDateCE.toISOString().split('T')[0])
        .input("skuPattern", sql.NVarChar, skuPattern)
        .input("targetSku", sql.NVarChar, t.sku)
        .query(`
          SELECT 
            SUM(Quantity) AS actual_qty,
            SUM(Total_Cost) AS actual_amount,
            SUM(ISNULL(Gross_Weight,0)) AS actual_weight,
            SUM(ISNULL(Area_SQFT,0)) AS actual_area
          FROM RE_Detail_WithCost
          WHERE Posting_Date >= @startDate
            AND Posting_Date < DATEADD(DAY, 1, @endDate)
            AND (
              (@skuPattern IS NOT NULL AND SKU LIKE @skuPattern)
              OR (
                @targetSku IS NOT NULL 
                AND @targetSku <> ''
                AND EXISTS (
                  SELECT 1 FROM STRING_SPLIT(@targetSku, ',') s
                  WHERE LTRIM(RTRIM(s.value)) <> '' AND SKU = LTRIM(RTRIM(s.value))
                )
              )
              OR (@skuPattern IS NULL AND (@targetSku IS NULL OR @targetSku = ''))
            )
        `);

      const a = actualResult.recordset[0];
      const actualQty = parseFloat(a.actual_qty) || 0;
      const actualAmount = parseFloat(a.actual_amount) || 0;
      const actualWeight = parseFloat(a.actual_weight) || 0;
      const actualArea = parseFloat(a.actual_area) || 0;

      let actualValue = 0;
      const targetUnitLower = (t.target_unit || '').toLowerCase().trim();
      
      if (targetUnitLower === 'ชิ้น' || targetUnitLower === 'pcs') {
        actualValue = actualQty;
      } else if (targetUnitLower === 'บาท') {
        actualValue = actualAmount;
      } else if (targetUnitLower === 'ตัน' || targetUnitLower === 'ton') {
        actualValue = actualWeight / 1000;
      } else if (targetUnitLower === 'ตร.ฟ.' || targetUnitLower === 'ตร.ฟุต' || targetUnitLower === 'sqft' || targetUnitLower === 'sq ft') {
        actualValue = actualArea;
      }

      const targetQty = parseFloat(t.target_qty) || 0;
      const achievementPercent = targetQty > 0 ? (actualValue * 100) / targetQty : null;

      const now = new Date();
      const today = now.toISOString().split('T')[0];
      // แปลงวันที่ พ.ศ. เป็น ค.ศ. (ถ้าจำเป็น)
      const startBE = new Date(t.start_date);
      const endBE = new Date(t.end_date);
      const startYear3 = startBE.getFullYear();
      const endYear3 = endBE.getFullYear();
      const startCE = new Date(
        startYear3 > 2500 ? startYear3 - 543 : startYear3,
        startBE.getMonth(),
        startBE.getDate()
      );
      const endCE = new Date(
        endYear3 > 2500 ? endYear3 - 543 : endYear3,
        endBE.getMonth(),
        endBE.getDate()
      );
      const startDateStr = startCE.toISOString().split('T')[0];
      const endDateStr = endCE.toISOString().split('T')[0];

      let targetState = "ยังไม่ถึงเป้า";
      let isAchieved = false;

      if (today < startDateStr) {
        targetState = "ยังไม่เริ่ม";
      } else if (today > endDateStr) {
        if (actualValue >= targetQty && targetQty > 0) {
          targetState = "บรรลุแล้ว (หมดอายุ)";
          isAchieved = true;
        } else {
          targetState = "ไม่ถึงเป้า (หมดอายุ)";
        }
      } else if (actualValue >= targetQty && targetQty > 0) {
        targetState = "บรรลุเป้า";
        isAchieved = true;
      }

      results.push({
        target_id: t.id,
        target_ref: t.target_ref,
        target_name: t.target_name,
        target_qty: targetQty,
        target_unit: t.target_unit,
        sku_pattern: skuPattern,
        target_sku: t.sku,
        is_latest: isLatest,
        actual_qty: actualQty,
        actual_amount: actualAmount,
        actual_weight: actualWeight,
        actual_area: actualArea,
        actual_value: actualValue,
        achievement_percent: achievementPercent,
        status: t.status,
        target_state: targetState,
        is_achieved: isAchieved,
        start_date: t.start_date,
        end_date: t.end_date,
        category: t.category,
        brand_code: t.brand_code,
        product_group_code: t.product_group_code,
        sub_group_code: t.sub_group_code,
        calculated_at: new Date().toISOString()
      });
    }

    res.json({
      supplier_code: supplierCode,
      status: "OPEN",
      total_targets: results.length,
      targets: results
    });

  } catch (err) {
    console.error("Calculate Supplier Targets Error:", err);
    res.status(500).json({ error: err.message });
  }
};


/* ============================================================
   CALCULATE SINGLE TARGET (with cache)
============================================================ */
export const calculateSingleTarget = async (req, res) => {
  try {
    const pool = await getPool();
    const targetId = req.params.id;

    const targetResult = await pool.request()
      .input("targetId", sql.Int, targetId)
      .query(`
        SELECT t.*,
          t.brand_code AS glass_brand_no,
          t.brand_code AS alu_brand_no,
          t.brand_code AS gyro_brand_no,
          t.brand_code AS cline_brand_no,
          t.brand_code AS sealant_brand_no,
          t.brand_code AS acc_brand_no
        FROM supplier_targets t
        WHERE t.id = @targetId
      `);

    if (targetResult.recordset.length === 0) {
      return res.status(404).json({ error: "Target not found" });
    }

    const t = targetResult.recordset[0];

    const brandNo = t.category === 'Glass' ? t.glass_brand_no
      : t.category === 'Aluminum' ? t.alu_brand_no
      : t.category === 'Gypsum' ? t.gyro_brand_no
      : t.category === 'C-Line' ? t.cline_brand_no
      : t.category === 'Sealant' ? t.sealant_brand_no
      : t.category === 'Accessories' ? t.acc_brand_no
      : null;

    const categoryPrefix = t.category === 'Glass' ? 'G'
      : t.category === 'Aluminum' ? 'A'
      : t.category === 'Sealant' ? 'S'
      : t.category === 'Gypsum' ? 'Y'
      : t.category === 'C-Line' ? 'C'
      : t.category === 'Accessories' ? 'E'
      : null;

    const skuPattern = categoryPrefix && brandNo 
      ? `${categoryPrefix}${String(brandNo).padStart(2, '0')}${String(t.product_group_code || '').padStart(2, '0')}${t.sub_group_code ? String(t.sub_group_code).padStart(3, '0') : ''}%`
      : null;

    // แปลงวันที่ พ.ศ. เป็น ค.ศ. ก่อนส่งให้ SQL (ถ้าจำเป็น)
    const startDateBE2 = new Date(t.start_date);
    const endDateBE2 = new Date(t.end_date);
    const startYear2 = startDateBE2.getFullYear();
    const endYear2 = endDateBE2.getFullYear();
    
    const startDateCE2 = new Date(
      startYear2 > 2500 ? startYear2 - 543 : startYear2,
      startDateBE2.getMonth(),
      startDateBE2.getDate()
    );
    const endDateCE2 = new Date(
      endYear2 > 2500 ? endYear2 - 543 : endYear2,
      endDateBE2.getMonth(),
      endDateBE2.getDate()
    );

    const actualResult = await pool.request()
      .input("startDate", sql.Date, startDateCE2.toISOString().split('T')[0])
      .input("endDate", sql.Date, endDateCE2.toISOString().split('T')[0])
      .input("skuPattern", sql.NVarChar, skuPattern)
      .query(`
        SELECT 
          SUM(Quantity) AS actual_qty,
          SUM(Total_Cost) AS actual_amount,
          SUM(ISNULL(Gross_Weight,0)) AS actual_weight,
          SUM(ISNULL(Area_SQFT,0)) AS actual_area
        FROM RE_Detail_WithCost
        WHERE Posting_Date >= @startDate
          AND Posting_Date < DATEADD(DAY, 1, @endDate)
          AND (
            (@skuPattern IS NOT NULL AND SKU LIKE @skuPattern)
            OR (
              t.sku IS NOT NULL 
              AND t.sku <> ''
              AND EXISTS (
                SELECT 1 FROM STRING_SPLIT(t.sku, ',') s
                WHERE LTRIM(RTRIM(s.value)) <> '' AND SKU = LTRIM(RTRIM(s.value))
              )
            )
            OR (@skuPattern IS NULL AND (t.sku IS NULL OR t.sku = ''))
          )
      `);

    const a = actualResult.recordset[0];
    const actualQty = parseFloat(a.actual_qty) || 0;
    const actualAmount = parseFloat(a.actual_amount) || 0;
    const actualWeight = parseFloat(a.actual_weight) || 0;
    const actualArea = parseFloat(a.actual_area) || 0;

    let actualValue = 0;
    const targetUnitLower = (t.target_unit || '').toLowerCase().trim();
    
    if (targetUnitLower === 'ชิ้น' || targetUnitLower === 'pcs') {
      actualValue = actualQty;
    } else if (targetUnitLower === 'บาท') {
      actualValue = actualAmount;
    } else if (targetUnitLower === 'ตัน' || targetUnitLower === 'ton') {
      actualValue = actualWeight / 1000;
    } else if (targetUnitLower === 'ตร.ฟ.' || targetUnitLower === 'ตร.ฟุต' || targetUnitLower === 'sqft' || targetUnitLower === 'sq ft') {
      actualValue = actualArea;
    }

    const targetQty = parseFloat(t.target_qty) || 0;
    const achievementPercent = targetQty > 0 ? (actualValue * 100) / targetQty : null;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    // แปลงวันที่ พ.ศ. เป็น ค.ศ. (ถ้าจำเป็น)
    const startBE = new Date(t.start_date);
    const endBE = new Date(t.end_date);
    const startYear4 = startBE.getFullYear();
    const endYear4 = endBE.getFullYear();
    const startCE = new Date(
      startYear4 > 2500 ? startYear4 - 543 : startYear4,
      startBE.getMonth(),
      startBE.getDate()
    );
    const endCE = new Date(
      endYear4 > 2500 ? endYear4 - 543 : endYear4,
      endBE.getMonth(),
      endBE.getDate()
    );
    const startDateStr = startCE.toISOString().split('T')[0];
    const endDateStr = endCE.toISOString().split('T')[0];

    let targetState = "ยังไม่ถึงเป้า";
    let isAchieved = false;

    if (today < startDateStr) {
      targetState = "ยังไม่เริ่ม";
    } else if (today > endDateStr) {
      if (actualValue >= targetQty && targetQty > 0) {
        targetState = "บรรลุแล้ว (หมดอายุ)";
        isAchieved = true;
      } else {
        targetState = "ไม่ถึงเป้า (หมดอายุ)";
      }
    } else if (actualValue >= targetQty && targetQty > 0) {
      targetState = "บรรลุเป้า";
      isAchieved = true;
    }

    const result = {
      target_id: t.id,
      target_ref: t.target_ref,
      target_name: t.target_name,
      target_qty: targetQty,
      target_unit: t.target_unit,
      sku_pattern: skuPattern,
      target_sku: t.sku,
      is_latest: true,
      actual_qty: actualQty,
      actual_amount: actualAmount,
      actual_weight: actualWeight,
      actual_area: actualArea,
      actual_value: actualValue,
      achievement_percent: achievementPercent,
      status: t.status,
      target_state: targetState,
      is_achieved: isAchieved,
      start_date: t.start_date,
      end_date: t.end_date,
      category: t.category,
      brand_code: t.brand_code,
      product_group_code: t.product_group_code,
      sub_group_code: t.sub_group_code,
      calculated_at: now.toISOString()
    };

    await pool.request()
      .input("targetId", sql.Int, targetId)
      .input("actualQty", sql.Decimal(18,2), actualQty)
      .input("actualAmount", sql.Decimal(18,2), actualAmount)
      .input("actualWeight", sql.Decimal(18,2), actualWeight)
      .input("actualArea", sql.Decimal(18,2), actualArea)
      .input("actualValue", sql.Decimal(18,2), actualValue)
      .input("achievementPercent", sql.Decimal(18,2), achievementPercent)
      .input("targetState", sql.NVarChar, targetState)
      .input("isAchieved", sql.Bit, isAchieved ? 1 : 0)
      .query(`
        UPDATE supplier_targets SET
          cached_actual_qty = @actualQty,
          cached_actual_amount = @actualAmount,
          cached_actual_weight = @actualWeight,
          cached_actual_area = @actualArea,
          cached_actual_value = @actualValue,
          cached_achievement_percent = @achievementPercent,
          cached_target_state = @targetState,
          cached_is_achieved = @isAchieved,
          cached_at = GETDATE()
        WHERE id = @targetId
      `);

    res.json(result);

  } catch (err) {
    console.error("Calculate Single Target Error:", err);
    res.status(500).json({ error: err.message });
  }
};


/* ============================================================
    DEBUG V2: By target_ref
============================================================ */
export const debugGlassTargetAreaByRef = async (req, res) => {
  try {
    const pool = await getPool();
    const targetRef = req.params.ref;

    const targetResult = await pool.request()
      .input("targetRef", sql.NVarChar, targetRef)
      .query(`
        SELECT 
          t.id, t.target_ref, t.target_name, t.brand_code, t.product_group_code, t.sub_group_code,
          t.target_unit, t.target_qty, t.start_date, t.end_date, t.sku,
          t.branch, t.category,
          t.brand_code AS brand_no
        FROM supplier_targets t
        WHERE t.target_ref = @targetRef
      `);

    if (targetResult.recordset.length === 0) {
      return res.status(404).json({ error: "Target not found" });
    }

    const t = targetResult.recordset[0];
    const brandNo = t.brand_no;
    const startDate = t.start_date;
    const endDate = t.end_date;

    const skuPattern = `G${String(brandNo).padStart(2, '0')}${String(t.product_group_code || '').padStart(2, '0')}${t.sub_group_code ? String(t.sub_group_code).padStart(3, '0') : ''}%`;

    const areaResult = await pool.request()
      .input("startDate", sql.Date, startDate)
      .input("endDate", sql.Date, endDate)
      .input("skuPattern", sql.NVarChar, skuPattern)
      .query(`
        SELECT 
          SUM(ISNULL(Area_SQFT, 0)) AS total_area,
          COUNT(*) AS record_count
        FROM RE_Detail_WithCost
        WHERE Posting_Date >= @startDate
          AND Posting_Date < DATEADD(DAY, 1, @endDate)
          AND SKU LIKE @skuPattern
      `);

    res.json({
      target_ref: targetRef,
      target_id: t.id,
      brand_code: t.brand_code,
      brand_no: brandNo,
      product_group_code: t.product_group_code,
      sub_group_code: t.sub_group_code,
      sku_pattern: skuPattern,
      target_sku: t.sku,
      branch: t.branch,
      category: t.category,
      start_date: startDate,
      end_date: endDate,
      total_area: areaResult.recordset[0].total_area,
      record_count: areaResult.recordset[0].record_count
    });

  } catch (err) {
    console.error("Debug Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ============================================================
    DEBUG: Check actual calculation for target
============================================================ */
export const debugTargetCalculation = async (req, res) => {
  try {
    const pool = await getPool();
    const targetId = req.params.id;

    // 1. ดึงข้อมูล target
    const targetResult = await pool.request()
      .input("targetId", sql.Int, targetId)
      .query(`SELECT t.* FROM supplier_targets t WHERE t.id = @targetId`);

    if (targetResult.recordset.length === 0) {
      return res.status(404).json({ error: "Target not found" });
    }

    const t = targetResult.recordset[0];

    // 2. สร้าง patterns จริงๆ ที่ SQL จะใช้ (multi-value)
    const isAcc = t.category === 'Accessories';
    const prefix = { Glass:'G', Aluminum:'A', Sealant:'S', Gypsum:'Y', 'C-Line':'C', Accessories:'E' }[t.category] || '?';

    const brandCodes = (t.brand_code || '').split(',').map(v => v.trim()).filter(Boolean);
    const groupCodes = (t.product_group_code || '').split(',').map(v => v.trim()).filter(Boolean);
    const subCodes   = (t.sub_group_code || '').split(',').map(v => v.trim()).filter(Boolean);

    const patterns = [];
    const groupPart = groupCodes.length
      ? (isAcc ? groupCodes[0].padStart(2,'0') : groupCodes[0].padStart(2,'0'))
      : '';

    for (const bc of brandCodes) {
      const brandPart = isAcc ? bc.padStart(3,'0') : bc.padStart(2,'0');
      if (subCodes.length === 0) {
        patterns.push(`${prefix}${brandPart}${groupPart}%`);
      } else {
        for (const sc of subCodes) {
          const subPart = isAcc ? sc.padStart(2,'0') : sc.padStart(3,'0');
          patterns.push(`${prefix}${brandPart}${groupPart}${subPart}%`);
        }
      }
    }

    // 3. ดึง sample SKU จาก RE_Detail_WithCost ในช่วงวันที่ (ไม่กรอง SKU)
    const rawSample = await pool.request()
      .input("startDate", sql.Date, t.start_date)
      .input("endDate",   sql.Date, t.end_date)
      .query(`
        SELECT TOP 20 SKU, Posting_Date, Branch, Quantity, Total_Cost, Area_SQFT
        FROM RE_Detail_WithCost
        WHERE Posting_Date >= @startDate
          AND Posting_Date < DATEADD(DAY, 1, @endDate)
        ORDER BY Posting_Date DESC
      `);

    // 4. ดึง sample SKU ที่ match pattern แรก (ถ้ามี)
    let patternSample = [];
    if (patterns.length > 0) {
      const pr = await pool.request()
        .input("startDate",  sql.Date,    t.start_date)
        .input("endDate",    sql.Date,    t.end_date)
        .input("skuPattern", sql.NVarChar, patterns[0])
        .query(`
          SELECT TOP 20 SKU, Posting_Date, Branch, Quantity, Total_Cost, Area_SQFT
          FROM RE_Detail_WithCost
          WHERE Posting_Date >= @startDate
            AND Posting_Date < DATEADD(DAY, 1, @endDate)
            AND SKU LIKE @skuPattern
          ORDER BY Posting_Date DESC
        `);
      patternSample = pr.recordset;
    }

    // 5. นับ record ที่ match ทุก pattern รวมกัน (ใช้ dynamic SQL)
    let totalCount = 0;
    let totalArea = 0;
    let totalWeight = 0;
    let totalAmount = 0;
    let totalQty = 0;
    for (const pat of patterns) {
      const cr = await pool.request()
        .input("startDate",  sql.Date,    t.start_date)
        .input("endDate",    sql.Date,    t.end_date)
        .input("skuPattern", sql.NVarChar, pat)
        .query(`
          SELECT
            COUNT(*) AS cnt,
            SUM(ISNULL(Area_SQFT,0))   AS area,
            SUM(ISNULL(Gross_Weight,0)) AS weight,
            SUM(ISNULL(Total_Cost,0))  AS amount,
            SUM(ISNULL(Quantity,0))    AS qty
          FROM RE_Detail_WithCost
          WHERE Posting_Date >= @startDate
            AND Posting_Date < DATEADD(DAY, 1, @endDate)
            AND SKU LIKE @skuPattern
        `);
      const row = cr.recordset[0];
      totalCount  += row.cnt || 0;
      totalArea   += parseFloat(row.area)   || 0;
      totalWeight += parseFloat(row.weight) || 0;
      totalAmount += parseFloat(row.amount) || 0;
      totalQty    += parseFloat(row.qty)    || 0;
    }

    res.json({
      target: {
        id: t.id,
        target_ref: t.target_ref,
        target_name: t.target_name,
        category: t.category,
        brand_code: t.brand_code,
        product_group_code: t.product_group_code,
        sub_group_code: t.sub_group_code,
        color: t.color,
        thickness: t.thickness,
        branch: t.branch,
        target_qty: t.target_qty,
        target_unit: t.target_unit,
        start_date: t.start_date,
        end_date: t.end_date,
      },
      patterns_generated: patterns,
      totals: {
        record_count: totalCount,
        actual_qty: totalQty,
        actual_amount: totalAmount,
        actual_weight_kg: totalWeight,
        actual_weight_ton: totalWeight / 1000,
        actual_area_sqft: totalArea,
      },
      raw_sample_in_date_range: rawSample.recordset,
      pattern_match_sample: patternSample,
    });

  } catch (err) {
    console.error("Debug Calculation Error:", err);
    res.status(500).json({ error: err.message });
  }
};


