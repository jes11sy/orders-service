-- Миграция для исправления полных URL в bsoDoc и expenditureDoc
-- Проблема: В БД сохранялись полные signed URLs вместо ключей
-- Решение: Извлечь только путь к файлу из URL

-- ✅ FIX #143: Обёртка в транзакцию для атомарности
BEGIN;

-- Функция для извлечения пути из URL
CREATE OR REPLACE FUNCTION extract_s3_key(url TEXT) RETURNS TEXT AS $$
BEGIN
  -- Если это уже ключ (не начинается с http), возвращаем как есть
  IF url NOT LIKE 'http%' THEN
    RETURN url;
  END IF;
  
  -- Извлекаем путь из URL разных форматов:
  -- 1. https://s3.timeweb.com/f7eead03-crmfiles/director/orders/bso_doc/xxx.jpg?params
  -- 2. https://f7eead03-crmfiles.s3.timeweb.com/director/orders/bso_doc/xxx.jpg?params
  -- 3. https://s3.twcstorage.ru/f7eead03-crmfiles/director/orders/bso_doc/xxx.jpg?params
  
  -- Удаляем query параметры (?X-Amz-...)
  url := split_part(url, '?', 1);
  
  -- Вариант 1: path-style (s3.timeweb.com/bucket/key)
  IF url LIKE '%s3.timeweb.com/f7eead03-crmfiles/%' THEN
    RETURN regexp_replace(url, '^https?://[^/]+/f7eead03-crmfiles/', '');
  END IF;
  
  -- Вариант 2: virtual-hosted-style (bucket.s3.timeweb.com/key)
  IF url LIKE '%f7eead03-crmfiles.s3.timeweb.com/%' THEN
    RETURN regexp_replace(url, '^https?://f7eead03-crmfiles\.s3\.timeweb\.com/', '');
  END IF;
  
  -- Вариант 3: старый домен (s3.twcstorage.ru/bucket/key)
  IF url LIKE '%s3.twcstorage.ru/f7eead03-crmfiles/%' THEN
    RETURN regexp_replace(url, '^https?://[^/]+/f7eead03-crmfiles/', '');
  END IF;
  
  -- Если не подходит ни один паттерн, возвращаем как есть
  RETURN url;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Обновляем bsoDoc
UPDATE "orders"
SET "bso_doc" = ARRAY(
  SELECT extract_s3_key(unnest("bso_doc"))
)
WHERE "bso_doc" IS NOT NULL 
  AND array_length("bso_doc", 1) > 0
  AND EXISTS (
    SELECT 1 FROM unnest("bso_doc") AS elem WHERE elem LIKE 'http%'
  );

-- Обновляем expenditureDoc
UPDATE "orders"
SET "expenditure_doc" = ARRAY(
  SELECT extract_s3_key(unnest("expenditure_doc"))
)
WHERE "expenditure_doc" IS NOT NULL 
  AND array_length("expenditure_doc", 1) > 0
  AND EXISTS (
    SELECT 1 FROM unnest("expenditure_doc") AS elem WHERE elem LIKE 'http%'
  );

-- Проверка результатов
DO $$
DECLARE
  bso_count INTEGER;
  exp_count INTEGER;
  bso_fixed INTEGER;
  exp_fixed INTEGER;
BEGIN
  -- Считаем общее количество записей с документами
  SELECT COUNT(*) INTO bso_count FROM "orders" WHERE array_length("bso_doc", 1) > 0;
  SELECT COUNT(*) INTO exp_count FROM "orders" WHERE array_length("expenditure_doc", 1) > 0;
  
  -- Считаем сколько еще осталось с URL (не должно быть)
  SELECT COUNT(*) INTO bso_fixed 
  FROM "orders" 
  WHERE "bso_doc" IS NOT NULL 
    AND array_length("bso_doc", 1) > 0
    AND EXISTS (SELECT 1 FROM unnest("bso_doc") AS elem WHERE elem LIKE 'http%');
    
  SELECT COUNT(*) INTO exp_fixed 
  FROM "orders" 
  WHERE "expenditure_doc" IS NOT NULL 
    AND array_length("expenditure_doc", 1) > 0
    AND EXISTS (SELECT 1 FROM unnest("expenditure_doc") AS elem WHERE elem LIKE 'http%');
  
  RAISE NOTICE '=== РЕЗУЛЬТАТЫ МИГРАЦИИ ===';
  RAISE NOTICE 'БСО документов всего: %', bso_count;
  RAISE NOTICE 'Документов расходов всего: %', exp_count;
  RAISE NOTICE 'БСО с URL (осталось): %', bso_fixed;
  RAISE NOTICE 'Расходов с URL (осталось): %', exp_fixed;
  
  IF bso_fixed > 0 OR exp_fixed > 0 THEN
    RAISE WARNING 'Внимание! Остались записи с URL. Проверьте функцию extract_s3_key()';
  ELSE
    RAISE NOTICE '✅ Все URL успешно конвертированы в ключи!';
  END IF;
END $$;

-- Удаляем функцию (больше не нужна)
DROP FUNCTION IF EXISTS extract_s3_key(TEXT);

-- Добавляем комментарий
COMMENT ON COLUMN "orders"."bso_doc" IS 'Массив КЛЮЧЕЙ файлов БСО (НЕ URL!). Формат: director/orders/bso_doc/xxx.jpg';
COMMENT ON COLUMN "orders"."expenditure_doc" IS 'Массив КЛЮЧЕЙ файлов расходов (НЕ URL!). Формат: director/orders/expenditure_doc/xxx.jpg';

-- ✅ FIX #143: Завершение транзакции
COMMIT;

