/**
 * 🍪 COOKIE CONFIGURATION
 * Общая конфигурация для httpOnly cookies для защиты от XSS атак
 */

export const CookieConfig = {
  // Имена cookies (без __Host- префикса для cross-domain работы)
  ACCESS_TOKEN_NAME: 'access_token',
  REFRESH_TOKEN_NAME: 'refresh_token',
  
  // Опции cookie
  COOKIE_OPTIONS: {
    httpOnly: true,                           // ✅ Защита от XSS - недоступен из JavaScript
    secure: process.env.NODE_ENV === 'production', // ✅ HTTPS только в production
    sameSite: 'none' as const,                // ✅ Защита от CSRF (None - для cross-domain)
    path: '/',                                // Доступен на всех путях
    domain: '.lead-schem.ru',                 // Cross-domain для api.lead-schem.ru и core.lead-schem.ru
  },
  
  // Время жизни cookies
  ACCESS_TOKEN_MAX_AGE: 15 * 60 * 1000,       // 15 минут
  REFRESH_TOKEN_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 дней
  
  // Header для переключения в cookie mode
  USE_COOKIES_HEADER: 'x-use-cookies',
  
  // Подпись cookies
  // ⚠️ ОТКЛЮЧЕНО: JWT уже подписан, дополнительная подпись cookie избыточна
  ENABLE_COOKIE_SIGNING: false,
  COOKIE_SECRET: process.env.COOKIE_SECRET || process.env.JWT_SECRET,
} as const;

/**
 * Проверяет, следует ли использовать cookies вместо JSON токенов
 */
export function shouldUseCookies(headers: any): boolean {
  return headers?.[CookieConfig.USE_COOKIES_HEADER] === 'true';
}

/**
 * Получает уникальное имя cookie на основе origin для изоляции между фронтендами
 * Примеры:
 * - lead-schem.ru → access_token_masters (основной домен для мастеров)
 * - core.lead-schem.ru → access_token_core
 * - new.lead-schem.ru → access_token_new
 * - callcentre.lead-schem.ru → access_token_callcentre
 */
export function getCookieName(baseName: string, origin?: string): string {
  if (!origin) {
    return baseName;
  }
  
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    
    // Особый случай: основной домен lead-schem.ru (без поддомена) → для мастеров
    if (hostname === 'lead-schem.ru') {
      return `${baseName}_masters`;
    }
    
    // Извлекаем поддомен (core, new, callcentre, api и т.д.)
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const subdomain = parts[0];
      return `${baseName}_${subdomain}`;
    }
  } catch (err) {
    // Если ошибка парсинга, используем базовое имя
  }
  
  return baseName;
}

