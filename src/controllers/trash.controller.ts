import { Request, Response } from "express";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db } from "../db/db";
import { orders, orderItems, products, users } from "../db/schema";
import { HttpError } from "../utils/http-error";

const deleter = alias(users, "deleter");

function parseId(value: unknown): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function handleError(res: Response, error: unknown) {
    if (error instanceof HttpError) {
        res.status(error.status).json({ success: false, message: error.message });
        return;
    }
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
}

// DELETE /api/orders/:id  (kasir, admin) -> SOFT DELETE
export async function deleteOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        return;
    }

    try {
        let stockReturned = false;

        await db.transaction(async (tx) => {
            const [order] = await tx
                .select()
                .from(orders)
                .where(and(eq(orders.id, id), isNull(orders.deletedAt)));

            if (!order) throw new HttpError(404, "Pesanan tidak ditemukan");

            // pesanan yang masih berjalan: batalkan dan kembalikan stok
            const stillActive = order.status !== "completed" && order.status !== "cancelled";

            if (stillActive) {
                const items = await tx
                    .select()
                    .from(orderItems)
                    .where(eq(orderItems.orderId, id));

                for (const item of items) {
                    await tx
                        .update(products)
                        .set({ stock: sql`${products.stock} + ${item.qty}` })
                        .where(eq(products.id, item.productId));
                }
                stockReturned = true;
            }

            await tx
                .update(orders)
                .set({
                    deletedAt: new Date(),
                    deletedBy: req.user!.id,
                    ...(stillActive && { status: "cancelled" as const }),
                })
                .where(eq(orders.id, id));
        });

        res.status(200).json({
            success: true,
            message: stockReturned
                ? "Pesanan dihapus, status menjadi cancelled dan stok dikembalikan"
                : "Pesanan berhasil dihapus",
        });
    } catch (error) {
        handleError(res, error);
    }
}

// GET /api/trash  (admin)
export async function getTrash(_req: Request, res: Response) {
    try {
        const trashedProducts = await db
            .select({
                id: products.id,
                name: products.name,
                price: products.price,
                stock: products.stock,
                imageUrl: products.imageUrl,
                deletedAt: products.deletedAt,
                deletedById: products.deletedBy,
                deletedByName: deleter.name,
            })
            .from(products)
            .leftJoin(deleter, eq(products.deletedBy, deleter.id))
            .where(isNotNull(products.deletedAt))
            .orderBy(desc(products.deletedAt));

        const trashedOrders = await db
            .select({
                id: orders.id,
                customerName: users.name,
                total: orders.total,
                status: orders.status,
                pickupDate: orders.pickupDate,
                deletedAt: orders.deletedAt,
                deletedById: orders.deletedBy,
                deletedByName: deleter.name,
            })
            .from(orders)
            .innerJoin(users, eq(orders.userId, users.id))
            .leftJoin(deleter, eq(orders.deletedBy, deleter.id))
            .where(isNotNull(orders.deletedAt))
            .orderBy(desc(orders.deletedAt));

        res.status(200).json({
            success: true,
            data: { products: trashedProducts, orders: trashedOrders },
        });
    } catch (error) {
        handleError(res, error);
    }
}

// PATCH /api/trash/orders/:id/restore  (admin)
export async function restoreOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        return;
    }

    try {
        const [updated] = await db
            .update(orders)
            .set({ deletedAt: null, deletedBy: null })
            .where(and(eq(orders.id, id), isNotNull(orders.deletedAt)));

        if (updated.affectedRows === 0) {
            res.status(404).json({
                success: false,
                message: "Pesanan tidak ada di tong sampah",
            });
            return;
        }

        res.status(200).json({ success: true, message: "Pesanan berhasil dikembalikan" });
    } catch (error) {
        handleError(res, error);
    }
}

// PATCH /api/trash/products/:id/restore  (admin)
export async function restoreProduct(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID kue tidak valid" });
        return;
    }

    try {
        const [updated] = await db
            .update(products)
            .set({ deletedAt: null, deletedBy: null })
            .where(and(eq(products.id, id), isNotNull(products.deletedAt)));

        if (updated.affectedRows === 0) {
            res.status(404).json({
                success: false,
                message: "Kue tidak ada di tong sampah",
            });
            return;
        }

        res.status(200).json({ success: true, message: "Kue berhasil dikembalikan" });
    } catch (error) {
        handleError(res, error);
    }
}