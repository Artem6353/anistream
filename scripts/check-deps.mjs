/* Единый предохранитель pre-скриптов (predev/prestart/prewarm/prehydrate):
   без node_modules команды next не существует — понятная ошибка вместо «не является
   внутренней или внешней командой». Аудит 30.09 (стиль-9): четыре копии инлайн-кода
   в package.json заменены одним скриптом. */
import { existsSync } from 'node:fs';

if (!existsSync('node_modules/next')) {
  console.error('\n✗ Нет node_modules. Сначала выполните:  npm install\n');
  process.exit(1);
}
