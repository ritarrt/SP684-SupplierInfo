-- Debug query เพื่อตรวจสอบการคำนวนเป้า
-- แทนที่ PT/2604/074 ด้วย target_ref ที่ต้องการตรวจสอบ

DECLARE @target_ref NVARCHAR(50) = 'PT/2604/074';

SELECT 
  t.target_ref,
  t.target_name,
  t.category,
  t.brand_code,
  t.product_group_code,
  t.sub_group_code,
  t.branch,
  t.start_date,
  t.end_date,
  COUNT(r.Item_No) AS matching_rows,
  SUM(r.Quantity) AS total_qty,
  SUM(r.Total_Cost) AS total_amount
FROM supplier_targets t
LEFT JOIN RE_Detail_WithCost r ON (
  r.Posting_Date >= t.start_date
  AND r.Posting_Date < DATEADD(DAY, 1, t.end_date)
  AND (
    -- ตรวจสอบ branch
    (NULLIF(t.branch,'') IS NULL)
    OR EXISTS (
      SELECT 1 FROM STRING_SPLIT(REPLACE(t.branch,' ',''), ',') b
      WHERE LTRIM(RTRIM(b.value)) <> ''
        AND UPPER(LTRIM(RTRIM(r.Branch))) = UPPER(LTRIM(RTRIM(b.value)))
    )
  )
  AND (
    -- ตรวจสอบ category + brand + group + sub_group
    (t.category = 'Gypsum'
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
            'Y',
            RIGHT('00' + LTRIM(RTRIM(bc_s.value)), 2),
            CASE WHEN NULLIF(t.product_group_code,'') IS NULL THEN ''
                 ELSE RIGHT('00' + LTRIM(RTRIM(
                        (SELECT TOP 1 LTRIM(RTRIM(gc_s.value))
                         FROM STRING_SPLIT(REPLACE(t.product_group_code,' ',''),',') gc_s
                         WHERE LTRIM(RTRIM(gc_s.value))<>'')
                      )), 2)
            END,
            CASE WHEN sub_s.sub_val IS NULL THEN '%'
                 ELSE RIGHT('000' + sub_s.sub_val, 3) + '%'
            END
          )
      )
    )
  )
)
WHERE t.target_ref = @target_ref
GROUP BY 
  t.target_ref,
  t.target_name,
  t.category,
  t.brand_code,
  t.product_group_code,
  t.sub_group_code,
  t.branch,
  t.start_date,
  t.end_date;

-- ตรวจสอบข้อมูล branch ที่มีอยู่ใน RE_Detail_WithCost
SELECT DISTINCT 
  Branch,
  COUNT(*) AS count
FROM RE_Detail_WithCost
WHERE Posting_Date >= (SELECT start_date FROM supplier_targets WHERE target_ref = @target_ref)
  AND Posting_Date < DATEADD(DAY, 1, (SELECT end_date FROM supplier_targets WHERE target_ref = @target_ref))
GROUP BY Branch
ORDER BY Branch;

-- ตรวจสอบ SKU pattern ที่ตรงกับเป้า
SELECT TOP 100
  r.Item_No,
  r.SKU,
  r.Branch,
  r.Quantity,
  r.Posting_Date
FROM RE_Detail_WithCost r
WHERE r.Posting_Date >= (SELECT start_date FROM supplier_targets WHERE target_ref = @target_ref)
  AND r.Posting_Date < DATEADD(DAY, 1, (SELECT end_date FROM supplier_targets WHERE target_ref = @target_ref))
  AND r.SKU LIKE 'Y01%'
ORDER BY r.Posting_Date DESC;
