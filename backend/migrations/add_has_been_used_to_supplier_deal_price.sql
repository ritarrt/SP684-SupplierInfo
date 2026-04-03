-- Add has_been_used column to supplier_deal_price table
-- This flag tracks if a deal has ever been in USE status
-- Once a deal has been used, it cannot be opened again even if cancelled

ALTER TABLE supplier_deal_price
ADD has_been_used BIT NOT NULL DEFAULT 0;

-- Update existing records that are currently in USE status
UPDATE supplier_deal_price
SET has_been_used = 1
WHERE status = 'USE';
