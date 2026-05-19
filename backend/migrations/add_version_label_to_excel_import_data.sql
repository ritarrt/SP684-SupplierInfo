-- =====================================================
-- เพิ่มคอลัมน์ version_label ใน excel_import_data
-- เพื่อให้รู้ว่าแต่ละ row มาจาก import รอบไหน
-- โดยไม่ต้อง JOIN กับ excel_import_logs
-- =====================================================

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE name = 'version_label'
    AND object_id = OBJECT_ID('excel_import_data')
)
BEGIN
    ALTER TABLE [dbo].[excel_import_data]
    ADD [version_label] NVARCHAR(30) NULL;
    PRINT '✅ เพิ่ม column version_label ใน excel_import_data สำเร็จ';
END
ELSE
BEGIN
    PRINT '⚠️ Column version_label มีอยู่แล้ว';
END

-- Backfill + ตรวจสอบ ต้องอยู่ใน EXEC แยก batch
-- เพื่อให้ SQL Server รู้จัก column ใหม่ก่อน compile
EXEC('
    UPDATE d
    SET d.version_label = l.version_label
    FROM excel_import_data d
    INNER JOIN excel_import_logs l ON l.id = d.import_log_id
    WHERE d.version_label IS NULL
      AND l.version_label IS NOT NULL;

    PRINT ''✅ Backfill version_label เสร็จสิ้น'';

    SELECT
        product_type,
        version_label,
        COUNT(*) AS row_count
    FROM excel_import_data
    GROUP BY product_type, version_label
    ORDER BY product_type, version_label;
');
