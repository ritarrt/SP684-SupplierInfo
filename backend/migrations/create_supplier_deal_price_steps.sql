-- ============================================================
-- สร้างตาราง supplier_deal_price_steps สำหรับเก็บข้อมูล stepped pricing
-- ============================================================

-- สร้างตาราง supplier_deal_price_steps
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'supplier_deal_price_steps')
BEGIN
  CREATE TABLE supplier_deal_price_steps (
    step_id INT IDENTITY(1,1) PRIMARY KEY,
    deal_id INT NOT NULL,
    step_number INT NOT NULL,
    from_qty DECIMAL(18, 2) NOT NULL,
    to_qty DECIMAL(18, 2) NOT NULL,
    price_value DECIMAL(18, 2) NOT NULL,
    price_unit NVARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (deal_id) REFERENCES supplier_deal_price(deal_id) ON DELETE CASCADE
  );
  
  PRINT '✅ สร้างตาราง supplier_deal_price_steps สำเร็จ';
END
ELSE
BEGIN
  PRINT '⚠️ ตาราง supplier_deal_price_steps มีอยู่แล้ว';
END
