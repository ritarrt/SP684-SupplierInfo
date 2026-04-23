-- Fix target data normalization
-- แก้ไขข้อมูลเป้าให้มีเว้นวรรคสม่ำเสมอ

-- แก้ไขเป้า PT/2604/074
UPDATE supplier_targets
SET 
  province = 'สระบุรี, นครราชสีมา, อุบลราชธานี, ขอนแก่น, อุดรธานี, สกลนคร',
  branch = '20SK, 18UD, 08NR, 09UB, 10KK',
  brand_code = '01',
  product_group_code = '01',
  sub_group_code = NULL,
  color = NULL,
  thickness = '00',
  target_type = 'รายเดือน'
WHERE target_ref = 'PT/2604/074';

-- แก้ไขเป้า PT/2604/071
UPDATE supplier_targets
SET 
  province = 'กรุงเทพมหานคร, พระนครศรีอยุธยา, ปทุมธานี, สระบุรี',
  branch = '00TR, 01TJ, 02TN, 03TS, 04TP, 05AY, 21BS, 22BP, 24TL, 25SB',
  brand_code = '01',
  product_group_code = '01',
  sub_group_code = NULL,
  color = NULL,
  thickness = '00',
  target_type = 'จำนวน'
WHERE target_ref = 'PT/2604/071';

-- Normalize all existing targets: trim spaces in comma-separated fields
UPDATE supplier_targets
SET 
  province = LTRIM(RTRIM(
    REPLACE(REPLACE(REPLACE(province, ', ', '|'), ',', ', '), '|', '')
  )),
  branch = LTRIM(RTRIM(
    REPLACE(REPLACE(REPLACE(branch, ', ', '|'), ',', ', '), '|', '')
  )),
  brand_code = LTRIM(RTRIM(
    REPLACE(REPLACE(REPLACE(brand_code, ', ', '|'), ',', ', '), '|', '')
  )),
  product_group_code = LTRIM(RTRIM(
    REPLACE(REPLACE(REPLACE(product_group_code, ', ', '|'), ',', ', '), '|', '')
  )),
  sub_group_code = LTRIM(RTRIM(
    REPLACE(REPLACE(REPLACE(sub_group_code, ', ', '|'), ',', ', '), '|', '')
  )),
  color = LTRIM(RTRIM(
    REPLACE(REPLACE(REPLACE(color, ', ', '|'), ',', ', '), '|', '')
  )),
  thickness = LTRIM(RTRIM(
    REPLACE(REPLACE(REPLACE(thickness, ', ', '|'), ',', ', '), '|', '')
  ))
WHERE province IS NOT NULL OR branch IS NOT NULL OR brand_code IS NOT NULL;
