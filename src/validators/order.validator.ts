import { z } from "zod";
import { isValidDateString, todayString } from "../utils/date.util";

export const createOrderSchema = z.object({
    items: z
        .array(
            z.object({
                productId: z.number("productId harus berupa angka").int().positive(),
                qty: z
                    .number("qty harus berupa angka")
                    .int("qty harus bilangan bulat")
                    .min(1, "qty minimal 1")
                    .max(100, "qty maksimal 100"),
            })
        )
        .min(1, "Minimal pesan 1 kue"),
    pickupDate: z
        .string("Tanggal ambil wajib diisi")
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
        .refine(isValidDateString, "Tanggal tidak valid")
        .refine((value) => value >= todayString(), "Tanggal ambil tidak boleh sebelum hari ini"),
    note: z.string().max(500, "Catatan maksimal 500 karakter").optional(),
});