-- =====================================================
-- เพิ่มคอลัมน์ราคาซื้อ ไม่ลงลัง ใน excel_import_data
-- non_carton_base_price  = ราคาตั้งไม่รวม VAT (col H ของแถวไม่ลงลัง)
-- non_carton_re_ex_vat   = RE ก่อน VAT / discount_price_1 (col J ของแถวไม่ลงลัง)
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'non_carton_base_price' AND object_id = OBJECT_ID('excel_import_data'))
BEGIN
    ALTER TABLE [dbo].[excel_import_data] ADD [non_carton_base_price] DECIMAL(18,2) NULL;
    PRINT '✅ เพิ่ม non_carton_base_price สำเร็จ';
END
ELSE PRINT '⚠️ non_carton_base_price มีอยู่แล้ว';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'non_carton_re_ex_vat' AND object_id = OBJECT_ID('excel_import_data'))
BEGIN
    ALTER TABLE [dbo].[excel_import_data] ADD [non_carton_re_ex_vat] DECIMAL(18,2) NULL;
    PRINT '✅ เพิ่ม non_carton_re_ex_vat สำเร็จ';
END
ELSE PRINT '⚠️ non_carton_re_ex_vat มีอยู่แล้ว';

-- ตรวจสอบ
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'excel_import_data'
  AND COLUMN_NAME LIKE 'non_carton%'
ORDER BY ORDINAL_POSITION;
