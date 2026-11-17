import { monthLabelFor } from '@two-cents/shared/domain';

/** "Novembre 2026" for a budget month (research R1), in the person's language. */
export function monthTitle(period: { start: string; end: string }, language: string): string {
  const { year, month } = monthLabelFor(period);
  const text = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
