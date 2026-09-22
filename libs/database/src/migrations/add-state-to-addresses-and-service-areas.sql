-- Migration: Add state column to customer_addresses and purohit_service_areas

ALTER TABLE "customer_addresses" 
ADD COLUMN IF NOT EXISTS "state" VARCHAR(100);

ALTER TABLE "purohit_service_areas" 
ADD COLUMN IF NOT EXISTS "state" VARCHAR(100);
