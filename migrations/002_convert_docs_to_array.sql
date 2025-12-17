-- Миграция для преобразования полей документов из String в String[]
-- Это позволит хранить несколько файлов для каждого типа документа

-- Шаг 1: Создаем временные колонки для массивов
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bso_doc_temp" TEXT[];
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "expenditure_doc_temp" TEXT[];

-- Шаг 2: Мигрируем существующие данные
-- Если поле содержит JSON-массив, парсим его
-- Если содержит одну строку, создаем массив из одного элемента
-- Если NULL, оставляем пустой массив

UPDATE "orders"
SET "bso_doc_temp" = CASE
  -- Если поле NULL или пустое, создаем пустой массив
  WHEN "bso_doc" IS NULL OR "bso_doc" = '' THEN ARRAY[]::TEXT[]
  -- Если начинается с '[', пытаемся распарсить как JSON
  WHEN "bso_doc" LIKE '[%' THEN 
    CASE 
      WHEN jsonb_typeof("bso_doc"::jsonb) = 'array' THEN 
        ARRAY(SELECT jsonb_array_elements_text("bso_doc"::jsonb))
      ELSE ARRAY["bso_doc"]
    END
  -- Если содержит запятую, разделяем
  WHEN "bso_doc" LIKE '%,%' THEN 
    string_to_array("bso_doc", ',')
  -- Иначе создаем массив из одного элемента
  ELSE ARRAY["bso_doc"]
END;

UPDATE "orders"
SET "expenditure_doc_temp" = CASE
  WHEN "expenditure_doc" IS NULL OR "expenditure_doc" = '' THEN ARRAY[]::TEXT[]
  WHEN "expenditure_doc" LIKE '[%' THEN 
    CASE 
      WHEN jsonb_typeof("expenditure_doc"::jsonb) = 'array' THEN 
        ARRAY(SELECT jsonb_array_elements_text("expenditure_doc"::jsonb))
      ELSE ARRAY["expenditure_doc"]
    END
  WHEN "expenditure_doc" LIKE '%,%' THEN 
    string_to_array("expenditure_doc", ',')
  ELSE ARRAY["expenditure_doc"]
END;

-- Шаг 3: Удаляем старые колонки
ALTER TABLE "orders" DROP COLUMN "bso_doc";
ALTER TABLE "orders" DROP COLUMN "expenditure_doc";

-- Шаг 4: Переименовываем временные колонки
ALTER TABLE "orders" RENAME COLUMN "bso_doc_temp" TO "bso_doc";
ALTER TABLE "orders" RENAME COLUMN "expenditure_doc_temp" TO "expenditure_doc";

-- Шаг 5: Устанавливаем значения по умолчанию для новых записей
ALTER TABLE "orders" ALTER COLUMN "bso_doc" SET DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "orders" ALTER COLUMN "expenditure_doc" SET DEFAULT ARRAY[]::TEXT[];

-- Шаг 6: Убираем NULL значения, заменяем на пустые массивы
UPDATE "orders" SET "bso_doc" = ARRAY[]::TEXT[] WHERE "bso_doc" IS NULL;
UPDATE "orders" SET "expenditure_doc" = ARRAY[]::TEXT[] WHERE "expenditure_doc" IS NULL;

-- Шаг 7: Делаем колонки NOT NULL
ALTER TABLE "orders" ALTER COLUMN "bso_doc" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "expenditure_doc" SET NOT NULL;

-- Индексы для работы с массивами (опционально, для поиска по путям файлов)
CREATE INDEX IF NOT EXISTS "orders_bso_doc_gin_idx" ON "orders" USING GIN ("bso_doc");
CREATE INDEX IF NOT EXISTS "orders_expenditure_doc_gin_idx" ON "orders" USING GIN ("expenditure_doc");

-- Комментарии для документации
COMMENT ON COLUMN "orders"."bso_doc" IS 'Массив путей к файлам БСО документов (до 10 файлов)';
COMMENT ON COLUMN "orders"."expenditure_doc" IS 'Массив путей к файлам документов расходов (до 10 файлов)';

