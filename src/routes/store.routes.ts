import { Router } from "express";
import { getStoreInfo } from "../controllers/store.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", authenticate, getStoreInfo);

export default router;