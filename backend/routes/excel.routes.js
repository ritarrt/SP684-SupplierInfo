import express from "express";
import {
  importExcelData,
  getImportLogs,
  getImportData,
  getImportDataByLog,
  updateImportData,
  previewExcelData,
  debugAccExcel,
  getDraftData,
  updateDraftRow,
  publishDraft,
  discardDraft,
} from "../controllers/excel.controller.js";

const router = express.Router();

router.post("/import",                    importExcelData);
router.post("/preview",                   previewExcelData);
router.post("/debug-acc",                 debugAccExcel);
router.get("/import-logs",                getImportLogs);
router.get("/data",                       getImportData);
router.get("/history/:logId",             getImportDataByLog);
router.put("/data/:id",                   updateImportData);

// Draft workflow
router.get("/draft/:logId",               getDraftData);
router.put("/draft/:logId/rows/:rowId",   updateDraftRow);
router.post("/draft/:logId/publish",      publishDraft);
router.delete("/draft/:logId",            discardDraft);

export default router;
