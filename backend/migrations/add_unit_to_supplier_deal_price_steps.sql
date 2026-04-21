-- ============================================================
-- เพิ่ม column 'unit' ในตาราง supplier_deal_price_steps
-- ============================================================

-- ตรวจสอบว่า column มีอยู่แล้วหรือไม่
IF NOT EXISTS (
  SELECT * 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_deal_price_steps' 
  AND COLUMN_NAME = 'unit'
)
BEGIN
  -- เพิ่ม column unit
  ALTER TABLE supplier_deal_price_steps
  ADD unit NVARCHAR(50) NULL;
  
  PRINT '✅ เพิ่ม column unit สำเร็จ';
END
ELSE
BEGIN
  PRINT '⚠️ Column unit มีอยู่แล้ว';
END
