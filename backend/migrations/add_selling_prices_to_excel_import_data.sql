-- =====================================================
-- เพิ่มคอลัมน์ราคาขาย W1, W2, R1, R2
-- ใน excel_import_data
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'selling_price_w1' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [selling_price_w1] DECIMAL(18,2);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'selling_price_w2' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [selling_price_w2] DECIMAL(18,2);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'selling_price_r1' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [selling_price_r1] DECIMAL(18,2);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'selling_price_r2' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [selling_price_r2] DECIMAL(18,2);

PRINT 'เพิ่มคอลัมน์ราคาขายสำเร็จ';

-- ตรวจสอบโครงสร้างตาราง
SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'excel_import_data'
ORDER BY ORDINAL_POSITION;
