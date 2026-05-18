-- เพิ่ม columns สำหรับเก็บข้อมูล preview summary ตอน publish
ALTER TABLE excel_import_logs
  ADD [preview_total_skus]    INT           NULL,
      [preview_new_skus]      INT           NULL,
      [preview_price_changes] INT           NULL;
