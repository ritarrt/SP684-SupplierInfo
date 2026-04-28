-- =====================================================
-- เพิ่มคอลัมน์ discount % ใน excel_import_data
-- discount_pct_1 = % ส่วนลดแถวแรก (ว่างหรือ 0)
-- discount_pct_2 = % ส่วนลดแถวสอง (ค่าจริง เช่น 0.26)
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'discount_pct_1' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [discount_pct_1] DECIMAL(10,6);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'discount_pct_2' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [discount_pct_2] DECIMAL(10,6);

PRINT 'เพิ่มคอลัมน์ discount_pct สำเร็จ';

SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'excel_import_data'
ORDER BY ORDINAL_POSITION;
