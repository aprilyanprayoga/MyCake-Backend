import { Router } from "express";
import { getTodayRecap, getRecap } from "../controllers/recap.controller";
import {
    deleteOrder,
    getTrash,
    restoreOrder,
    restoreProduct,
} from "../controllers/trash.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";

const router = Router();

router.get("/recap/today", authenticate, authorize("kasir", "admin"), getTodayRecap);
router.get("/recap", authenticate, authorize("admin"), getRecap);

router.delete("/orders/:id", authenticate, authorize("kasir", "admin"), deleteOrder);

router.get("/trash", authenticate, authorize("admin"), getTrash);
router.patch("/trash/orders/:id/restore", authenticate, authorize("admin"), restoreOrder);
router.patch("/trash/products/:id/restore", authenticate, authorize("admin"), restoreProduct);

export default router;