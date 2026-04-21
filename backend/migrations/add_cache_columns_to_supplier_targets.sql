-- Migration: Add cache columns to supplier_targets
-- Run this SQL to add caching columns for target calculations

ALTER TABLE supplier_targets ADD
  cached_actual_qty DECIMAL(18,2) NULL,
  cached_actual_amount DECIMAL(18,2) NULL,
  cached_actual_weight DECIMAL(18,2) NULL,
  cached_actual_area DECIMAL(18,2) NULL,
  cached_actual_value DECIMAL(18,2) NULL,
  cached_achievement_percent DECIMAL(18,2) NULL,
  cached_target_state NVARCHAR(50) NULL,
  cached_is_achieved BIT NULL,
  cached_at DATETIME NULL;