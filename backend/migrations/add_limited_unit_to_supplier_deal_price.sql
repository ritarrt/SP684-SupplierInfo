-- ============================================================
-- เพิ่ม columns ที่ขาดหายไปในตาราง supplier_deal_price
-- ============================================================

-- ตรวจสอบว่า column condition_mode มีอยู่แล้วหรือไม่
IF NOT EXISTS (
  SELECT * 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_deal_price' 
  AND COLUMN_NAME = 'condition_mode'
)
BEGIN
  -- เพิ่ม column condition_mode
  ALTER TABLE supplier_deal_price
  ADD condition_mode NVARCHAR(50) NULL;
  
  PRINT '✅ เพิ่ม column condition_mode สำเร็จ';
END
ELSE
BEGIN
  PRINT '⚠️ Column condition_mode มีอยู่แล้ว';
END

-- ตรวจสอบว่า column limited_unit มีอยู่แล้วหรือไม่
IF NOT EXISTS (
  SELECT * 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_deal_price' 
  AND COLUMN_NAME = 'limited_unit'
)
BEGIN
  -- เพิ่ม column limited_unit
  ALTER TABLE supplier_deal_price
  ADD limited_unit NVARCHAR(50) NULL;
  
  PRINT '✅ เพิ่ม column limited_unit สำเร็จ';
END
ELSE
BEGIN
  PRINT '⚠️ Column limited_unit มีอยู่แล้ว';
END

-- ตรวจสอบว่า column limited_qty มีอยู่แล้วหรือไม่
IF NOT EXISTS (
  SELECT * 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_deal_price' 
  AND COLUMN_NAME = 'limited_qty'
)
BEGIN
  -- เพิ่ม column limited_qty
  ALTER TABLE supplier_deal_price
  ADD limited_qty DECIMAL(18, 2) NULL;
  
  PRINT '✅ เพิ่ม column limited_qty สำเร็จ';
END
ELSE
BEGIN
  PRINT '⚠️ Column limited_qty มีอยู่แล้ว';
END
