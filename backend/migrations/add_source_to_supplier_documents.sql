-- Add source column to supplier_documents table
-- This column stores the source of the document upload (basic or document)

IF NOT EXISTS (
  SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'supplier_documents' 
  AND COLUMN_NAME = 'source'
)
BEGIN
  ALTER TABLE supplier_documents
  ADD source NVARCHAR(50) DEFAULT 'basic';
END
