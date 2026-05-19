import express from "express";
import {
  importExcelData,
  getImportLogs,
  getImportData,
  getImportDataByLog,
  updateImportData,
  previewExcelData,
  getDraftData,
  updateDraftRow,
  publishDraft,
  discardDraft,
  getPendingDraft,
  checkReadableSheets,
  recordExportKey,
  debugExcelStructure,
} from "../controllers/excel.controller.js";

const router = express.Router();

router.post("/import",                    importExcelData);
router.post("/preview",                   previewExcelData);
router.post("/check-sheets",              checkReadableSheets);
router.post("/debug-structure",           debugExcelStructure);
router.get("/import-logs",                getImportLogs);
router.get("/data",                       getImportData);
router.get("/history/:logId",             getImportDataByLog);

// Draft workflow
router.get("/draft/:logId",               getDraftData);
router.put("/draft/:logId/rows/:rowId",   updateDraftRow);
router.post("/draft/:logId/publish",      publishDraft);
router.delete("/draft/:logId",            discardDraft);
router.get("/pending-draft",              getPendingDraft);

// Export key logging
router.post("/record-export-key",         recordExportKey);

export default router;
