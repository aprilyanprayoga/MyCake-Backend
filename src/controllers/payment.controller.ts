import { Request, Response } from "express";
import { and, desc, eq, isNull, SQL } from "drizzle-orm";
import { db } from "../db/db";
import { orders, payments, users } from "../db/schema";
import { rejectPaymentSchema } from "../validators/payment.validator";
import { uploadImage, deleteImage } from "../utils/cloudinary.util";
import { HttpError } from "../utils/http-error";

const FOLDER = "mycake/payments";
const PAYMENT_STATUSES = ["waiting", "confirmed", "rejected"] as const;
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

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

const paymentColumns = {
    id: payments.id,
    orderId: payments.orderId,
    proofUrl: payments.proofUrl,
    status: payments.status,
    rejectReason: payments.rejectReason,
    confirmedBy: payments.confirmedBy,
    confirmedAt: payments.confirmedAt,
    createdAt: payments.createdAt,
};

// POST /api/orders/:id/payment  (customer pemilik, form-data field: proof)
export async function submitPayment(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        return;
    }
    if (!req.file) {
        res.status(400).json({
            success: false,
            message: "Bukti pembayaran wajib diupload (field: proof)",
        });
        return;
    }

    let uploadedPublicId: string | null = null;

    try {
        const [order] = await db
            .select()
            .from(orders)
            .where(
                and(
                    eq(orders.id, id),
                    eq(orders.userId, req.user!.id),
                    isNull(orders.deletedAt)
                )
            );

        if (!order) throw new HttpError(404, "Pesanan tidak ditemukan");
        if (order.status !== "pending") {
            throw new HttpError(
                400,
                "Bukti bayar hanya bisa diupload untuk pesanan berstatus pending"
            );
        }

        const uploaded = await uploadImage(req.file.buffer, FOLDER);
        uploadedPublicId = uploaded.public_id;

        await db.transaction(async (tx) => {
            const [updated] = await tx
                .update(orders)
                .set({ status: "waiting_confirmation" })
                .where(and(eq(orders.id, id), eq(orders.status, "pending")));

            if (updated.affectedRows === 0) {
                throw new HttpError(400, "Status pesanan sudah berubah, coba muat ulang");
            }

            await tx.insert(payments).values({
                orderId: id,
                proofUrl: uploaded.secure_url,
                proofPublicId: uploaded.public_id,
            });
        });

        const [payment] = await db
            .select(paymentColumns)
            .from(payments)
            .where(eq(payments.orderId, id))
            .orderBy(desc(payments.id))
            .limit(1);

        res.status(201).json({
            success: true,
            message: "Bukti pembayaran terkirim, menunggu konfirmasi kasir",
            data: payment,
        });
    } catch (error) {
        await deleteImage(uploadedPublicId);
        handleError(res, error);
    }
}

// GET /api/orders/:id/payment  (pemilik, kasir, admin)
export async function getOrderPayments(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        return;
    }

    try {
        const [order] = await db
            .select()
            .from(orders)
            .where(and(eq(orders.id, id), isNull(orders.deletedAt)));

        const isOtherCustomer =
            req.user!.role === "customer" && order && order.userId !== req.user!.id;

        if (!order || isOtherCustomer) {
            res.status(404).json({ success: false, message: "Pesanan tidak ditemukan" });
            return;
        }

        const data = await db
            .select(paymentColumns)
            .from(payments)
            .where(eq(payments.orderId, id))
            .orderBy(desc(payments.id));

        res.status(200).json({ success: true, data });
    } catch (error) {
        handleError(res, error);
    }
}

