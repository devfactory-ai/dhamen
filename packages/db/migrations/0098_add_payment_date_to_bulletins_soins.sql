-- Migration: Add payment_date column to bulletins_soins
ALTER TABLE bulletins_soins ADD COLUMN payment_date TEXT;
