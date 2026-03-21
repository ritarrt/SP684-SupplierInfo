import express from "express";
import {
  createTarget,
  getTargetsBySupplier,
  cancelTarget,
  getTargetMasterData,
  getThicknessByCategory,
  getBrandsBySupplier
} from "../controllers/target.controller.js";

const router = express.Router();

router.get("/master-data", getTargetMasterData);
router.get("/thickness/:category", getThicknessByCategory);
router.get("/brands/:supplierCode", getBrandsBySupplier);

// สร้างใหม่ → OPEN
router.post("/", createTarget);

// ดึงตาม supplier
router.get("/:supplierCode", getTargetsBySupplier);

// ยกเลิก → CANCELLED
router.put("/cancel/:id", cancelTarget);


export default router;