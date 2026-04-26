import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_DATABASE,
    authentication: {
        type: 'default',
        options: {
            userName: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        }
    },
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
        enableKeepAlive: true
    }
};

async function createTables() {
    try {
        console.log('🔄 กำลังเชื่อมต่อฐานข้อมูล...');
        const pool = new sql.ConnectionPool(config);
        await pool.connect();
        console.log('✅ เชื่อมต่อสำเร็จ');

        // สร้างตาราง excel_import_data
        console.log('\n📋 กำลังสร้างตาราง excel_import_data...');
        await pool.request().query(`
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
        `);
        console.log('✅ ตาราง excel_import_data สร้างสำเร็จ');

        // สร้างตาราง excel_import_logs
        console.log('\n📋 กำลังสร้างตาราง excel_import_logs...');
        await pool.request().query(`
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
        `);
        console.log('✅ ตาราง excel_import_logs สร้างสำเร็จ');

        // สร้าง Index
        console.log('\n📊 กำลังสร้าง Index...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_sku')
                CREATE INDEX [IX_excel_import_data_sku] ON [dbo].[excel_import_data]([sku]);
            
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_branch')
                CREATE INDEX [IX_excel_import_data_branch] ON [dbo].[excel_import_data]([branch]);
            
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_product_type')
                CREATE INDEX [IX_excel_import_data_product_type] ON [dbo].[excel_import_data]([product_type]);
            
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_excel_import_data_created_at')
                CREATE INDEX [IX_excel_import_data_created_at] ON [dbo].[excel_import_data]([created_at]);
        `);
        console.log('✅ Index สร้างสำเร็จ');

        // ตรวจสอบตาราง
        console.log('\n📊 ตรวจสอบโครงสร้างตาราง...');
        const result = await pool.request().query(`
            SELECT 
                TABLE_NAME,
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME IN ('excel_import_data', 'excel_import_logs')
            ORDER BY TABLE_NAME, ORDINAL_POSITION
        `);

        console.log('\n📋 โครงสร้างตาราง:');
        console.log('═'.repeat(80));
        result.recordset.forEach(col => {
            console.log(`${col.TABLE_NAME}.${col.COLUMN_NAME}: ${col.DATA_TYPE} ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
        });

        await pool.close();
        console.log('\n✅ สร้างตาราง SQL Server สำเร็จ!');
        process.exit(0);
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error.message);
        process.exit(1);
    }
}

createTables();
