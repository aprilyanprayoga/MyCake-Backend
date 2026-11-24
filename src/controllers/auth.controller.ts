import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { users, roles } from "../db/schema";
import { registerSchema, loginSchema } from "../validators/auth.validator";

function generateToken(id: number, role: string) {
    return jwt.sign({ id, role }, process.env.JWT_SECRET!, {
        expiresIn: (process.env.JWT_EXPIRES_IN || "1d") as jwt.SignOptions["expiresIn"],
    });
}

export async function register(req: Request, res: Response) {
    const parsed = registerSchema.safeParse(req.body);
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

    const { name, email, password, phone } = parsed.data;

    try {
        // email harus belum terpakai
        const existing = await db.select().from(users).where(eq(users.email, email));
        if (existing.length > 0) {
            res.status(409).json({ success: false, message: "Email sudah terdaftar" });
            return;
        }

        // role SELALU customer, ditentukan server
        const [customerRole] = await db
            .select()
            .from(roles)
            .where(eq(roles.name, "customer"));
        if (!customerRole) {
            res
                .status(500)
                .json({ success: false, message: "Role customer belum ada, jalankan seed" });
            return;
        }

        const hashed = await bcrypt.hash(password, 10);
        const [result] = await db.insert(users).values({
            name,
            email,
            password: hashed,
            phone,
            roleId: customerRole.id,
        });

        const userId = result.insertId;
        const token = generateToken(userId, "customer");

        res.status(201).json({
            success: true,
            message: "Registrasi berhasil",
            data: {
                token,
                user: { id: userId, name, email, role: "customer" },
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}

export async function login(req: Request, res: Response) {
    const parsed = loginSchema.safeParse(req.body);
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

    const { email, password } = parsed.data;

    try {
        const [user] = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                password: users.password,
                role: roles.name,
            })
            .from(users)
            .innerJoin(roles, eq(users.roleId, roles.id))
            .where(eq(users.email, email));

        // pesan sama untuk email salah dan password salah
        const valid = user && (await bcrypt.compare(password, user.password));
        if (!user || !valid) {
            res
                .status(401)
                .json({ success: false, message: "Email atau password salah" });
            return;
        }

        const token = generateToken(user.id, user.role);

        res.status(200).json({
            success: true,
            message: "Login berhasil",
            data: {
                token,
                user: { id: user.id, name: user.name, email: user.email, role: user.role },
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}

// Cek siapa yang sedang login
export async function me(req: Request, res: Response) {
    try {
        const [user] = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                phone: users.phone,
                role: roles.name,
            })
            .from(users)
            .innerJoin(roles, eq(users.roleId, roles.id))
            .where(eq(users.id, req.user!.id));

        if (!user) {
            res.status(404).json({ success: false, message: "User tidak ditemukan" });
            return;
        }

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
    }
}