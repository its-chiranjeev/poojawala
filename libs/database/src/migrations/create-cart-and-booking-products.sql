-- Migration: Create carts, cart_items, and booking_products tables
-- Safe, idempotent, non-destructive

-- 1. Create carts table
CREATE TABLE IF NOT EXISTS "carts" (
  "id" SERIAL PRIMARY KEY,
  "customerId" integer NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_carts_customerId" UNIQUE ("customerId"),
  CONSTRAINT "FK_carts_customerId" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_carts_customerId" ON "carts" ("customerId");

-- 2. Create cart_items table
CREATE TABLE IF NOT EXISTS "cart_items" (
  "id" SERIAL PRIMARY KEY,
  "cartId" integer NOT NULL,
  "productId" integer NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_cart_items_cartId_productId" UNIQUE ("cartId", "productId"),
  CONSTRAINT "FK_cart_items_cartId" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_cart_items_productId" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_cart_items_cartId" ON "cart_items" ("cartId");
CREATE INDEX IF NOT EXISTS "IDX_cart_items_productId" ON "cart_items" ("productId");

-- 3. Create booking_products table
CREATE TABLE IF NOT EXISTS "booking_products" (
  "id" SERIAL PRIMARY KEY,
  "bookingId" integer,
  "customerId" integer NOT NULL,
  "paymentId" integer,
  "productId" integer NOT NULL,
  "productNameSnapshot" character varying(255) NOT NULL,
  "unitPriceSnapshot" numeric(10, 2) NOT NULL,
  "quantity" integer NOT NULL,
  "total" numeric(10, 2) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "FK_booking_products_bookingId" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL,
  CONSTRAINT "FK_booking_products_customerId" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "FK_booking_products_paymentId" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL,
  CONSTRAINT "FK_booking_products_productId" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "IDX_booking_products_bookingId" ON "booking_products" ("bookingId");
CREATE INDEX IF NOT EXISTS "IDX_booking_products_customerId" ON "booking_products" ("customerId");
CREATE INDEX IF NOT EXISTS "IDX_booking_products_paymentId" ON "booking_products" ("paymentId");
CREATE INDEX IF NOT EXISTS "IDX_booking_products_productId" ON "booking_products" ("productId");

-- Reversible rollback statements (for documentation):
-- DROP TABLE IF EXISTS "booking_products";
-- DROP TABLE IF EXISTS "cart_items";
-- DROP TABLE IF EXISTS "carts";
