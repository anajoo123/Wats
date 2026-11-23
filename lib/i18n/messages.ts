import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';

export type Locale = 'ar' | 'en';
export type Messages = typeof arMessages;

export const MESSAGES_BY_LOCALE: Record<Locale, Messages> = {
  ar: arMessages,
  en: enMessages,
};

export function formatLocalizedDateTime(iso: string, locale: Locale, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timeZone || 'UTC',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatLocalizedNumber(num: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(num);
}
