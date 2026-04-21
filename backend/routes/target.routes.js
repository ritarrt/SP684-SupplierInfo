import express from "express";
import { sql } from "../config/db.js";
import {
  createTarget,
  getTargetsBySupplier,
  cancelTarget,
  getTargetMasterData,
  getThicknessByCategory,
  getBrandsBySupplier,
  getParentTargets,
  testREDetail,
  debugGlassTargetArea,
  debugGlassTargetAreaByRef,
  debugTargetCalculation,
  calculateSingleTarget,
  calculateSupplierTargets
} from "../controllers/target.controller.js";

const router = express.Router();

router.get("/test-re-detail", testREDetail);
router.get("/debug-glass-area/:id", debugGlassTargetArea);
router.get("/debug-glass-area-by-ref/:ref", debugGlassTargetAreaByRef);
router.get("/debug-calculation/:id", debugTargetCalculation);
router.get("/test-glass-targets", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query(`
        SELECT TOP 5 id, target_ref, target_name, category, brand_code, product_group_code, sub_group_code, 
               target_unit, target_qty, start_date, end_date, sku
        FROM supplier_targets t
        WHERE t.status = 'OPEN' AND t.category = 'Glass'
        ORDER BY t.created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get("/test-target/:supplierCode", async (req, res) => {
  try {
    const pool = await getPool();
    const { supplierCode } = req.params;
    const result = await pool.request()
      .input("supplier_code", sql.NVarChar, supplierCode)
      .query(`
        SELECT TOP 5 id, target_ref, target_name, category, brand_code, product_group_code, sub_group_code, 
               target_unit, target_qty, start_date, end_date, sku
        FROM supplier_targets t
        WHERE t.supplier_code = @supplier_code AND t.status = 'OPEN' AND t.category = 'Glass'
        ORDER BY t.created_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get("/master-data", getTargetMasterData);
router.get("/thickness/:category", getThicknessByCategory);
router.get("/brands/:supplierCode", getBrandsBySupplier);
router.get("/parents/:supplierCode", getParentTargets);

// สร้างใหม่ → OPEN
router.post("/", createTarget);

// ดึงตาม supplier
router.get("/:supplierCode", getTargetsBySupplier);

// ยกเลิก → CANCELLED
router.put("/cancel/:id", cancelTarget);

// คำนวณเป้าเดียว (return ผลลัพธ์ + cache)
router.get("/calculate/:id", calculateSingleTarget);

// คำนวณทุกเป้า OPEN ของ supplier
router.get("/calculate-supplier/:supplierCode", calculateSupplierTargets);


export default router;