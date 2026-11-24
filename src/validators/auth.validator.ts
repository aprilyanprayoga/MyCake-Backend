import { z } from "zod";

export const registerSchema = z.object({
    name: z.string().min(2, "Nama minimal 2 karakter").max(100),
    email: z.email("Format email tidak valid"),
    password: z.string().min(6, "Password minimal 6 karakter"),
    // wajib. Kalau mau opsional, tambah .optional() di akhir regex
    phone: z
        .string()
        .regex(/^(?:\+62|62|0)8\d{8,11}$/, "Nomor HP tidak valid (contoh: 081234567890)"),
});

export const loginSchema = z.object({
    email: z.email("Format email tidak valid"),
    password: z.string().min(1, "Password wajib diisi"),
});