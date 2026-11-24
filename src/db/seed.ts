import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { roles, users } from "./schema";

const roleList = [
  { id: 1, name: "admin" },
  { id: 2, name: "kasir" },
  { id: 3, name: "customer" },
];

const userList = [
  { name: "Pemilik MyCake", email: "admin@mycake.com", password: "admin123", roleId: 1 },
  { name: "Kasir Satu", email: "kasir1@mycake.com", password: "kasir123", roleId: 2 },
  { name: "Kasir Dua", email: "kasir2@mycake.com", password: "kasir123", roleId: 2 },
  { name: "Customer Uji", email: "customer@mycake.com", password: "customer123", roleId: 3 },
];

async function seed() {
  // 1. roles (dilewati kalau sudah ada)
  for (const role of roleList) {
    const existing = await db.select().from(roles).where(eq(roles.id, role.id));
    if (existing.length === 0) {
      await db.insert(roles).values(role);
      console.log(`Role dibuat: ${role.name}`);
    }
  }

  // 2. users (dilewati kalau email sudah ada)
  for (const user of userList) {
    const existing = await db.select().from(users).where(eq(users.email, user.email));
    if (existing.length === 0) {
      const hashed = await bcrypt.hash(user.password, 10);
      await db.insert(users).values({
        name: user.name,
        email: user.email,
        password: hashed,
        roleId: user.roleId,
      });
      console.log(`User dibuat: ${user.email}`);
    }
  }
}

seed()
  .then(() => {
    console.log("Seed selesai");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed gagal:", err);
    process.exit(1);
  });