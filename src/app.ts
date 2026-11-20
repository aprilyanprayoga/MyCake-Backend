import express from "express";
import cors from "cors";
import { sql } from "drizzle-orm";
import { db } from "./db/db";

const app = express();

app.use(cors());
app.use(express.json());

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

export default app;
