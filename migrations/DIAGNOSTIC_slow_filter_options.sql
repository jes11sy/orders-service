-- ================================================================
-- ДИАГНОСТИКА: Почему getFilterOptions медленный при 1500 заказах?
-- ================================================================

-- ================================================================
-- 1. ПРОВЕРКА КОЛИЧЕСТВА ЗАКАЗОВ
-- ================================================================
SELECT COUNT(*) as total_orders FROM orders;
SELECT COUNT(DISTINCT city) as unique_cities FROM orders;
SELECT COUNT(DISTINCT rk) as unique_rks FROM orders WHERE rk IS NOT NULL;
SELECT COUNT(DISTINCT type_equipment) as unique_equipment FROM orders WHERE type_equipment IS NOT NULL;

-- ================================================================
-- 2. ПРОВЕРКА СТАТИСТИКИ ТАБЛИЦЫ
-- ================================================================
SELECT 
  schemaname,
  tablename,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename = 'orders';

-- ================================================================
-- 3. ПРОВЕРКА БЛОКИРОВОК
-- ================================================================
SELECT 
  pg_class.relname,
  pg_locks.locktype,
  pg_locks.mode,
  pg_locks.granted,
  pg_stat_activity.query,
  pg_stat_activity.state,
  pg_stat_activity.query_start
FROM pg_locks
JOIN pg_class ON pg_locks.relation = pg_class.oid
LEFT JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
WHERE pg_class.relname = 'orders'
  AND NOT pg_locks.granted;

-- ================================================================
-- 4. ПРОВЕРКА ИНДЕКСОВ
-- ================================================================
SELECT 
  indexname,
  indexdef,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE tablename = 'orders'
ORDER BY indexname;

-- ================================================================
-- 5. ТЕСТ ЗАПРОСА БЕЗ ПАРАМЕТРОВ (АДМИН)
-- ================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT DISTINCT rk 
FROM orders 
WHERE rk IS NOT NULL 
ORDER BY rk ASC;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT DISTINCT type_equipment 
FROM orders 
WHERE type_equipment IS NOT NULL 
ORDER BY type_equipment ASC;

-- ================================================================
-- 6. ТЕСТ ЗАПРОСА С ФИЛЬТРОМ ПО ГОРОДУ (ДИРЕКТОР)
-- ================================================================
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT DISTINCT rk 
FROM orders 
WHERE city = ANY(ARRAY['Москва']::text[]) 
  AND rk IS NOT NULL 
ORDER BY rk ASC;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT DISTINCT type_equipment 
FROM orders 
WHERE city = ANY(ARRAY['Москва']::text[]) 
  AND type_equipment IS NOT NULL 
ORDER BY type_equipment ASC;

-- ================================================================
-- 7. ПРОВЕРКА РАЗМЕРА ТАБЛИЦЫ И BLOAT
-- ================================================================
SELECT 
  pg_size_pretty(pg_total_relation_size('orders')) as total_size,
  pg_size_pretty(pg_relation_size('orders')) as table_size,
  pg_size_pretty(pg_total_relation_size('orders') - pg_relation_size('orders')) as indexes_size;

-- ================================================================
-- 8. ПРОВЕРКА ДОЛГИХ ЗАПРОСОВ
-- ================================================================
SELECT 
  pid,
  now() - query_start as duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- ================================================================
-- ВОЗМОЖНЫЕ ПРИЧИНЫ ПРИ 1500 ЗАКАЗАХ:
-- ================================================================
-- 1. Блокировки (другой запрос держит таблицу)
-- 2. Устаревшая статистика (нужен ANALYZE)
-- 3. Много dead tuples (нужен VACUUM)
-- 4. Медленный диск
-- 5. Проблема с сетью (задержка между приложением и БД)
-- 6. Connection pool exhausted
-- ================================================================

