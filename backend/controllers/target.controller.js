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
const month = String(now.getMonth() + 1).padStart(2, "0");
const day = String(now.getDate()).padStart(2, "0");

const prefix = `PT-${month}${day}`;

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

      // แก้ mapping ตรงนี้
      .input("brand", sql.NVarChar, d.brand_name ?? d.brand ?? null)
.input("brand_code", sql.NVarChar, d.brand ?? null)

.input("product_group", sql.NVarChar, d.group_name ?? d.product_group ?? d.group ?? null)
.input("product_group_code", sql.NVarChar, d.group ?? d.product_group ?? null)

     .input("sub_group", sql.NVarChar, d.sub_group_name ?? d.sub_group ?? null)
      .input(
  "sub_group_code",
  sql.NVarChar,
  d.sub_group_code && d.sub_group_code !== ''
    ? d.sub_group_code.toString().padStart(3, "0")
    : null
)
      .input("color", sql.NVarChar, d.color)
      .input(
  "thickness",
  sql.NVarChar,
  d.thickness ? d.thickness.toString().padStart(2, "0") : null
)
      .input("mold", sql.NVarChar, d.mold)
      .input("sku", sql.NVarChar, d.sku)
      .input("benefit_period", sql.NVarChar, d.benefit_period)
      .input("target_type", sql.NVarChar, d.target_type)
      .input("target_qty", sql.Decimal(18, 2), d.target_qty)
      .input("target_unit", sql.NVarChar, d.target_unit)
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
    @prefix + '-' + RIGHT('000' + CAST(@running AS VARCHAR), 3);

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
    res.status(500).json({ error: "Create Target Failed" });
  }
};


