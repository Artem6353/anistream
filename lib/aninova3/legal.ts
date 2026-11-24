import { getProvidersConfig } from '@/lib/config/providers.config';

/** B2-D: контакты юридических страниц preview. Домен берём из того же
 *  конфига, что production; выдуманных адресов нет. */
export function legalContact(kind: 'privacy' | 'legal' | 'dmca'): string {
  const url = getProvidersConfig().site.url;
  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const ok = domain.includes('.') && !domain.startsWith('localhost') && !domain.startsWith('127.');
  return `${kind}@${ok ? domain : 'example.com'}`;
}
