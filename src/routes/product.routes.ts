import { Router } from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller";
import { addStock } from "../controllers/stock.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { uploadSingle } from "../middlewares/upload.middleware";

const router = Router();

// semua endpoint butuh login
router.use(authenticate);

router.get("/", getProducts);
router.get("/:id", getProductById);

// hanya kasir dan admin
router.post("/", authorize("kasir", "admin"), uploadSingle("image"), createProduct);
router.put("/:id", authorize("kasir", "admin"), uploadSingle("image"), updateProduct);
router.patch("/:id/stock", authorize("kasir", "admin"), addStock);
router.delete("/:id", authorize("kasir", "admin"), deleteProduct);

export default router;