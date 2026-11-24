import { Request, Response } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { orders, orderItems, products, users } from "../db/schema";
import { isValidDateString, todayString } from "../utils/date.util";

const PAID_STATUSES = ["confirmed", "completed"] as const;
const isPaid = (status: string) => (PAID_STATUSES as readonly string[]).includes(status);

function handleError(res: Response, error: unknown) {
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
}

// Rekap pesanan yang DIBUAT pada rentang tanggal from..to (inklusif)
async function buildRecap(from: string, to: string) {
    const inRange = and(
        isNull(orders.deletedAt),
        sql`DATE(${orders.createdAt}) between ${from} and ${to}`
    );

    const byStatus = await db
        .select({
            status: orders.status,
            count: sql<number>`count(*)`.mapWith(Number),
            total: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number),
        })
        .from(orders)
        .where(inRange)
        .groupBy(orders.status);

    const totalOrders = byStatus.reduce((sum, s) => sum + s.count, 0);
    const revenue = byStatus
        .filter((s) => isPaid(s.status))
        .reduce((sum, s) => sum + s.total, 0);

    const soldProducts = await db
        .select({
            productId: orderItems.productId,
            name: products.name,
            qty: sql<number>`sum(${orderItems.qty})`.mapWith(Number),
            subtotal: sql<number>`sum(${orderItems.qty} * ${orderItems.price})`.mapWith(Number),
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .innerJoin(products, eq(orderItems.productId, products.id))
        .where(and(inRange, inArray(orders.status, [...PAID_STATUSES])))
        .groupBy(orderItems.productId, products.name)
        .orderBy(desc(sql`sum(${orderItems.qty})`));

    const daily = await db
        .select({
            date: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m-%d')`,
            orders: sql<number>`count(*)`.mapWith(Number),
            revenue: sql<number>`coalesce(sum(case when ${orders.status} in ('confirmed','completed') then ${orders.total} else 0 end), 0)`.mapWith(Number),
        })
        .from(orders)
        .where(inRange)
        .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m-%d')`)
        .orderBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m-%d')`);

    return {
        totalOrders,
        revenue,
        byStatus: byStatus.map(({ status, count, total }) => ({ status, count, total })),
        products: soldProducts,
        daily,
    };
}

// GET /api/recap/today  (kasir, admin)
export async function getTodayRecap(_req: Request, res: Response) {
    try {
        const date = todayString();
        const recap = await buildRecap(date, date);

        const list = await db
            .select({
                id: orders.id,
                customerName: users.name,
                customerPhone: users.phone,
                total: orders.total,
                status: orders.status,
                pickupDate: orders.pickupDate,
                createdAt: orders.createdAt,
            })
            .from(orders)
            .innerJoin(users, eq(orders.userId, users.id))
            .where(and(isNull(orders.deletedAt), sql`DATE(${orders.createdAt}) = ${date}`))
            .orderBy(desc(orders.id));

        res.status(200).json({ success: true, data: { date, ...recap, orders: list } });
    } catch (error) {
        handleError(res, error);
    }
}

// GET /api/recap?from=YYYY-MM-DD&to=YYYY-MM-DD  (admin, default: semua tanggal)
export async function getRecap(req: Request, res: Response) {
    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : "2000-01-01";
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : todayString();

    if (!isValidDateString(from) || !isValidDateString(to)) {
        res.status(400).json({
            success: false,
            message: "Format tanggal harus YYYY-MM-DD dan tanggalnya harus valid",
        });
        return;
    }
    if (from > to) {
        res.status(400).json({
            success: false,
            message: "Tanggal 'from' tidak boleh lebih besar dari 'to'",
        });
        return;
    }

    try {
        const recap = await buildRecap(from, to);
        res.status(200).json({ success: true, data: { from, to, ...recap } });
    } catch (error) {
        handleError(res, error);
    }
}