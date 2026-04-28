-- =====================================================
-- เพิ่มคอลัมน์ discount_pct_3 สำหรับ discount 3 ชั้น
-- (discount_pct_1, discount_pct_2 เพิ่มไปแล้วใน add_discount_to_excel_import_data.sql)
-- =====================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'discount_pct_3' AND object_id = OBJECT_ID('excel_import_data'))
    ALTER TABLE [dbo].[excel_import_data] ADD [discount_pct_3] DECIMAL(10,6);

PRINT 'เพิ่มคอลัมน์ discount_pct_3 สำเร็จ';