// GET /api/payments?status=waiting  (kasir, admin)
export async function listPayments(req: Request, res: Response) {
    const conditions: SQL[] = [isNull(orders.deletedAt)];

    if (typeof req.query.status === "string" && req.query.status !== "") {
        const status = req.query.status;
        if (!PAYMENT_STATUSES.includes(status as PaymentStatus)) {
            res.status(400).json({
                success: false,
                message: `Status tidak valid. Pilihan: ${PAYMENT_STATUSES.join(", ")}`,
            });
            return;
        }
        conditions.push(eq(payments.status, status as PaymentStatus));
    }

    try {
        const data = await db
            .select({
                ...paymentColumns,
                orderTotal: orders.total,
                orderStatus: orders.status,
                pickupDate: orders.pickupDate,
                customerName: users.name,
                customerPhone: users.phone,
            })
            .from(payments)
            .innerJoin(orders, eq(payments.orderId, orders.id))
            .innerJoin(users, eq(orders.userId, users.id))
            .where(and(...conditions))
            .orderBy(desc(payments.id));

        res.status(200).json({ success: true, data });
    } catch (error) {
        handleError(res, error);
    }
}

// Logika bersama untuk konfirmasi dan penolakan
async function reviewPayment(
    req: Request,
    res: Response,
    decision: "confirmed" | "rejected",
    reason?: string
) {
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
                .where(and(eq(orders.id, id), isNull(orders.deletedAt)));

            if (!order) throw new HttpError(404, "Pesanan tidak ditemukan");
            if (order.status !== "waiting_confirmation") {
                throw new HttpError(400, "Pesanan tidak sedang menunggu konfirmasi pembayaran");
            }

            const [payment] = await tx
                .select()
                .from(payments)
                .where(and(eq(payments.orderId, id), eq(payments.status, "waiting")))
                .orderBy(desc(payments.id))
                .limit(1);

            if (!payment) throw new HttpError(400, "Tidak ada pembayaran yang menunggu");

            const [updated] = await tx
                .update(payments)
                .set({
                    status: decision,
                    rejectReason: decision === "rejected" ? reason : null,
                    confirmedBy: req.user!.id,
                    confirmedAt: new Date(),
                })
                .where(and(eq(payments.id, payment.id), eq(payments.status, "waiting")));

            if (updated.affectedRows === 0) {
                throw new HttpError(400, "Pembayaran sudah diproses");
            }

            await tx
                .update(orders)
                .set({ status: decision === "confirmed" ? "confirmed" : "pending" })
                .where(eq(orders.id, id));
        });

        res.status(200).json({
            success: true,
            message:
                decision === "confirmed"
                    ? "Pembayaran dikonfirmasi"
                    : "Pembayaran ditolak, customer bisa upload ulang",
        });
    } catch (error) {
        handleError(res, error);
    }
}

// PATCH /api/orders/:id/payment/confirm
export function confirmPayment(req: Request, res: Response) {
    return reviewPayment(req, res, "confirmed");
}

// PATCH /api/orders/:id/payment/reject  (body: { "reason": "..." })
export function rejectPayment(req: Request, res: Response) {
    const parsed = rejectPaymentSchema.safeParse(req.body ?? {});
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
    return reviewPayment(req, res, "rejected", parsed.data.reason);
}

// PATCH /api/orders/:id/complete  (kue sudah diambil)
export async function completeOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID pesanan tidak valid" });
        return;
    }

    try {
        const [order] = await db
            .select()
            .from(orders)
            .where(and(eq(orders.id, id), isNull(orders.deletedAt)));

        if (!order) throw new HttpError(404, "Pesanan tidak ditemukan");
        if (order.status !== "confirmed") {
            throw new HttpError(
                400,
                "Hanya pesanan yang pembayarannya sudah dikonfirmasi yang bisa diselesaikan"
            );
        }

        const [updated] = await db
            .update(orders)
            .set({ status: "completed" })
            .where(and(eq(orders.id, id), eq(orders.status, "confirmed")));

        if (updated.affectedRows === 0) {
            throw new HttpError(400, "Status pesanan sudah berubah, coba muat ulang");
        }

        res.status(200).json({ success: true, message: "Pesanan selesai" });
    } catch (error) {
        handleError(res, error);
    }
}