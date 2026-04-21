import express from "express";
import multer from "multer";

/**
 * ==============================
 * CONTROLLERS
 * ==============================
 */

// ⭐ Project Prices (MUST be before parameterized routes)
import { getProjectPrices } from "../controllers/projectPrice.controller.js";

// ⭐ Supplier Contacts
import {
  createSupplierContact,
  getSupplierContacts,
  cancelSupplierContact,
  reactivateSupplierContact
} from "../controllers/supplierContact.controller.js";

// Supplier (Basic Info)
import {
  getSuppliers,
  getSupplierByNo,
  updateSupplierByNo,
} from "../controllers/supplier.controller.js";

// Brand / Group
import { getBrandsByCategories } from "../controllers/brand.controller.js";
import { getGroupsByCategories } from "../controllers/group.controller.js";
import { getSubgroupsByCategory } from "../controllers/subgroup.controller.js";

// Product Coverage (Current)
import {
  getSupplierProductCoverage,
  saveSupplierProductCoverage,
  searchSku,
  getSupplierCoverageMaster
} from "../controllers/supplierProductCoverage.controller.js";

// Product Coverage History
import {
  getProductCoverageHistory,
  getProductCoverageHistoryById,
  createProductCoverageHistory,
} from "../controllers/supplierProductCoverageHistory.controller.js";

// ⭐ Special Terms
import {
  getSupplierSpecialTerms,
  saveSupplierSpecialTerms,
  createSupplierSpecialTermsHistory,
  getSupplierSpecialTermsHistory,
} from "../controllers/supplierSpecialTerms.controller.js";

// ⭐ Supplier Documents (Company Documents)
import {
  uploadSupplierDocument,
  getSupplierDocuments,
  softDeleteSupplierDocument
} from "../controllers/supplierDocument.controller.js";

// ⭐ Supplier MOQ
import {
  getSupplierMoq,
  saveSupplierMoq,
  toggleSupplierMoqStatus
} from "../controllers/supplierMoq.controller.js";



const router = express.Router();

// ⭐ Supplier Deal Price
import {
  getSupplierDeals,
  saveSupplierDeal,
  updateSupplierDeal,
  toggleSupplierDealStatus,
  updateSupplierDealStatus
} from "../controllers/supplierDeal.controller.js";


/**
 * ==============================
 * MULTER (FILE UPLOAD)
 * ==============================
 */
const storage = multer.diskStorage({
  destination: "uploads/supplier_docs/",
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = file.originalname.split(".").pop();
    cb(null, file.fieldname + "-" + uniqueSuffix + "." + ext);
  },
});

const upload = multer({ storage });

/**
 * ==============================
 * BRAND / GROUP
 * ==============================
 */
router.get("/brands", getBrandsByCategories);
router.get("/groups", getGroupsByCategories);
router.get("/subgroups", getSubgroupsByCategory);
router.get("/sku/search", searchSku);

/**
 * ==============================
 * ⭐ PROJECT PRICES (FOR PROJECT NO. IN DEALS)
 * ==============================
 */
router.get(
  "/project-prices",
  getProjectPrices
);

/**
 * ==============================
 * SUPPLIER BY NO
 * ==============================
 */
router.get("/:supplierNo/coverage", getSupplierCoverageMaster);

/**
 * ==============================
 * PRODUCT COVERAGE (CURRENT)
 * ==============================
 */
router.get(
  "/:supplierNo/product-coverage",
  getSupplierProductCoverage
);

router.post(
  "/:supplierNo/product-coverage",
  saveSupplierProductCoverage
);

/**
 * ==============================
 * PRODUCT COVERAGE HISTORY
 * ==============================
 */
router.post(
  "/:supplierNo/product-coverage/history",
  createProductCoverageHistory
);

router.get(
  "/:supplierNo/product-coverage/history",
  getProductCoverageHistory
);

router.get(
  "/:supplierNo/product-coverage/history/:id",
  getProductCoverageHistoryById
);

/**
 * ==============================
 * ⭐ SUPPLIER SPECIAL TERMS
 * ==============================
 */
router.get(
  "/:supplierNo/special-terms",
  getSupplierSpecialTerms
);

router.post(
  "/:supplierNo/special-terms",
  saveSupplierSpecialTerms
);

/**
 * ==============================
 * ⭐ SUPPLIER SPECIAL TERMS HISTORY
 * ==============================
 */
router.get(
  "/:supplierNo/special-terms/history",
  getSupplierSpecialTermsHistory
);

router.post(
  "/:supplierNo/special-terms/history",
  createSupplierSpecialTermsHistory
);


/**
 * ==============================
 * ⭐ SUPPLIER MOQ (ORDER / DELIVERY CONDITION)
 * ==============================
 */

// Get MOQ list by supplier
router.get(
  "/:supplierNo/moq",
  getSupplierMoq
);

// Create / Update MOQ
router.post(
  "/:supplierNo/moq",
  saveSupplierMoq
);

// Cancel MOQ
router.put(
  "/:supplierNo/moq/:id/toggle",
  toggleSupplierMoqStatus
);

/**
 * ==============================
 * ⭐ SUPPLIER DEAL PRICE
 * ==============================
 */

// Get deal list
router.get(
  "/:supplierNo/deals",
  getSupplierDeals
);

// Create deal
router.post(
  "/:supplierNo/deals",
  saveSupplierDeal
);

// Update deal
router.put(
  "/:supplierNo/deals/:id",
  updateSupplierDeal
);

// Toggle deal status
router.put(
  "/:supplierNo/deals/:id/toggle",
  toggleSupplierDealStatus
);

// Update deal status
router.put(
  "/:supplierNo/deals/:id/status",
  updateSupplierDealStatus
);

// Import the simple deal controller
import {
  getSupplierDealsSimple,
  saveSupplierDealSimple,
  deleteSupplierDealSimple
} from "../controllers/supplierDealSimple.controller.js";

// Get deal list (simple - for Excel import)
router.get(
  "/:supplierNo/deals-simple",
  getSupplierDealsSimple
);

// Create deal (simple - for Excel import)
router.post(
  "/:supplierNo/deals-simple",
  saveSupplierDealSimple
);

// Delete deal (simple)
router.delete(
  "/:supplierNo/deals-simple/:id",
  deleteSupplierDealSimple
);

/**
 * ==============================
 * ⭐ PROJECT PRICES (FOR PROJECT NO. IN DEALS)
 * ==============================
 */
router.get(
  "/project-prices",
  getProjectPrices
);




/**
 * ==============================
 * ⭐ SUPPLIER DOCUMENTS (COMPANY LEVEL)
 * ==============================
 */

// Upload document
router.post(
  "/:supplierNo/documents",
  upload.single("file"),
  uploadSupplierDocument
);

// Get active documents
router.get(
  "/:supplierNo/documents",
  getSupplierDocuments
);

// Soft delete document (hide from UI)
router.patch(
  "/documents/:id/delete",
  softDeleteSupplierDocument
);

/**
 * ==============================
 * ⭐ SUPPLIER CONTACTS
 * ==============================
 */
router.post(
  "/:supplierNo/contacts",
  createSupplierContact
);

router.get(
  "/:supplierNo/contacts",
  getSupplierContacts
);

router.patch(
  "/contacts/:id/cancel",
  cancelSupplierContact
);

router.patch(
  "/contacts/:id/reactivate",
  reactivateSupplierContact
);

/**
 * ==============================
 * SUPPLIER (BASIC INFO)
 * ==============================
 */
router.get("/", getSuppliers);
router.get("/:supplierNo", getSupplierByNo);
router.put("/:supplierNo", updateSupplierByNo);

export default router;
