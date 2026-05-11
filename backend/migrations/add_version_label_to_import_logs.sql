-- =====================================================
-- เพิ่มคอลัมน์ version_label ใน excel_import_logs
-- =====================================================
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE name = 'version_label' 
    AND object_id = OBJECT_ID('excel_import_logs')
)
BEGIN
    ALTER TABLE [dbo].[excel_import_logs] 
    ADD [version_label] NVARCHAR(30) NULL;
    PRINT '✅ เพิ่ม column version_label สำเร็จ';
END
ELSE
BEGIN
    PRINT '⚠️ Column version_label มีอยู่แล้ว';
END

-- ตรวจสอบ
SELECT TOP 5 id, product_type, version_label, status, imported_at 
FROM excel_import_logs 
ORDER BY imported_at DESC;
