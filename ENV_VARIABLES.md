# Переменные окружения Orders Service

## Обязательные переменные

### DATABASE_URL
Строка подключения к PostgreSQL с настройками connection pool.

**Формат:**
```
postgresql://user:password@host:5432/database?connection_limit=20&pool_timeout=20
```

**Рекомендуемые параметры:**
- `connection_limit=20` - максимум соединений в пуле
- `pool_timeout=20` - таймаут ожидания соединения (секунды)

### JWT_SECRET
Секретный ключ для JWT токенов.

**Требования:**
- ✅ Минимум 32 символа
- ✅ Случайная строка (использовать генератор)
- ❌ Не использовать простые пароли

**Генерация:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### CORS_ORIGIN
Список разрешённых доменов для CORS (через запятую).

**Development:**
```
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

**Production:**
```
CORS_ORIGIN=https://app.example.com,https://admin.example.com
```

**⚠️ ВАЖНО:** Не оставляйте пустым в production!

### CASH_SERVICE_URL
URL для синхронизации с cash-service.

**Kubernetes:**
```
CASH_SERVICE_URL=http://cash-service.backend.svc.cluster.local:5006
```

**Docker Compose:**
```
CASH_SERVICE_URL=http://cash-service:5006
```

**Local:**
```
CASH_SERVICE_URL=http://localhost:5006
```

## Опциональные переменные

### PORT
Порт для запуска сервиса.
- Default: `5002`

### NODE_ENV
Режим работы приложения.
- Options: `development`, `production`, `test`
- Default: `development`

**Влияет на:**
- Swagger UI (отключен в production)
- Уровень логирования
- Мониторинг медленных запросов

### LOG_LEVEL
Уровень детализации логов.
- Options: `error`, `warn`, `log`, `debug`, `verbose`
- Default: `log`

### SENTRY_DSN
DSN для интеграции с Sentry (опционально).

## Пример конфигурации

### Development
```bash
DATABASE_URL=postgresql://orders_user:password@localhost:5432/orders_dev?connection_limit=10&pool_timeout=10
JWT_SECRET=dev-secret-key-min-32-characters-12345678
PORT=5002
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
CASH_SERVICE_URL=http://localhost:5006
LOG_LEVEL=debug
```

### Production
```bash
DATABASE_URL=postgresql://orders_user:strong_password@postgres.prod:5432/orders_prod?connection_limit=20&pool_timeout=20&sslmode=require
JWT_SECRET=<64-символьный случайный ключ>
PORT=5002
NODE_ENV=production
CORS_ORIGIN=https://app.company.com,https://admin.company.com
CASH_SERVICE_URL=http://cash-service.backend.svc.cluster.local:5006
LOG_LEVEL=warn
SENTRY_DSN=https://xxx@sentry.io/xxx
```

## Kubernetes ConfigMap/Secret

### ConfigMap (открытые настройки)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orders-service-config
data:
  PORT: "5002"
  NODE_ENV: "production"
  CORS_ORIGIN: "https://app.company.com"
  CASH_SERVICE_URL: "http://cash-service.backend.svc.cluster.local:5006"
  LOG_LEVEL: "warn"
```

### Secret (конфиденциальные настройки)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: orders-service-secret
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:pass@postgres:5432/db?connection_limit=20"
  JWT_SECRET: "<ваш-секретный-ключ>"
  SENTRY_DSN: "https://xxx@sentry.io/xxx"
```

## Docker Compose

```yaml
services:
  orders-service:
    image: orders-service:latest
    environment:
      - PORT=5002
      - NODE_ENV=production
      - CORS_ORIGIN=https://app.example.com
      - CASH_SERVICE_URL=http://cash-service:5006
      - LOG_LEVEL=info
    env_file:
      - .env.secret  # DATABASE_URL, JWT_SECRET
```

## Проверка конфигурации

При запуске сервис проверит:
- ✅ JWT_SECRET установлен и >= 32 символа
- ✅ DATABASE_URL корректный
- ✅ CORS_ORIGIN настроен (в production)

Если критичные переменные отсутствуют, сервис **не запустится** с ошибкой.

