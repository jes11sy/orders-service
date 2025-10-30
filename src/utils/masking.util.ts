/**
 * Утилиты для маскирования конфиденциальных данных в логах
 */

export function maskPhone(phone: string | undefined | null): string {
  if (!phone) return '[EMPTY]';
  if (phone.length < 4) return '***';
  return phone.slice(0, 2) + '***' + phone.slice(-2);
}

export function maskAddress(address: string | undefined | null): string {
  if (!address) return '[EMPTY]';
  if (address.length < 10) return '***';
  return address.slice(0, 5) + '...' + address.slice(-3);
}

export function maskName(name: string | undefined | null): string {
  if (!name) return '[EMPTY]';
  const parts = name.split(' ');
  if (parts.length === 1) {
    return parts[0][0] + '***';
  }
  return parts.map(part => part[0] + '*'.repeat(Math.max(0, part.length - 1))).join(' ');
}

export function maskToken(token: string | undefined | null): string {
  if (!token) return '[NO TOKEN]';
  if (token.length < 20) return '***';
  return token.slice(0, 10) + '...[MASKED]...' + token.slice(-5);
}

/**
 * Маскирует объект для безопасного логирования
 */
export function maskSensitiveData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const masked = { ...data };

  // Поля, которые нужно маскировать
  if (masked.phone) masked.phone = maskPhone(masked.phone);
  if (masked.phoneClient) masked.phoneClient = maskPhone(masked.phoneClient);
  if (masked.address) masked.address = maskAddress(masked.address);
  if (masked.clientName) masked.clientName = maskName(masked.clientName);
  if (masked.name) masked.name = maskName(masked.name);
  
  // Удаляем токены полностью из логов
  if (masked.authorization) masked.authorization = '[MASKED]';
  if (masked.Authorization) masked.Authorization = '[MASKED]';
  if (masked.password) masked.password = '[MASKED]';
  if (masked.token) masked.token = '[MASKED]';

  return masked;
}

/**
 * Получает только названия полей для логирования вместо значений
 */
export function getFieldNames(data: any): string[] {
  if (!data || typeof data !== 'object') return [];
  return Object.keys(data);
}

