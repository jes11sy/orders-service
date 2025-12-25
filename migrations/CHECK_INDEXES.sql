-- ================================================================
-- ПРОВЕРКА ИНДЕКСОВ ДЛЯ ТАБЛИЦЫ ORDERS
-- ================================================================

-- 1. Список всех индексов на таблице orders
SELECT 
  indexname,
  indexdef,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
LEFT JOIN pg_stat_user_indexes USING (schemaname, indexname)
WHERE tablename = 'orders'
ORDER BY indexname;

-- ================================================================
-- 2. ВАЖНЫЕ ИНДЕКСЫ ДЛЯ getFilterOptions (ДОЛЖНЫ БЫТЬ)
-- ================================================================

-- Проверяем наличие индексов для DISTINCT запросов
SELECT 
  'idx_orders_rk_distinct' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname = 'idx_orders_rk_distinct'
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

SELECT 
  'idx_orders_equipment_distinct' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname = 'idx_orders_equipment_distinct'
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- Проверяем составные индексы для директора
SELECT 
  'idx_orders_rk_city OR idx_orders_city_rk_director' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND (indexname = 'idx_orders_rk_city' OR indexname = 'idx_orders_city_rk_director')
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

SELECT 
  'idx_orders_equipment_city OR idx_orders_city_equipment_director' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND (indexname = 'idx_orders_equipment_city' OR indexname = 'idx_orders_city_equipment_director')
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- ================================================================
-- 3. ИНДЕКСЫ ДЛЯ RBAC (ДОЛЖНЫ БЫТЬ)
-- ================================================================

SELECT 
  'idx_orders_city_status_meeting' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname = 'idx_orders_city_status_meeting'
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

SELECT 
  'idx_orders_master_city_date' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname = 'idx_orders_master_city_date'
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- ================================================================
-- 4. ПОЛНОТЕКСТОВЫЙ ПОИСК (pg_trgm - ДОЛЖЕН БЫТЬ)
-- ================================================================

-- Проверяем установлено ли расширение pg_trgm
SELECT 
  'pg_trgm extension' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
    ) 
    THEN '✅ INSTALLED' 
    ELSE '❌ NOT INSTALLED' 
  END as status;

-- Проверяем GIN индексы для поиска
SELECT 
  'idx_orders_phone_trgm' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname = 'idx_orders_phone_trgm'
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

SELECT 
  'idx_orders_client_name_trgm' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname = 'idx_orders_client_name_trgm'
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

SELECT 
  'idx_orders_address_trgm' as expected_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'orders' 
      AND indexname = 'idx_orders_address_trgm'
    ) 
    THEN '✅ EXISTS' 
    ELSE '❌ MISSING' 
  END as status;

-- ================================================================
-- 5. СТАТИСТИКА ИСПОЛЬЗОВАНИЯ ИНДЕКСОВ
-- ================================================================

SELECT 
  schemaname,
  indexrelname as index_name,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND relname = 'orders'
ORDER BY idx_scan DESC;

-- ================================================================
-- 6. НЕИСПОЛЬЗУЕМЫЕ ИНДЕКСЫ (кандидаты на удаление)
-- ================================================================

SELECT 
  schemaname,
  indexrelname as index_name,
  idx_scan as times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  '⚠️ NEVER USED - Consider dropping' as warning
FROM pg_stat_user_indexes
WHERE schemaname = 'public' 
  AND relname = 'orders'
  AND idx_scan = 0
  AND indexrelname NOT LIKE '%pkey%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ================================================================
-- 7. РАЗМЕР ТАБЛИЦЫ И ИНДЕКСОВ
-- ================================================================

SELECT 
  pg_size_pretty(pg_total_relation_size('orders')) as total_size,
  pg_size_pretty(pg_relation_size('orders')) as table_size,
  pg_size_pretty(pg_total_relation_size('orders') - pg_relation_size('orders')) as indexes_size,
  round(
    100.0 * (pg_total_relation_size('orders') - pg_relation_size('orders')) / 
    NULLIF(pg_total_relation_size('orders'), 0), 
    2
  ) as indexes_percentage;

-- ================================================================
-- 8. BLOAT (раздутие таблицы/индексов)
-- ================================================================

SELECT 
  relname as table_name,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_percentage,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_all_tables
WHERE schemaname = 'public' 
  AND relname = 'orders';

-- ================================================================
-- РЕКОМЕНДАЦИИ
-- ================================================================

/*
КРИТИЧЕСКИ ВАЖНЫЕ ИНДЕКСЫ ДЛЯ getFilterOptions:
=================================================
1. idx_orders_rk_distinct          - для DISTINCT rk
2. idx_orders_equipment_distinct   - для DISTINCT type_equipment
3. idx_orders_rk_city              - для фильтрации по городу + rk
4. idx_orders_equipment_city       - для фильтрации по городу + equipment

ЕСЛИ ИХ НЕТ, ВЫПОЛНИТЕ:
=======================
cd api-services/orders-service
psql -U your_user -d your_database -f migrations/001_add_performance_indexes.sql

ИЛИ ВРУЧНУЮ:
=============
CREATE INDEX CONCURRENTLY idx_orders_rk_distinct 
  ON orders(rk) WHERE rk IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_orders_equipment_distinct 
  ON orders(type_equipment) WHERE type_equipment IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_orders_rk_city 
  ON orders(rk, city);

CREATE INDEX CONCURRENTLY idx_orders_equipment_city 
  ON orders(type_equipment, city);

ПОСЛЕ СОЗДАНИЯ ИНДЕКСОВ:
========================
ANALYZE orders;
*/

