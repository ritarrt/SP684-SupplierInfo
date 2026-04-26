-- =====================================================
-- เพิ่มคอลัมน์ใน excel_import_logs
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'file_name' AND object_id = OBJECT_ID('excel_import_logs'))
    ALTER TABLE [dbo].[excel_import_logs] ADD [file_name] NVARCHAR(255);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'product_type' AND object_id = OBJECT_ID('excel_import_logs'))
    ALTER TABLE [dbo].[excel_import_logs] ADD [product_type] NVARCHAR(100);

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'imported_rows' AND object_id = OBJECT_ID('excel_import_logs'))
    ALTER TABLE [dbo].[excel_import_logs] ADD [imported_rows] INT DEFAULT 0;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'status' AND object_id = OBJECT_ID('excel_import_logs'))
    ALTER TABLE [dbo].[excel_import_logs] ADD [status] NVARCHAR(50) DEFAULT 'success';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE name = 'error_message' AND object_id = OBJECT_ID('excel_import_logs'))
    ALTER TABLE [dbo].[excel_import_logs] ADD [error_message] NVARCHAR(MAX);

PRINT 'เพิ่มคอลัมน์ใน excel_import_logs สำเร็จ';

-- ตรวจสอบ
SELECT * FROM excel_import_logs ORDER BY imported_at DESC;
