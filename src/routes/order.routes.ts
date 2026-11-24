import { Router } from "express";
import {
    createOrder,
    getMyOrders,
    getAllOrders,
    getOrderById,
    cancelOrder,
} from "../controllers/order.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.post("/", authorize("customer"), createOrder);
router.get("/my", authorize("customer"), getMyOrders); // harus di atas "/:id"
router.get("/", authorize("kasir", "admin"), getAllOrders);
router.get("/:id", getOrderById);
router.patch("/:id/cancel", authorize("customer"), cancelOrder);

export default router;