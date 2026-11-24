import { Router } from "express";
import {
    submitPayment,
    getOrderPayments,
    listPayments,
    confirmPayment,
    rejectPayment,
    completeOrder,
} from "../controllers/payment.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { uploadSingle } from "../middlewares/upload.middleware";

const router = Router();

router.post(
    "/orders/:id/payment",
    authenticate,
    authorize("customer"),
    uploadSingle("proof"),
    submitPayment
);
router.get("/orders/:id/payment", authenticate, getOrderPayments);
router.patch(
    "/orders/:id/payment/confirm",
    authenticate,
    authorize("kasir", "admin"),
    confirmPayment
);
router.patch(
    "/orders/:id/payment/reject",
    authenticate,
    authorize("kasir", "admin"),
    rejectPayment
);
router.patch(
    "/orders/:id/complete",
    authenticate,
    authorize("kasir", "admin"),
    completeOrder
);
router.get("/payments", authenticate, authorize("kasir", "admin"), listPayments);

export default router;