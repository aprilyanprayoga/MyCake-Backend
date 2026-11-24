import express from "express";
import cors from "cors";
import { sql } from "drizzle-orm";
import { db } from "./db/db";
import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.routes";
import orderRoutes from "./routes/order.routes";
import paymentRoutes from "./routes/payment.routes";
import recapRoutes from "./routes/recap.routes";
import { notFound, errorHandler } from "./middlewares/error.middleware";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api", paymentRoutes);
app.use("/api", recapRoutes);

app.get("/api/health", async (_req, res) => {
    try {
        await db.execute(sql`select 1`);
        res.status(200).json({
            success: true,
            message: "Server dan database berjalan",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Database tidak terhubung",
        });
    }
});
app.use(notFound);
app.use(errorHandler);

export default app;