import { Request, Response } from "express";
import { and, desc, eq, isNull, like } from "drizzle-orm";
import { db } from "../db/db";
import { products } from "../db/schema";
import {
    createProductSchema,
    updateProductSchema,
} from "../validators/product.validator";
import { uploadImage, deleteImage } from "../utils/cloudinary.util";

const FOLDER = "mycake/products";

function parseId(value: unknown): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function validationError(res: Response, issues: { path: PropertyKey[]; message: string }[]) {
    res.status(400).json({
        success: false,
        message: "Validasi gagal",
        errors: issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
        })),
    });
}

// Kolom yang dikirim ke client
const publicColumns = {
    id: products.id,
    name: products.name,
    description: products.description,
    price: products.price,
    stock: products.stock,
    imageUrl: products.imageUrl,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
};

// GET /api/products?search=brownies
export async function getProducts(req: Request, res: Response) {
    try {
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

        const conditions = [isNull(products.deletedAt)];
        if (search) conditions.push(like(products.name, `%${search}%`));

        const data = await db
            .select(publicColumns)
            .from(products)
            .where(and(...conditions))
            .orderBy(desc(products.id));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}

// GET /api/products/:id
export async function getProductById(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID kue tidak valid" });
        return;
    }

    try {
        const [product] = await db
            .select(publicColumns)
            .from(products)
            .where(and(eq(products.id, id), isNull(products.deletedAt)));

        if (!product) {
            res.status(404).json({ success: false, message: "Kue tidak ditemukan" });
            return;
        }

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}

// POST /api/products  (form-data, field gambar: image)
export async function createProduct(req: Request, res: Response) {
    const parsed = createProductSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
    }

    const { name, description, price, stock } = parsed.data;
    let uploaded: { url: string; publicId: string } | null = null;

    try {
        if (req.file) {
            const result = await uploadImage(req.file.buffer, FOLDER);
            uploaded = { url: result.secure_url, publicId: result.public_id };
        }

        const [result] = await db.insert(products).values({
            name,
            description,
            price,
            stock: stock ?? 0,
            imageUrl: uploaded?.url,
            imagePublicId: uploaded?.publicId,
        });

        const [created] = await db
            .select(publicColumns)
            .from(products)
            .where(eq(products.id, result.insertId));

        res.status(201).json({
            success: true,
            message: "Kue berhasil ditambahkan",
            data: created,
        });
    } catch (error) {
        // kalau database gagal, gambar yang terlanjur diupload dibersihkan
        await deleteImage(uploaded?.publicId);
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}

// PUT /api/products/:id  (form-data, semua field opsional)
export async function updateProduct(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID kue tidak valid" });
        return;
    }

    const parsed = updateProductSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        validationError(res, parsed.error.issues);
        return;
    }

    const changes = parsed.data;
    if (Object.keys(changes).length === 0 && !req.file) {
        res.status(400).json({ success: false, message: "Tidak ada data yang diubah" });
        return;
    }

    let uploaded: { url: string; publicId: string } | null = null;

    try {
        const [existing] = await db
            .select()
            .from(products)
            .where(and(eq(products.id, id), isNull(products.deletedAt)));

        if (!existing) {
            res.status(404).json({ success: false, message: "Kue tidak ditemukan" });
            return;
        }

        if (req.file) {
            const result = await uploadImage(req.file.buffer, FOLDER);
            uploaded = { url: result.secure_url, publicId: result.public_id };
        }

        await db
            .update(products)
            .set({
                ...changes,
                ...(uploaded && {
                    imageUrl: uploaded.url,
                    imagePublicId: uploaded.publicId,
                }),
            })
            .where(eq(products.id, id));

        // gambar lama dihapus setelah data baru berhasil disimpan
        if (uploaded) await deleteImage(existing.imagePublicId);

        const [updated] = await db
            .select(publicColumns)
            .from(products)
            .where(eq(products.id, id));

        res.status(200).json({
            success: true,
            message: "Kue berhasil diperbarui",
            data: updated,
        });
    } catch (error) {
        await deleteImage(uploaded?.publicId);
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}

// DELETE /api/products/:id  -> SOFT DELETE
export async function deleteProduct(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) {
        res.status(400).json({ success: false, message: "ID kue tidak valid" });
        return;
    }

    try {
        const [existing] = await db
            .select()
            .from(products)
            .where(and(eq(products.id, id), isNull(products.deletedAt)));

        if (!existing) {
            res.status(404).json({ success: false, message: "Kue tidak ditemukan" });
            return;
        }
        await db
            .update(products)
            .set({ deletedAt: new Date(), deletedBy: req.user!.id })
            .where(eq(products.id, id));

        res.status(200).json({ success: true, message: "Kue berhasil dihapus" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}