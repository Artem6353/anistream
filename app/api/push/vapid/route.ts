import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import webpush from 'web-push';
import { log } from '@/lib/logger';

const FILE = 'data/vapid.json';

/** Ключи, сгенерированные в этом инстансе (read-only ФС): не логируем их повторно. */
let ephemeralWarned = false;

export async function GET() {
  let keys: { publicKey: string; privateKey: string };
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
    keys = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  } else {
    try {
      keys = JSON.parse(await fs.readFile(FILE, 'utf8')) as { publicKey: string; privateKey: string };
    } catch {
      keys = webpush.generateVAPIDKeys();
      /* Аудит 30.09 (P1-12): на read-only ФС (serverless) запись невозможна —
         не роняем роут, ключи живут до конца инстанса.
         Аудит (P2-15): такое поведение НЕЛЬЗЯ делать незаметным: у каждого
         холодного старта новые ключи, и уже сохранённые подписки перестают
         проверяться (push молча не доставляется). Поэтому — явный warn в логах;
         штатное решение — задать VAPID_PUBLIC/VAPID_PRIVATE (buildtime env). */
      try {
        await fs.mkdir('data', { recursive: true });
        await fs.writeFile(FILE, JSON.stringify(keys));
      } catch {
        if (!ephemeralWarned) {
          ephemeralWarned = true;
          log('warn', 'VAPID keys are ephemeral: задайте VAPID_PUBLIC/VAPID_PRIVATE, иначе подписки теряются после рестарта');
        }
      }
    }
  }
  /* Публичный ключ не кэшируем: при эфемерных ключах CDN-копия рассинхронизирует подписки. */
  return NextResponse.json({ publicKey: keys.publicKey }, { headers: { 'Cache-Control': 'no-store' } });
}
