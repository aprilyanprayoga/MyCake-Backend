import { Request, Response } from "express";
import { and, desc, eq, gte, inArray, isNull, sql, SQL } from "drizzle-orm";
import { db } from "../db/db";
import { orders, orderItems, products, users } from "../db/schema";
import { createOrderSchema } from "../validators/order.validator";
import { HttpError } from "../utils/http-error";

const ORDER_STATUSES = [
    "pending",
    "waiting_confirmation",
    "confirmed",
    "completed",
    "cancelled",
] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];

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

// Kolom order yang dikirim ke client (plus data customer untuk kasir/admin)
const orderColumns = {
    id: orders.id,
    userId: orders.userId,
    customerName: users.name,
    customerPhone: users.phone,
    total: orders.total,
    status: orders.status,
    pickupDate: orders.pickupDate,
    note: orders.note,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
};

// Tempelkan daftar item ke setiap order (1 query untuk semua order)
async function attachItems<T extends { id: number }>(rows: T[]) {
    if (rows.length === 0) return [];

    const items = await db
        .select({
            orderId: orderItems.orderId,
            productId: orderItems.productId,
            name: products.name,
            qty: orderItems.qty,
            price: orderItems.price,
        })
        .from(orderItems)
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(
            inArray(
                orderItems.orderId,
                rows.map((r) => r.id)
            )
        );

    const grouped = new Map<number, { productId: number; name: string; qty: number; price: number; subtotal: number }[]>();
    for (const item of items) {
        const list = grouped.get(item.orderId) ?? [];
        list.push({
            productId: item.productId,
            name: item.name,
            qty: item.qty,
            price: item.price,
            subtotal: item.qty * item.price,
        });
        grouped.set(item.orderId, list);
    }

    return rows.map((row) => ({ ...row, items: grouped.get(row.id) ?? [] }));
}

async function findOrderWithItems(id: number) {
    const rows = await db
        .select(orderColumns)
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .where(and(eq(orders.id, id), isNull(orders.deletedAt)));

    const [order] = await attachItems(rows);
    return order;
}

// POST /api/orders
export async function createOrder(req: Request, res: Response) {
    const parsed = createOrderSchema.safeParse(req.body ?? {});
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

    const { items, pickupDate, note } = parsed.data;

    // gabungkan item dengan productId yang sama
    const merged = new Map<number, number>();
    for (const item of items) {
        merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.qty);
    }

    try {
        const orderId = await db.transaction(async (tx) => {
            let total = 0;
            const rows: { productId: number; qty: number; price: number }[] = [];

            for (const [productId, qty] of merged) {
                const [product] = await tx
                    .select()
                    .from(products)
                    .where(and(eq(products.id, productId), isNull(products.deletedAt)));

                if (!product) {
                    throw new HttpError(404, `Kue dengan ID ${productId} tidak ditemukan`);
                }

                // kurangi stok hanya jika stok cukup (aman walau ada order bersamaan)
                const [updated] = await tx
                    .update(products)
                    .set({ stock: sql`${products.stock} - ${qty}` })
                    .where(and(eq(products.id, productId), gte(products.stock, qty)));

                if (updated.affectedRows === 0) {
                    throw new HttpError(
                        400,
                        `Stok ${product.name} tidak cukup (tersisa ${product.stock})`
                    );
                }

                rows.push({ productId, qty, price: product.price });
                total += product.price * qty;
            }

            const [orderResult] = await tx.insert(orders).values({
                userId: req.user!.id,
                total,
                pickupDate,
                note,
            });
            const newOrderId = orderResult.insertId;

            await tx
                .insert(orderItems)
                .values(rows.map((row) => ({ ...row, orderId: newOrderId })));

            return newOrderId;
        });

        const order = await findOrderWithItems(orderId);

        res.status(201).json({
            success: true,
            message: "Pesanan berhasil dibuat",
            data: order,
        });
    } catch (error) {
        handleError(res, error);
    }
}

// GET /api/orders/my
export async function getMyOrders(req: Request, res: Response) {
    try {
        const rows = await db
            .select(orderColumns)
            .from(orders)
            .innerJoin(users, eq(orders.userId, users.id))
            .where(and(eq(orders.userId, req.user!.id), isNull(orders.deletedAt)))
            .orderBy(desc(orders.id));

        const data = await attachItems(rows);
        res.status(200).json({ success: true, data });
    } catch (error) {
        handleError(res, error);
    }
}

// GET /api/orders?status=pending  (kasir, admin)
export async function getAllOrders(req: Request, res: Response) {
    const conditions: SQL[] = [isNull(orders.deletedAt)];

    if (typeof req.query.status === "string" && req.query.status !== "") {
        const status = req.query.status;
        if (!ORDER_STATUSES.includes(status as OrderStatus)) {
            res.status(400).json({
                success: false,
                message: `Status tidak valid. Pilihan: ${ORDER_STATUSES.join(", ")}`,
            });
            return;
        }
        conditions.push(eq(orders.status, status as OrderStatus));
    }

    try {
        const rows = await db
            .select(orderColumns)
            .from(orders)
            .innerJoin(users, eq(orders.userId, users.id))
            .where(and(...conditions))
            .orderBy(desc(orders.id));

        const data = await attachItems(rows);
        res.status(200).json({ success: true, data });
    } catch (error) {
        handleError(res, error);
    }
}

// GET /api/orders/:id  (pemilik, kasir, admin)
export async function getOrderById(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        return;
    }

    try {
        const order = await findOrderWithItems(id);

        // customer lain mendapat 404 agar keberadaan order orang lain tidak terbuka
        const isOtherCustomer =
            req.user!.role === "customer" && order && order.userId !== req.user!.id;

        if (!order || isOtherCustomer) {
            res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
            return;
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        handleError(res, error);
    }
}

// PATCH /api/orders/:id/cancel  (customer pemilik, hanya status pending)
export async function cancelOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        return;
    }

    try {
        await db.transaction(async (tx) => {
            const [order] = await tx
                .select()
                .from(orders)
                .where(
                    and(
                        eq(orders.id, id),
                        eq(orders.userId, req.user!.id),
                        isNull(orders.deletedAt)
                    )
                );

            if (!order) {
                throw new HttpError(404, "Pesanan tidak ditemukan");
            }
            if (order.status !== "pending") {
                throw new HttpError(
                    400,
                    "Hanya pesanan berstatus pending yang bisa dibatalkan"
                );
            }

            const [updated] = await tx
                .update(orders)
                .set({ status: "cancelled" })
                .where(and(eq(orders.id, id), eq(orders.status, "pending")));

            if (updated.affectedRows === 0) {
                throw new HttpError(400, "Status pesanan sudah berubah, coba muat ulang");
            }

            // kembalikan stok
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
        });

        res.status(200).json({ success: true, message: "Pesanan berhasil dibatalkan" });
    } catch (error) {
        handleError(res, error);
    }
}