/* ============================================================
   GET TARGET BY SUPPLIER
============================================================ */
export const getTargetsBySupplier = async (req, res) => {
  const color = req.query.color || null;
  try {
    const pool = await getPool();
    const supplierCode = req.params.supplierCode;

    const result = await pool.request()
      .input("supplier_code", sql.NVarChar, supplierCode)
      .input("color", sql.NVarChar, color)
      .query(`

/* ============================================================
   1️⃣ AUTO CLOSE (บรรลุเป้า หรือ หมดอายุ)
============================================================ */

UPDATE t
SET t.status = 'CLOSED',
    t.updated_at = GETDATE()
FROM supplier_targets t

/* =========================
   BRAND NO
========================= */
OUTER APPLY (
    SELECT
        CASE t.category
            WHEN 'Gypsum' THEN (SELECT BRAND_NO FROM BRAND_Gypsum WHERE BRAND_ID = t.brand_code)
            WHEN 'Glass' THEN (SELECT BRAND_NO FROM BRAND_Glass WHERE BRAND_ID = t.brand_code)
            WHEN 'Aluminum' THEN (SELECT BRAND_NO FROM BRAND_Aluminium WHERE BRAND_ID = t.brand_code)
            WHEN 'C-Line' THEN (SELECT BRAND_NO FROM BRAND_CLine WHERE BRAND_ID = t.brand_code)
            WHEN 'Sealant' THEN (SELECT BRAND_NO FROM BRAND_Sealant WHERE BRAND_ID = t.brand_code)
            WHEN 'Accessories' THEN (SELECT BRAND_NO FROM Accessory_BRAND WHERE BRAND_ID = t.brand_code)
        END AS brand_no
) b

/* =========================
   ACTUAL DATA
========================= */
OUTER APPLY (
    SELECT 
        SUM(r.Quantity) AS actual_qty,
        SUM(r.Total_Cost) AS actual_amount,
        SUM(ISNULL(r.Gross_Weight,0)) AS actual_weight
    FROM RE_Detail_WithCost r
    WHERE r.Posting_Date >= t.start_date
      AND r.Posting_Date < DATEADD(DAY,1,t.end_date)

      AND (
        (
            (t.category = 'Accessories'
                AND r.SKU LIKE CONCAT(
                    'E',
                    b.brand_no,
                    RIGHT('00' + t.product_group_code, 2),
                    RIGHT('000' + t.sub_group_code, 3),
                    '%'
                )
            )
            OR
            (t.category <> 'Accessories'
                AND r.SKU LIKE CONCAT(
                    CASE t.category
                      WHEN 'Glass' THEN 'G'
                      WHEN 'Aluminum' THEN 'A'
                      WHEN 'Sealant' THEN 'S'
                      WHEN 'Gypsum' THEN 'Y'
                      WHEN 'C-Line' THEN 'C'
                    END,
                    RIGHT('00' + b.brand_no, 2),
                    RIGHT('00' + t.product_group_code, 2),
                    RIGHT('000' + t.sub_group_code, 3),
                    '%'
                )
            )
        )
        OR
        (
            t.sku IS NOT NULL
            AND t.sku <> ''
            AND EXISTS (
                SELECT 1
                FROM STRING_SPLIT(t.sku, ',') s
                WHERE LTRIM(RTRIM(s.value)) <> ''
                  AND r.SKU = LTRIM(RTRIM(s.value))
            )
        )
      )
) a

OUTER APPLY (
    SELECT 
        SUM(a2.actual_qty) AS sum_qty,
        SUM(a2.actual_amount) AS sum_amount,
        SUM(a2.actual_weight) AS sum_weight
    FROM supplier_targets t2

    OUTER APPLY (
        SELECT 
            SUM(r.Quantity) AS actual_qty,
            SUM(r.Total_Cost) AS actual_amount,
            SUM(ISNULL(r.Gross_Weight,0)) AS actual_weight
        FROM RE_Detail_WithCost r

        OUTER APPLY (
            SELECT
                CASE t2.category
                    WHEN 'Gypsum' THEN (SELECT BRAND_NO FROM BRAND_Gypsum WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Glass' THEN (SELECT BRAND_NO FROM BRAND_Glass WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Aluminum' THEN (SELECT BRAND_NO FROM BRAND_Aluminium WHERE BRAND_ID = t2.brand_code)
                    WHEN 'C-Line' THEN (SELECT BRAND_NO FROM BRAND_CLine WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Sealant' THEN (SELECT BRAND_NO FROM BRAND_Sealant WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Accessories' THEN (SELECT BRAND_NO FROM Accessory_BRAND WHERE BRAND_ID = t2.brand_code)
                END AS brand_no
        ) b2

        WHERE r.Posting_Date >= t2.start_date
          AND r.Posting_Date < DATEADD(DAY,1,t2.end_date)

          AND (
            (
                (t2.category = 'Accessories'
                    AND r.SKU LIKE CONCAT(
                        'E',
                        b2.brand_no,
                        RIGHT('00' + t2.product_group_code, 2),
                        RIGHT('000' + t2.sub_group_code, 3),
                        '%'
                    )
                )
                OR
                (t2.category <> 'Accessories'
                    AND r.SKU LIKE CONCAT(
                        CASE t2.category
                          WHEN 'Glass' THEN 'G'
                          WHEN 'Aluminum' THEN 'A'
                          WHEN 'Sealant' THEN 'S'
                          WHEN 'Gypsum' THEN 'Y'
                          WHEN 'C-Line' THEN 'C'
                        END,
                        RIGHT('00' + b2.brand_no, 2),
                        RIGHT('00' + t2.product_group_code, 2),
                        RIGHT('000' + t2.sub_group_code, 3),
                        '%'
                    )
                )
            )
            OR
            (
                t2.sku IS NOT NULL
                AND t2.sku <> ''
                AND EXISTS (
                    SELECT 1
                    FROM STRING_SPLIT(t2.sku, ',') s
                    WHERE LTRIM(RTRIM(s.value)) <> ''
                      AND r.SKU = LTRIM(RTRIM(s.value))
                )
            )
          )
    ) a2

    /* 🔥 logic split */
    WHERE 
    (
        t.parent_target_ref IS NULL
        AND t2.target_ref = t.target_ref
    )
    OR
    (
        t.parent_target_ref IS NOT NULL
        AND COALESCE(t2.parent_target_ref, t2.target_ref) = t.parent_target_ref
    )
) g

OUTER APPLY (
    SELECT SUM(target_qty) AS total_target
    FROM supplier_targets t3
    WHERE 
    (
        t.parent_target_ref IS NULL
        AND t3.target_ref = t.target_ref
    )
    OR
    (
        t.parent_target_ref IS NOT NULL
        AND COALESCE(t3.parent_target_ref, t3.target_ref) = t.parent_target_ref
    )
) tg

/* =========================
   🔥 CORE LOGIC (ตัวเดียว)
========================= */
OUTER APPLY (
    SELECT
        CASE
          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ชิ้น','pcs')
            THEN 
                CASE 
                    WHEN t.parent_target_ref IS NULL 
                        THEN ISNULL(a.actual_qty,0)
                    ELSE ISNULL(g.sum_qty,0)
                END

          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) = N'บาท'
            THEN 
                CASE 
                    WHEN t.parent_target_ref IS NULL 
                        THEN ISNULL(a.actual_amount,0)
                    ELSE ISNULL(g.sum_amount,0)
                END

          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ตัน','ton')
            THEN 
                CASE 
                    WHEN t.parent_target_ref IS NULL 
                        THEN ISNULL(a.actual_weight,0) / 1000.0
                    ELSE ISNULL(g.sum_weight,0) / 1000.0
                END
        END AS actual_value
) v

/* =========================
   CONDITION
========================= */
WHERE t.status = 'OPEN'
AND (
    v.actual_value >= 
        CASE 
            WHEN t.parent_target_ref IS NULL 
                THEN ISNULL(t.target_qty,0)
            ELSE ISNULL(tg.total_target,0)
        END
    OR GETDATE() > DATEADD(DAY,1,t.end_date)
)

/* ============================================================
   2️⃣ SELECT DATA
============================================================ */

SELECT
    t.*,

    /* =========================
       BRAND NAME
    ========================= */
    CASE 
        WHEN t.category = 'Aluminum' THEN ba.BRAND_NAME
        WHEN t.category = 'Glass' THEN bg.BRAND_NAME
        WHEN t.category = 'Gypsum' THEN gy.BRAND_NAME
        WHEN t.category = 'C-Line' THEN bc.BRAND_NAME
        WHEN t.category = 'Sealant' THEN bs.BRAND_NAME
        WHEN t.category = 'Accessories' THEN accb.BRAND_NAME
    END AS brand_name,

    accg.GroupName AS group_name,

    /* =========================
       RAW DATA
    ========================= */
    ISNULL(a.actual_qty,0) AS actual_qty,
    ISNULL(a.actual_amount,0) AS actual_amount,
    ISNULL(a.actual_weight,0) AS actual_weight,

    /* =========================
       🔥 CORE (ใช้ตัวเดียว)
    ========================= */
    v.actual_value,
    v.achievement_percent,

    /* =========================
   STATUS
========================= */
CASE
  WHEN GETDATE() < t.start_date
    THEN N'ยังไม่เริ่ม'

  WHEN GETDATE() > DATEADD(DAY,1,t.end_date)
       AND v.actual_value >= 
            CASE 
                WHEN t.parent_target_ref IS NULL 
                    THEN ISNULL(t.target_qty,0)
                ELSE ISNULL(tg.total_target,0)
            END
    THEN N'บรรลุแล้ว (หมดอายุ)'

  WHEN GETDATE() > DATEADD(DAY,1,t.end_date)
       AND v.actual_value < 
            CASE 
                WHEN t.parent_target_ref IS NULL 
                    THEN ISNULL(t.target_qty,0)
                ELSE ISNULL(tg.total_target,0)
            END
    THEN N'ไม่ถึงเป้า (หมดอายุ)'

  WHEN v.actual_value >= 
        CASE 
            WHEN t.parent_target_ref IS NULL 
                THEN ISNULL(t.target_qty,0)
            ELSE ISNULL(tg.total_target,0)
        END
    THEN N'บรรลุเป้า'

  ELSE N'ยังไม่ถึงเป้า'
END AS target_state,

/* =========================
   IS ACHIEVED
========================= */
CASE
  WHEN v.actual_value >= 
        CASE 
            WHEN t.parent_target_ref IS NULL 
                THEN ISNULL(t.target_qty,0)
            ELSE ISNULL(tg.total_target,0)
        END
       AND 
       CASE 
            WHEN t.parent_target_ref IS NULL 
                THEN ISNULL(t.target_qty,0)
            ELSE ISNULL(tg.total_target,0)
        END > 0
  THEN 1
  ELSE 0
END AS is_achieved
FROM supplier_targets t   -- 🔥 ต้องมีบรรทัดนี้

/* =========================
   BRAND NO
========================= */
OUTER APPLY (
    SELECT
        CASE t.category
            WHEN 'Gypsum' THEN (SELECT BRAND_NO FROM BRAND_Gypsum WHERE BRAND_ID = t.brand_code)
            WHEN 'Glass' THEN (SELECT BRAND_NO FROM BRAND_Glass WHERE BRAND_ID = t.brand_code)
            WHEN 'Aluminum' THEN (SELECT BRAND_NO FROM BRAND_Aluminium WHERE BRAND_ID = t.brand_code)
            WHEN 'C-Line' THEN (SELECT BRAND_NO FROM BRAND_CLine WHERE BRAND_ID = t.brand_code)
            WHEN 'Sealant' THEN (SELECT BRAND_NO FROM BRAND_Sealant WHERE BRAND_ID = t.brand_code)
            WHEN 'Accessories' THEN (SELECT BRAND_NO FROM Accessory_BRAND WHERE BRAND_ID = t.brand_code)
        END AS brand_no
) b

/* =========================
   CALC RAW
========================= */
OUTER APPLY (
  SELECT 
      SUM(r.Quantity) AS actual_qty,
      SUM(r.Total_Cost) AS actual_amount,
      SUM(ISNULL(r.Gross_Weight,0)) AS actual_weight
  FROM RE_Detail_WithCost r
  WHERE r.Posting_Date >= t.start_date
    AND r.Posting_Date < DATEADD(DAY,1,t.end_date)

    AND (
        (
            (t.category = 'Accessories'
                AND r.SKU LIKE CONCAT(
                    'E',
                    b.brand_no,
                    RIGHT('00' + t.product_group_code, 2),
                    RIGHT('000' + t.sub_group_code, 3),
                    '%'
                )
            )
            OR
            (t.category <> 'Accessories'
                AND r.SKU LIKE CONCAT(
                    CASE t.category
                      WHEN 'Glass' THEN 'G'
                      WHEN 'Aluminum' THEN 'A'
                      WHEN 'Sealant' THEN 'S'
                      WHEN 'Gypsum' THEN 'Y'
                      WHEN 'C-Line' THEN 'C'
                    END,
                    RIGHT('00' + b.brand_no, 2),
                    RIGHT('00' + t.product_group_code, 2),
                    RIGHT('000' + t.sub_group_code, 3),
                    '%'
                )
            )
        )
        OR
        (
            t.sku IS NOT NULL
            AND t.sku <> ''
            AND EXISTS (
                SELECT 1
                FROM STRING_SPLIT(t.sku, ',') s
                WHERE LTRIM(RTRIM(s.value)) <> ''
                  AND r.SKU = LTRIM(RTRIM(s.value))
            )
        )
    )

    /* FILTER */
    AND (
        @color IS NULL OR @color = ''
        OR (
            CASE 
                WHEN t.category = 'Gypsum'
                    THEN SUBSTRING(r.SKU, 9, 3)
                ELSE SUBSTRING(r.SKU, 9, 2)
            END
        ) = @color
    )

    AND (
        t.thickness IS NULL OR t.thickness = ''
        OR (
            CASE 
                WHEN t.category = 'Gypsum'
                    THEN SUBSTRING(r.SKU, 12, 2)
                ELSE SUBSTRING(r.SKU, 11, 2)
            END
        ) = RIGHT('00' + t.thickness, 2)
    )

    AND (
  NULLIF(t.branch,'') IS NULL
  OR UPPER(LTRIM(RTRIM(r.Branch))) IN (
    SELECT UPPER(TRIM(value))
    FROM STRING_SPLIT(REPLACE(t.branch,' ',''), ',')
  )
)
) a

OUTER APPLY (
    SELECT 
        SUM(a2.actual_qty) AS sum_qty,
        SUM(a2.actual_amount) AS sum_amount,
        SUM(a2.actual_weight) AS sum_weight
    FROM supplier_targets t2

    OUTER APPLY (
        SELECT 
            SUM(r.Quantity) AS actual_qty,
            SUM(r.Total_Cost) AS actual_amount,
            SUM(ISNULL(r.Gross_Weight,0)) AS actual_weight
        FROM RE_Detail_WithCost r

        OUTER APPLY (
            SELECT
                CASE t2.category
                    WHEN 'Gypsum' THEN (SELECT BRAND_NO FROM BRAND_Gypsum WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Glass' THEN (SELECT BRAND_NO FROM BRAND_Glass WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Aluminum' THEN (SELECT BRAND_NO FROM BRAND_Aluminium WHERE BRAND_ID = t2.brand_code)
                    WHEN 'C-Line' THEN (SELECT BRAND_NO FROM BRAND_CLine WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Sealant' THEN (SELECT BRAND_NO FROM BRAND_Sealant WHERE BRAND_ID = t2.brand_code)
                    WHEN 'Accessories' THEN (SELECT BRAND_NO FROM Accessory_BRAND WHERE BRAND_ID = t2.brand_code)
                END AS brand_no
        ) b2

        WHERE r.Posting_Date >= t2.start_date
          AND r.Posting_Date < DATEADD(DAY,1,t2.end_date)
    ) a2

    WHERE 
    (
        t.parent_target_ref IS NULL
        AND t2.target_ref = t.target_ref
    )
    OR
    (
        t.parent_target_ref IS NOT NULL
        AND COALESCE(t2.parent_target_ref, t2.target_ref) = t.parent_target_ref
    )
) g

OUTER APPLY (
    SELECT SUM(target_qty) AS total_target
    FROM supplier_targets t3
    WHERE 
    (
        t.parent_target_ref IS NULL
        AND t3.target_ref = t.target_ref
    )
    OR
    (
        t.parent_target_ref IS NOT NULL
        AND COALESCE(t3.parent_target_ref, t3.target_ref) = t.parent_target_ref
    )
) tg

/* =========================
   🔥 CORE LOGIC
========================= */
OUTER APPLY (
    SELECT
        CASE
          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ชิ้น','pcs')
            THEN 
                CASE 
                    WHEN t.parent_target_ref IS NULL 
                        THEN ISNULL(a.actual_qty,0)
                    ELSE ISNULL(g.sum_qty,0)
                END

          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) = N'บาท'
            THEN 
                CASE 
                    WHEN t.parent_target_ref IS NULL 
                        THEN ISNULL(a.actual_amount,0)
                    ELSE ISNULL(g.sum_amount,0)
                END

          WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ตัน','ton')
            THEN 
                CASE 
                    WHEN t.parent_target_ref IS NULL 
                        THEN ISNULL(a.actual_weight,0) / 1000.0
                    ELSE ISNULL(g.sum_weight,0) / 1000.0
                END
        END AS actual_value,

        CASE
          WHEN 
            CASE 
                WHEN t.parent_target_ref IS NULL 
                    THEN ISNULL(t.target_qty,0)
                ELSE ISNULL(tg.total_target,0)
            END = 0 
          THEN NULL
          ELSE
            (
                CASE
                  WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ชิ้น','pcs')
                    THEN 
                        CASE 
                            WHEN t.parent_target_ref IS NULL 
                                THEN ISNULL(a.actual_qty,0)
                            ELSE ISNULL(g.sum_qty,0)
                        END

                  WHEN LOWER(LTRIM(RTRIM(t.target_unit))) = N'บาท'
                    THEN 
                        CASE 
                            WHEN t.parent_target_ref IS NULL 
                                THEN ISNULL(a.actual_amount,0)
                            ELSE ISNULL(g.sum_amount,0)
                        END

                  WHEN LOWER(LTRIM(RTRIM(t.target_unit))) IN (N'ตัน','ton')
                    THEN 
                        CASE 
                            WHEN t.parent_target_ref IS NULL 
                                THEN ISNULL(a.actual_weight,0) / 1000.0
                            ELSE ISNULL(g.sum_weight,0) / 1000.0
                        END
                END
            ) * 100.0 /
            CASE 
                WHEN t.parent_target_ref IS NULL 
                    THEN ISNULL(t.target_qty,0)
                ELSE ISNULL(tg.total_target,0)
            END
        END AS achievement_percent
) v

/* =========================
   JOIN
========================= */
LEFT JOIN BRAND_Aluminium ba
  ON ba.BRAND_NO = RIGHT('00' + t.brand_code, 2)
 AND t.category = 'Aluminum'

LEFT JOIN BRAND_Glass bg
  ON bg.BRAND_NO = RIGHT('00' + t.brand_code, 2)
 AND t.category = 'Glass'

LEFT JOIN BRAND_Gypsum gy
  ON gy.BRAND_NO = RIGHT('00' + t.brand_code, 2)
 AND t.category = 'Gypsum'

LEFT JOIN BRAND_CLine bc
  ON bc.BRAND_NO = RIGHT('00' + t.brand_code, 2)
 AND t.category = 'C-Line'

LEFT JOIN BRAND_Sealant bs
  ON bs.BRAND_NO = RIGHT('00' + t.brand_code, 2)
 AND t.category = 'Sealant'

LEFT JOIN Accessory_BRAND accb
  ON accb.BRAND_NO = RIGHT('000' + t.brand_code, 3)
 AND t.category = 'Accessories'

LEFT JOIN Accessory_GROUP accg
  ON accg.Group_ID = RIGHT('00' + t.product_group_code, 2)

WHERE t.supplier_code = @supplier_code
ORDER BY t.created_at DESC;`);

    res.json(result.recordset);

  } catch (err) {
    console.error("❌ Fetch Target Error:", err);
    res.status(500).json({ error: "Fetch Failed" });
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