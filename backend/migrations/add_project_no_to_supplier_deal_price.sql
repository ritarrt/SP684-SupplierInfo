-- Add project_no column to supplier_deal_price table
-- This migration adds a project_no field to store project numbers for deals

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_deal_price' AND COLUMN_NAME = 'project_no'
)
BEGIN
  ALTER TABLE supplier_deal_price
  ADD project_no NVARCHAR(100) NULL;
  
  PRINT '✅ Added project_no column to supplier_deal_price table';
END
ELSE
BEGIN
  PRINT '⚠️ project_no column already exists in supplier_deal_price table';
END
