-- Add deal_ref column to supplier_deal_price table
-- Format: PD/YYMM/NNN (e.g., PD/2604/001)

ALTER TABLE supplier_deal_price
ADD deal_ref NVARCHAR(50) NULL;

-- Create index for better performance
CREATE INDEX idx_supplier_deal_price_deal_ref ON supplier_deal_price(deal_ref);
