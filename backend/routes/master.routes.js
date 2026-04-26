import express from "express";
import { getColorsByCategory } from "../controllers/master.controller.js";
import { getThicknessByCategory } from "../controllers/master.controller.js";
import { getBranches, getProvinces, getSkuByBranch, getBranchesForFilter, getCategoriesForFilter, getCategories } from "../controllers/master.controller.js";


const router = express.Router();

router.get("/colors/:category", getColorsByCategory);
router.get("/thickness/:category", getThicknessByCategory);

router.get("/branches", getBranches);

router.get("/provinces", getProvinces);

router.get("/sku-by-branch", getSkuByBranch);

// New lightweight endpoints for filter dropdowns
router.get("/branches-for-filter", getBranchesForFilter);
router.get("/categories-for-filter", getCategoriesForFilter);
router.get("/categories", getCategories);

export default router;