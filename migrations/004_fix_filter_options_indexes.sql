-- ================================================================
-- МИГРАЦИЯ: Оптимизация индексов для getFilterOptions
-- ================================================================
-- Проблема: SELECT DISTINCT по rk и type_equipment для директора
--           выполняется 5+ секунд из-за неправильного порядка индексов
--
-- Решение: Создать составные индексы (city, rk) и (city, type_equipment)
--          вместо (rk, city) и (type_equipment, city)
--
-- ✅ FIX #143: CREATE INDEX CONCURRENTLY нельзя выполнять в транзакции!
-- DROP INDEX выполняем в транзакции, CREATE INDEX — отдельно.
-- ================================================================

-- ================================================================
-- 1. ПРОВЕРКА СУЩЕСТВУЮЩИХ ИНДЕКСОВ
-- ================================================================

-- Смотрим какие индексы уже есть на таблице orders
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'orders' 
  AND (indexname LIKE '%rk%' OR indexname LIKE '%equipment%');

-- ================================================================
-- 2. УДАЛЕНИЕ СТАРЫХ НЕОПТИМАЛЬНЫХ ИНДЕКСОВ (в транзакции)
-- ================================================================
BEGIN;

-- Удаляем старые индексы с неправильным порядком колонок
DROP INDEX IF EXISTS idx_orders_rk_city;
DROP INDEX IF EXISTS idx_orders_equipment_city;

COMMIT;

-- ================================================================
-- 3. СОЗДАНИЕ ОПТИМИЗИРОВАННЫХ ИНДЕКСОВ ДЛЯ ДИРЕКТОРА
-- ================================================================
-- CONCURRENTLY выполняется вне транзакции!

-- Для запроса: SELECT DISTINCT rk FROM orders WHERE city = ANY(...) AND rk IS NOT NULL
-- Индекс должен быть (city, rk), потому что фильтр идет сначала по city
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_city_rk_director 
  ON orders(city, rk) 
  WHERE rk IS NOT NULL;

-- Для запроса: SELECT DISTINCT type_equipment FROM orders WHERE city = ANY(...) AND type_equipment IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_city_equipment_director 
  ON orders(city, type_equipment) 
  WHERE type_equipment IS NOT NULL;

-- ================================================================
-- 4. СОЗДАНИЕ ИНДЕКСОВ ДЛЯ МАСТЕРА
-- ================================================================

-- Для запроса: SELECT DISTINCT rk FROM orders WHERE master_id = X AND rk IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_master_rk 
  ON orders(master_id, rk) 
  WHERE master_id IS NOT NULL AND rk IS NOT NULL;

-- Для запроса: SELECT DISTINCT type_equipment FROM orders WHERE master_id = X AND type_equipment IS NOT NULL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_master_equipment 
  ON orders(master_id, type_equipment) 
  WHERE master_id IS NOT NULL AND type_equipment IS NOT NULL;

-- ================================================================
-- 5. ОБНОВЛЕНИЕ СТАТИСТИКИ
-- ================================================================

-- Обновляем статистику для планировщика запросов
ANALYZE orders;

-- ================================================================
-- 6. ПРОВЕРКА РЕЗУЛЬТАТА
-- ================================================================

-- Проверьте, что индексы созданы:
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE tablename = 'orders' 
  AND (indexname LIKE '%city_rk%' OR indexname LIKE '%city_equipment%' 
       OR indexname LIKE '%master_rk%' OR indexname LIKE '%master_equipment%')
ORDER BY indexname;

-- ================================================================
-- 7. ТЕСТОВЫЕ ЗАПРОСЫ
-- ================================================================

-- Тест 1: Запрос для директора (должен использовать idx_orders_city_rk_director)
EXPLAIN ANALYZE
SELECT DISTINCT rk 
FROM orders 
WHERE city = ANY(ARRAY['Москва', 'Санкт-Петербург']::text[]) 
  AND rk IS NOT NULL 
ORDER BY rk ASC;

-- Тест 2: Запрос для мастера (должен использовать idx_orders_master_rk)
EXPLAIN ANALYZE
SELECT DISTINCT rk 
FROM orders 
WHERE master_id = 1 
  AND rk IS NOT NULL 
ORDER BY rk ASC;

-- ================================================================
-- ОЖИДАЕМЫЙ РЕЗУЛЬТАТ
-- ================================================================
-- До миграции: 5000-10000ms (Full Table Scan)
-- После миграции: 10-50ms (Index Scan)
-- Ускорение: ~100-500x
-- ================================================================

