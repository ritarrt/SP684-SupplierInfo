import express from "express";
import {
  importExcelData,
  getImportLogs,
  getImportData,
  updateImportData
} from "../controllers/excel.controller.js";

const router = express.Router();

router.post("/import",       importExcelData);
router.get("/import-logs",   getImportLogs);
router.get("/data",          getImportData);
router.put("/data/:id",      updateImportData);

export default router;
