import {
    mysqlTable,
    int,
    varchar,
    text,
    date,
    timestamp,
    mysqlEnum,
} from "drizzle-orm/mysql-core";

// 1. ROLES
export const roles = mysqlTable("roles", {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 20 }).notNull().unique(), // admin | kasir | customer
});

// 2. USERS
export const users = mysqlTable("users", {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 100 }).notNull().unique(),
    password: varchar("password", { length: 255 }).notNull(), // hash bcrypt
    phone: varchar("phone", { length: 20 }),
    roleId: int("role_id")
        .notNull()
        .references(() => roles.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 3. PRODUCTS (kue) - soft delete
export const products = mysqlTable("products", {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    price: int("price").notNull(), // rupiah
    stock: int("stock").notNull().default(0),
    imageUrl: varchar("image_url", { length: 500 }),
    imagePublicId: varchar("image_public_id", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: int("deleted_by").references(() => users.id),
});

// 4. ORDERS - soft delete
export const orders = mysqlTable("orders", {
    id: int("id").autoincrement().primaryKey(),
    userId: int("user_id")
        .notNull()
        .references(() => users.id),
    total: int("total").notNull(),
    status: mysqlEnum("status", [
        "pending",
        "waiting_confirmation",
        "confirmed",
        "completed",
        "cancelled",
    ])
        .notNull()
        .default("pending"),
    pickupDate: date("pickup_date", { mode: "string" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: int("deleted_by").references(() => users.id),
});

// 5. ORDER_ITEMS
export const orderItems = mysqlTable("order_items", {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("order_id")
        .notNull()
        .references(() => orders.id),
    productId: int("product_id")
        .notNull()
        .references(() => products.id),
    qty: int("qty").notNull(),
    price: int("price").notNull(), // harga saat dipesan
});

// 6. PAYMENTS
export const payments = mysqlTable("payments", {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("order_id")
        .notNull()
        .references(() => orders.id),
    proofUrl: varchar("proof_url", { length: 500 }).notNull(),
    proofPublicId: varchar("proof_public_id", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["waiting", "confirmed", "rejected"])
        .notNull()
        .default("waiting"),
    rejectReason: varchar("reject_reason", { length: 255 }),
    confirmedBy: int("confirmed_by").references(() => users.id),
    confirmedAt: timestamp("confirmed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});