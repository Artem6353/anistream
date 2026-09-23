import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Политика конфиденциальности', robots: { index: false } };

// Контакт берётся из NEXT_PUBLIC_SITE_URL (privacy@ваш-домен).
// TODO(домен): пока NEXT_PUBLIC_SITE_URL не задан — плейсхолдер example.com; замените при деплое.
function contactEmail(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? '';
  const domain = url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const ok = domain.includes('.') && !domain.startsWith('localhost') && !domain.startsWith('127.');
  return `privacy@${ok ? domain : 'example.com'}`;
}

export default function PrivacyPage() {
  const contact = contactEmail();
  return (

    <div className="container legal">
      <h1>Политика конфиденциальности</h1>
      <p>
        Мы собираем минимум данных: технические логи запросов (IP, user-agent) для защиты от abuse; локальные
        данные браузера (localStorage) хранят ваши списки, историю и настройки — они не покидают ваше устройство,
        пока вы не включите синхронизацию через Supabase; отзывы и комментарии, оставленные в общем режиме,
        сохраняются вместе с указанным вами именем.
      </p>
      <p>
        Данные используются только для работы сайта: персональные рекомендации, продолжение просмотра, модерация.
        Мы не продаём данные и не передаём их третьим лицам, кроме хостинг-провайдера и Supabase (если включена
        синхронизация). Удаление: очистите localStorage кнопкой «Удалить всё» в настройках или напишите на
        {contact} — отзывы будут удалены вручную в течение 72 часов.
      </p>
      <p>Cookie используются только для служебных целей (язык, согласие на cookie, сессия администратора).</p>
    </div>
  );
}
