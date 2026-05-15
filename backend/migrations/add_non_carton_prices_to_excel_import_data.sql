-- เพิ่ม columns ราคาไม่ลงลัง (non-carton) สำหรับ Accessories
-- ราคาลงลัง  → selling_price_w1/w2/r1/r2 (เดิม)
-- ราคาไม่ลงลัง → non_carton_w1/w2/r1/r2 (ใหม่)

ALTER TABLE excel_import_data
  ADD [non_carton_w1] DECIMAL(18,2) NULL,
      [non_carton_w2] DECIMAL(18,2) NULL,
      [non_carton_r1] DECIMAL(18,2) NULL,
      [non_carton_r2] DECIMAL(18,2) NULL;
