-- =====================================================
-- สร้างตาราง deal_import_logs และ deal_import_log_items
-- สำหรับบันทึกประวัติการ import ดีลราคาจาก Excel
-- =====================================================

-- ตาราง deal_import_logs: เก็บ summary ของแต่ละครั้งที่ import
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'deal_import_logs')
BEGIN
    CREATE TABLE [dbo].[deal_import_logs] (
        [log_id]      INT           PRIMARY KEY IDENTITY(1,1),
        [supplier_no] NVARCHAR(50)  NOT NULL,
        [total_rows]  INT           DEFAULT 0,
        [inserted]    INT           DEFAULT 0,
        [updated]     INT           DEFAULT 0,
        [skipped]     INT           DEFAULT 0,
        [errors]      INT           DEFAULT 0,
        [note]        NVARCHAR(500) NULL,          -- ชื่อไฟล์ที่ import
        [imported_at] DATETIME      DEFAULT GETDATE()
    );
    CREATE INDEX IX_deal_import_logs_supplier ON [dbo].[deal_import_logs] (supplier_no);
    PRINT 'ตาราง deal_import_logs สร้างสำเร็จ';
END
ELSE
BEGIN
    PRINT 'ตาราง deal_import_logs มีอยู่แล้ว';
END

-- ตาราง deal_import_log_items: เก็บรายละเอียดแต่ละแถวที่ import
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'deal_import_log_items')
BEGIN
    CREATE TABLE [dbo].[deal_import_log_items] (
        [item_id]   INT           PRIMARY KEY IDENTITY(1,1),
        [log_id]    INT           NOT NULL,
        [deal_id]   INT           NULL,           -- deal_id ที่ถูก insert/update (NULL ถ้า error)
        [sku]       NVARCHAR(100) NULL,
        [branch]    NVARCHAR(50)  NULL,
        [deal_name] NVARCHAR(255) NULL,
        [action]    NVARCHAR(50)  NULL,           -- 'inserted', 'updated', 'skipped', 'error'
        [error_msg] NVARCHAR(MAX) NULL,
        CONSTRAINT FK_deal_import_log_items_log
            FOREIGN KEY (log_id) REFERENCES [dbo].[deal_import_logs](log_id)
            ON DELETE CASCADE
    );
    CREATE INDEX IX_deal_import_log_items_log ON [dbo].[deal_import_log_items] (log_id);
    PRINT 'ตาราง deal_import_log_items สร้างสำเร็จ';
END
ELSE
BEGIN
    PRINT 'ตาราง deal_import_log_items มีอยู่แล้ว';
END

-- ตรวจสอบผลลัพธ์
SELECT 'deal_import_logs'      AS TableName, COUNT(*) AS [RowCount] FROM [dbo].[deal_import_logs]
UNION ALL
SELECT 'deal_import_log_items' AS TableName, COUNT(*) AS [RowCount] FROM [dbo].[deal_import_log_items];
