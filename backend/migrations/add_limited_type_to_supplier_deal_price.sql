-- ============================================================
-- เพิ่ม columns limited_type ที่ขาดหายไปในตาราง supplier_deal_price
-- ============================================================

-- ตรวจสอบว่า column limited_type มีอยู่แล้วหรือไม่
IF NOT EXISTS (
  SELECT * 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_deal_price' 
  AND COLUMN_NAME = 'limited_type'
)
BEGIN
  -- เพิ่ม column limited_type
  ALTER TABLE supplier_deal_price
  ADD limited_type NVARCHAR(50) NULL;
  
  PRINT '✅ เพิ่ม column limited_type สำเร็จ';
END
ELSE
BEGIN
  PRINT '⚠️ Column limited_type มีอยู่แล้ว';
END
