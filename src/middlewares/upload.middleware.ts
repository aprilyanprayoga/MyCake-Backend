import { Request, Response, NextFunction } from "express";
import multer from "multer";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Hanya file JPG, PNG, atau WEBP yang diperbolehkan"));
        }
    },
});

// Middleware upload 1 file, error multer dibalas dengan JSON yang rapi
export function uploadSingle(fieldName: string) {
    const handler = upload.single(fieldName);

    return (req: Request, res: Response, next: NextFunction) => {
        handler(req, res, (err: unknown) => {
            if (err instanceof multer.MulterError) {
                const message =
                    err.code === "LIMIT_FILE_SIZE"
                        ? "Ukuran file maksimal 2 MB"
                        : `Upload gagal: ${err.message}`;
                res.status(400).json({ success: false, message });
                return;
            }
            if (err instanceof Error) {
                res.status(400).json({ success: false, message: err.message });
                return;
            }
            next();
        });
    };
}