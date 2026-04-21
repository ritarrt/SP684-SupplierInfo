-- Migrate: Expand region and province columns in supplier_contacts
-- Run this SQL in your SQL Server database

ALTER TABLE supplier_contacts
ALTER COLUMN region NVARCHAR(500);

ALTER TABLE supplier_contacts
ALTER COLUMN province NVARCHAR(500);
