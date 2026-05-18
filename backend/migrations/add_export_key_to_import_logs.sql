-- เพิ่ม column export_key สำหรับเก็บ Key no. ของการ export ราคาขาย
-- format: {prefix}{4 หลัก} เช่น Y0001, G0002, E0003
-- และเก็บข้อมูล preview summary ณ เวลาที่ export

ALTER TABLE excel_import_logs
  ADD [export_key]          NVARCHAR(10)  NULL,
      [export_total_skus]   INT           NULL,
      [export_new_skus]     INT           NULL,
      [export_price_changes] INT          NULL,
      [exported_at]         DATETIME      NULL;
