import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import webpush from 'web-push';

const FILE = 'data/vapid.json';

export async function GET() {
  let keys: { publicKey: string; privateKey: string };
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
    keys = { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  } else {
    try {
      keys = JSON.parse(await fs.readFile(FILE, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      /* Аудит 30.09 (P1-12): на read-only ФС (serverless) запись невозможна —
         не роняем роут, ключи живут до конца инстанса. Проду рекомендуется
         задать VAPID_PUBLIC/VAPID_PRIVATE явно (scripts/send-push.mjs --gen-vapid). */
      try {
        await fs.mkdir('data', { recursive: true });
        await fs.writeFile(FILE, JSON.stringify(keys));
      } catch {}
    }
  }
  return NextResponse.json({ publicKey: keys.publicKey });
}
