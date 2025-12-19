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
  ENABLE_COOKIE_SIGNING: true,                // Подпись cookies для защиты от tampering
  COOKIE_SECRET: process.env.COOKIE_SECRET || process.env.JWT_SECRET,
} as const;

/**
 * Проверяет, следует ли использовать cookies вместо JSON токенов
 */
export function shouldUseCookies(headers: any): boolean {
  return headers?.[CookieConfig.USE_COOKIES_HEADER] === 'true';
}

