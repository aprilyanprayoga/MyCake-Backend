import { Request, Response, NextFunction } from "express";

export function notFound(req: Request, res: Response) {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
    });
}

export function errorHandler(
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
) {
    if (err instanceof SyntaxError && "body" in err) {
        res.status(400).json({ success: false, message: "Format JSON tidak valid" });
        return;
    }

    console.error(err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
}