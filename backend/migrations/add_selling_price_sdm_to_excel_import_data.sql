-- =====================================================
-- เพิ่มคอลัมน์ selling_price_sdm ใน excel_import_data
-- สำหรับเก็บราคา SDM ของสินค้าประเภท Accessories
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'selling_price_sdm' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [selling_price_sdm] DECIMAL(18,2);

PRINT 'เพิ่มคอลัมน์ selling_price_sdm สำเร็จ';

-- ตรวจสอบโครงสร้างตาราง
SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'excel_import_data'
ORDER BY ORDINAL_POSITION;
