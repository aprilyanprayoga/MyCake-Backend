import { Request, Response } from "express";

// GET /api/store-info  (info pembayaran QRIS untuk halaman "Cara Bayar")
export function getStoreInfo(_req: Request, res: Response) {
    res.status(200).json({
        success: true,
        data: {
            storeName: process.env.STORE_NAME ?? "MyCake",
            qrisImageUrl: process.env.QRIS_IMAGE_URL || null,
        },
    });
}