-- ============================================================
-- เพิ่ม column 'province' ในตาราง supplier_deal_price
-- ============================================================

-- ตรวจสอบว่า column มีอยู่แล้วหรือไม่
IF NOT EXISTS (
  SELECT * 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_deal_price' 
  AND COLUMN_NAME = 'province'
)
BEGIN
  -- เพิ่ม column province
  ALTER TABLE supplier_deal_price
  ADD province NVARCHAR(255) NULL;
  
  PRINT '✅ เพิ่ม column province สำเร็จ';
END
ELSE
BEGIN
  PRINT '⚠️ Column province มีอยู่แล้ว';
END
