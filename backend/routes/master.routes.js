import express from "express";
import { getColorsByCategory } from "../controllers/master.controller.js";
import { getThicknessByCategory } from "../controllers/master.controller.js";
import { getBranches, getProvinces  } from "../controllers/master.controller.js";


const router = express.Router();

router.get("/colors/:category", getColorsByCategory);
router.get("/thickness/:category", getThicknessByCategory);

router.get("/branches", getBranches);

router.get("/provinces", getProvinces);

export default router;