-- =====================================================
-- สร้างตาราง excel_import_data
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'excel_import_data')
BEGIN
    CREATE TABLE [dbo].[excel_import_data] (
        [id] INT PRIMARY KEY IDENTITY(1,1),
        [branch] NVARCHAR(100),
        [product_type] NVARCHAR(100),
        [sku] NVARCHAR(50),
        [product_name] NVARCHAR(255),
        [brand] NVARCHAR(100),
        [unit] NVARCHAR(50),
        [base_price] DECIMAL(18,2),
        [discount_price_1] DECIMAL(18,2),
        [discount_price_2] DECIMAL(18,2),
        [discount_price_3] DECIMAL(18,2),
        [project_no] NVARCHAR(50),
        [project_discount_1] DECIMAL(18,2),
        [project_discount_2] DECIMAL(18,2),
        [project_price] DECIMAL(18,2),
        [carton_price] DECIMAL(18,2),
        [shipping_cost] DECIMAL(18,2),
        [free_item] NVARCHAR(255),
        [created_at] DATETIME DEFAULT GETDATE(),
        [updated_at] DATETIME DEFAULT GETDATE()
    );
    PRINT 'ตาราง excel_import_data สร้างสำเร็จ';
END
ELSE
BEGIN
    PRINT 'ตาราง excel_import_data มีอยู่แล้ว';
END

-- =====================================================
-- สร้างตาราง excel_import_logs
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'excel_import_logs')
BEGIN
    CREATE TABLE [dbo].[excel_import_logs] (
        [id] INT PRIMARY KEY IDENTITY(1,1),
        [sheet_name] NVARCHAR(255),
        [row_count] INT,
        [column_count] INT,
        [imported_at] DATETIME DEFAULT GETDATE()
    );
    PRINT 'ตาราง excel_import_logs สร้างสำเร็จ';
END
ELSE
BEGIN
    PRINT 'ตาราง excel_import_logs มีอยู่แล้ว';
END

-- =====================================================
-- สร้าง Index เพื่อเพิ่มประสิทธิภาพ
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_sku')
    CREATE INDEX [IX_excel_import_data_sku] ON [dbo].[excel_import_data]([sku]);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_branch')
    CREATE INDEX [IX_excel_import_data_branch] ON [dbo].[excel_import_data]([branch]);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_product_type')
    CREATE INDEX [IX_excel_import_data_product_type] ON [dbo].[excel_import_data]([product_type]);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_created_at')
    CREATE INDEX [IX_excel_import_data_created_at] ON [dbo].[excel_import_data]([created_at]);

-- =====================================================
-- ตรวจสอบตาราง
-- =====================================================
SELECT 'excel_import_data' AS TableName, COUNT(*) AS [RowCount] FROM [dbo].[excel_import_data]
UNION ALL
SELECT 'excel_import_logs' AS TableName, COUNT(*) AS [RowCount] FROM [dbo].[excel_import_logs];
