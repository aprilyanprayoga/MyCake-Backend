import { z } from "zod";

// Data dari form-data selalu berupa string, jadi angka di-coerce
export const createProductSchema = z.object({
    name: z.string().min(2, "Nama kue minimal 2 karakter").max(100),
    description: z.string().max(1000).optional(),
    price: z.coerce
        .number("Harga harus berupa angka")
        .int("Harga harus bilangan bulat")
        .min(0, "Harga tidak boleh negatif"),
    stock: z.coerce
        .number("Stok harus berupa angka")
        .int("Stok harus bilangan bulat")
        .min(0, "Stok tidak boleh negatif")
        .optional(),
});

export const updateProductSchema = createProductSchema.partial();