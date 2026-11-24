import { Request, Response } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/db";
import { products } from "../db/schema";

const addStockSchema = z.object({
    add: z
        .number("add harus berupa angka")
        .int("add harus bilangan bulat")
        .min(1, "add minimal 1")
        .max(10000, "add maksimal 10000"),
});

// PATCH /api/products/:id/stock  body: { "add": 10 }
export async function addStock(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ success: false, message: "ID kue tidak valid" });
        return;
    }

    const parsed = addStockSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Validasi gagal",
            errors: parsed.error.issues.map((i) => ({
                field: i.path.join("."),
                message: i.message,
            })),
        });
        return;
    }

    try {
        // penambahan dilakukan di database dalam satu query
        const [updated] = await db
            .update(products)
            .set({ stock: sql`${products.stock} + ${parsed.data.add}` })
            .where(and(eq(products.id, id), isNull(products.deletedAt)));

        if (updated.affectedRows === 0) {
            res.status(404).json({ success: false, message: "Kue tidak ditemukan" });
            return;
        }

        const [product] = await db
            .select({ id: products.id, name: products.name, stock: products.stock })
            .from(products)
            .where(eq(products.id, id));

        res.status(200).json({
            success: true,
            message: `Stok bertambah ${parsed.data.add}`,
            data: product,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}