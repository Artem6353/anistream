# Вход через Google и email: настройка Supabase Auth

Короткая инструкция: что нажать в Google Cloud Console и в панели Supabase, чтобы
вход работал. Код уже готов и ждёт только этих настроек.

---

## 1. Google Cloud Console (создать OAuth-клиент)

1. Откройте <https://console.cloud.google.com/> → сверху выберите проект
   (или **New Project**, имя любое, например `aninova`).
2. **APIs & Services → OAuth consent screen**:
   - **User type**: *External* → **Create**.
   - *App name*: `AniNova`, *User support email*: ваш email, *Developer contact*: ваш email.
   - **Scopes**: ничего добавлять не нужно (Supabase запрашивает `email` и `profile` сам).
   - **Test users**: пока приложение в режиме *Testing*, добавьте свой Google-аккаунт.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type**: *Web application*.
   - **Name**: `AniNova Web`.
   - **Authorized JavaScript origins**:
     ```
     https://aninova-catalog.vercel.app
     http://localhost:3000
     ```
   - **Authorized redirect URIs** (важно: именно адрес **Supabase**, не сайта):
     ```
     https://<ВАШ_PROJECT_REF>.supabase.co/auth/v1/callback
     ```
     Где `<ВАШ_PROJECT_REF>` — из Supabase → **Project Settings → General → Reference ID**
     (он же в `NEXT_PUBLIC_SUPABASE_URL`: `https://<ref>.supabase.co`).
   - **Create** → скопируйте **Client ID** и **Client secret**.

> Если свой домен: добавьте `https://ваш-домен` в origins, а redirect URI всё равно
> остаётся адресом Supabase.

---

## 2. Панель Supabase (включить провайдера)

1. Supabase Dashboard → ваш проект → **Authentication → Providers → Google**:
   - **Enable Google**: ON.
   - **Client ID (for OAuth)**: вставьте из Google.
   - **Client Secret (for OAuth)**: вставьте из Google.
   - **Save**.
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://aninova-catalog.vercel.app`
     (для локальной разработки можно `http://localhost:3000`).
   - **Redirect URLs** — добавьте обе строки:
     ```
     https://aninova-catalog.vercel.app/auth/callback
     http://localhost:3000/auth/callback
     ```
     Это адреса, куда Supabase вернёт код после Google. Приложение обменивает код на
     сессию на странице `/auth/callback`.
3. **Authentication → Sign In / Providers → Email** (для входа по email):
   - **Enable Email provider**: ON.
   - **Confirm email**: по желанию. Если включено, после регистрации человек получит
     письмо (в интерфейсе предусмотрен экран «Проверьте почту»). Если выключить — вход
     сразу, но почта не подтверждена.
4. **Authentication → Emails**: проверьте, что шаблоны не пустые (Supabase шлёт свои
   письма через встроенный сервис; на бесплатном тарифе лимит ~4 письма в час).

---

## 3. Переменные окружения

В панели **Vercel → Settings → Environment Variables** (и в `.env.local` для локалки):

| Переменная | Значение |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *anon public* ключ из **Project Settings → API** |
| `SUPABASE_SERVICE_KEY` | *service_role* ключ (только для серверных скриптов и синков, **никогда** не `NEXT_PUBLIC_`) |

После добавления/правки `NEXT_PUBLIC_*` нужен **Redeploy** — эти значения инлайнятся в
бандл на этапе сборки.

Проверка: `GET /api/health` → блок `config.flags` должен показать
`supabaseUrl: true`, `supabaseAnon: true`, `supabaseService: true`, а `config.warnings` — быть пустым.

---

## 4. Проверка, что всё работает

1. Откройте `/auth` в приватном окне → форма входа видна, ошибок в консоли нет.
2. Регистрация по email → если включено подтверждение, появится экран «Проверьте почту».
3. «Продолжить с Google» → выбор аккаунта → возврат на `/auth/callback` → редирект в `/profile`.
4. Пройдите на `/profile` в приватном окне **без входа** → должен быть редирект на
   `/auth?reason=protected&next=%2Fprofile`.
5. «Выйти» в кабинете → возврат на главную, `/profile` снова закрыт.

---

## Частые проблемы

| Симптом | Причина | Что делать |
| --- | --- | --- |
| `redirect_uri_mismatch` от Google | в Google Console не добавлен `https://<ref>.supabase.co/auth/v1/callback` | добавить точно этот URI |
| После Google возврат на `/auth` с `error=...` | в Supabase не включён провайдер Google или неверный Client Secret | Providers → Google → пересохранить |
| «Вход через Google не настроен в проекте Supabase» | Supabase вернул `Provider is not enabled` | включить провайдера |
| Регистрация проходит, но письмо не приходит | лимит писем Supabase / спам-фильтр | включить SMTP в **Authentication → Emails → SMTP** |
| `/profile` открывается, но пусто | нет строк в `profiles` (пользователь новый) | это норма: кабинет создаст профиль при сохранении настроек |
| Аватар не грузится | бакет `avatars` не создан | применить миграцию `supabase/migrations/004_profiles_storage.sql` |

---

## Что уже реализовано в коде

| Что | Где |
| --- | --- |
| Cookie-сессия Supabase (браузер + сервер) | `lib/supabase/browser.ts`, `lib/supabase/server.ts` |
| Обновление сессии и защита `/profile` | `lib/supabase/middleware.ts`, `proxy.ts` |
| Страница входа/регистрации + Google | `app/auth/page.tsx`, `components/auth/AuthPageClient.tsx` |
| Callback OAuth / подтверждение email | `app/auth/callback/page.tsx`, `components/pages/AuthCallbackPageClient.tsx` |
| Личный кабинет, списки, история, AniDNA | `app/profile/page.tsx`, `components/profile/dashboard/*` |
| Аватар в Storage + ник/био/тема | `components/profile/dashboard/AccountSettings.tsx` |
| Выход | `components/profile/dashboard/SignOutButton.tsx`, `app/api/auth/signout/route.ts` |
| Валидация и перевод ошибок Supabase | `lib/auth/validation.ts` |

Легаси-слой (`lib/sync.ts`, модалка входа) продолжает работать: после входа через
`/auth` токены зеркалируются, а модалка при входе, наоборот, поднимает cookie-сессию —
поэтому оба сценария ведут к одному состоянию «пользователь вошёл».
