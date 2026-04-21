-- Add require_pallet and supplier_delivery columns to supplier_deal_price (safe re-run)

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'require_pallet'
)
BEGIN
  ALTER TABLE supplier_deal_price ADD require_pallet BIT NOT NULL DEFAULT 1;
  PRINT N'✅ เพิ่ม column require_pallet สำเร็จ';
END
ELSE
  PRINT N'⚠️ Column require_pallet มีอยู่แล้ว';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'supplier_delivery'
)
BEGIN
  ALTER TABLE supplier_deal_price ADD supplier_delivery BIT NOT NULL DEFAULT 1;
  PRINT N'✅ เพิ่ม column supplier_delivery สำเร็จ';
END
ELSE
  PRINT N'⚠️ Column supplier_delivery มีอยู่แล้ว';
