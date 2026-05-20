-- =====================================================
-- เพิ่มคอลัมน์ non_carton_sdm ใน excel_import_data
-- สำหรับเก็บราคา SDM ของสินค้าประเภท Accessories ไม่ลงลัง
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'non_carton_sdm' AND object_id = OBJECT_ID('excel_import_data'))
BEGIN
    ALTER TABLE [dbo].[excel_import_data] ADD [non_carton_sdm] DECIMAL(18,2) NULL;
    PRINT '✅ เพิ่มคอลัมน์ non_carton_sdm สำเร็จ';
END
ELSE
BEGIN
    PRINT '⚠️ คอลัมน์ non_carton_sdm มีอยู่แล้ว';
END

-- ตรวจสอบ
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'excel_import_data'
  AND COLUMN_NAME LIKE '%carton%' OR COLUMN_NAME LIKE '%sdm%'
ORDER BY ORDINAL_POSITION;
