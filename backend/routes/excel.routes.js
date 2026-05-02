import express from "express";
import {
  importExcelData,
  getImportLogs,
  getImportData,
  updateImportData,
  previewExcelData,
  debugAccExcel
} from "../controllers/excel.controller.js";

const router = express.Router();

router.post("/import",       importExcelData);
router.post("/preview",      previewExcelData);
router.post("/debug-acc",    debugAccExcel);   // debug: ดู raw rows ของ ACC
router.get("/import-logs",   getImportLogs);
router.get("/data",          getImportData);
router.put("/data/:id",      updateImportData);

export default router;
