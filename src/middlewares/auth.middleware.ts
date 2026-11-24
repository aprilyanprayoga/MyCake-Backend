import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface TokenPayload {
    id: number;
    role: string;
}

// Cek token valid, lalu simpan id dan role ke req.user
export function authenticate(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        res.status(401).json({ success: false, message: "Token tidak ditemukan" });
        return;
    }

    const token = header.split(" ")[1];

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
        req.user = { id: payload.id, role: payload.role };
        next();
    } catch {
        res
            .status(401)
            .json({ success: false, message: "Token tidak valid atau sudah kedaluwarsa" });
    }
}

// Cek role user termasuk yang diizinkan
export function authorize(...allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            res
                .status(403)
                .json({ success: false, message: "Kamu tidak punya akses ke fitur ini" });
            return;
        }
        next();
    };
}