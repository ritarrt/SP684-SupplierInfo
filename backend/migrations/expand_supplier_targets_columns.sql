-- Migration: ขยาย column ที่เก็บค่า comma-separated หลายรายการใน supplier_targets
-- เหตุผล: เมื่อเลือกหลาย brand/group/sub/color/thickness ค่าที่ส่งอาจยาวเกิน NVARCHAR เดิม

ALTER TABLE supplier_targets
  ALTER COLUMN brand_code       NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN brand            NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN product_group_code NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN product_group    NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN sub_group_code   NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN sub_group        NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN color            NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN thickness        NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN region           NVARCHAR(500) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN province         NVARCHAR(2000) NULL;

ALTER TABLE supplier_targets
  ALTER COLUMN branch           NVARCHAR(2000) NULL;
