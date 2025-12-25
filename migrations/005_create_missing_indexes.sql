-- ================================================================
-- СОЗДАНИЕ НЕДОСТАЮЩИХ ИНДЕКСОВ ДЛЯ getFilterOptions
-- ================================================================

BEGIN;

-- 1. Индекс для DISTINCT rk (критически важен!)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_rk_distinct 
  ON orders(rk) 
  WHERE rk IS NOT NULL;

-- 2. Индекс для DISTINCT type_equipment (критически важен!)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_equipment_distinct 
  ON orders(type_equipment) 
  WHERE type_equipment IS NOT NULL;

-- 3. Индекс для мастеров (RBAC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_master_city_date 
  ON orders(master_id, city, date_meeting ASC NULLS LAST)
  WHERE master_id IS NOT NULL;

COMMIT;

-- ================================================================
-- ОЧИСТКА МУСОРА (dead tuples)
-- ================================================================

-- У вас 221 мертвых строк (12.98%), нужна очистка
VACUUM ANALYZE orders;

-- ================================================================
-- ОПЦИОНАЛЬНО: Удалить неиспользуемые индексы для экономии места
-- ================================================================

/*
-- Эти индексы никогда не использовались, можно удалить:
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_status_clean_range;
DROP INDEX CONCURRENTLY IF EXISTS orders_bso_doc_gin_idx;
DROP INDEX CONCURRENTLY IF EXISTS orders_phone_idx;
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_rk_avito_status;
DROP INDEX CONCURRENTLY IF EXISTS orders_expenditure_doc_gin_idx;

-- Освободит ~632 KB дискового пространства
*/

-- ================================================================
-- ПРОВЕРКА РЕЗУЛЬТАТА
-- ================================================================

-- После создания индексов проверь их наличие:
SELECT 
  indexname,
  pg_size_pretty(pg_relation_size(schemaname||'.'||indexname::text)) as size
FROM pg_indexes
WHERE tablename = 'orders'
  AND indexname IN (
    'idx_orders_rk_distinct',
    'idx_orders_equipment_distinct',
    'idx_orders_master_city_date'
  );

-- Проверь использование через некоторое время:
-- SELECT idx_scan FROM pg_stat_user_indexes 
-- WHERE indexrelname = 'idx_orders_rk_distinct';

