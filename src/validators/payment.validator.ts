import { z } from "zod";

export const rejectPaymentSchema = z.object({
    reason: z
        .string("Alasan penolakan wajib diisi")
        .min(3, "Alasan minimal 3 karakter")
        .max(255, "Alasan maksimal 255 karakter"),
});