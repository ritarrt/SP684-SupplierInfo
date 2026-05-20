-- =====================================================
-- เพิ่มคอลัมน์ส่วนลด % ไม่ลงลัง ใน excel_import_data
-- non_carton_discount_pct = ส่วนลด % (col I ของแถวไม่ลงลัง)
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'non_carton_discount_pct' AND object_id = OBJECT_ID('excel_import_data'))
BEGIN
    ALTER TABLE [dbo].[excel_import_data] ADD [non_carton_discount_pct] DECIMAL(10,6) NULL;
    PRINT '✅ เพิ่ม non_carton_discount_pct สำเร็จ';
END
ELSE PRINT '⚠️ non_carton_discount_pct มีอยู่แล้ว';

-- ตรวจสอบ
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'excel_import_data'
  AND COLUMN_NAME LIKE 'non_carton%'
ORDER BY ORDINAL_POSITION;
