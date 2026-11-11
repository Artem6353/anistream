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
      /* Аудит 2026-11-12: на serverless эфемерные ключи = сломанные подписки —
         браузер подписывался ключом инстанса A, рассылка (send-push.mjs) уходит
         env-ключами → VAPID mismatch, все пуши отбиваются. В проде fail-closed. */
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'push not configured: задай VAPID_PUBLIC и VAPID_PRIVATE (node scripts/send-push.mjs --gen-vapid)' },
          { status: 503 },
        );
      }
      keys = webpush.generateVAPIDKeys();
      try {
        await fs.mkdir('data', { recursive: true });
        await fs.writeFile(FILE, JSON.stringify(keys));
      } catch {}
    }
  }
  return NextResponse.json({ publicKey: keys.publicKey });
}
