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
      await fs.mkdir('data', { recursive: true });
      await fs.writeFile(FILE, JSON.stringify(keys));
    }
  }
  return NextResponse.json({ publicKey: keys.publicKey });
}
