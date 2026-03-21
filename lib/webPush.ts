// lib/webPush.ts
// Sends Web Push notifications using VAPID, implemented with Node.js built-in
// crypto — no web-push npm package required.
//
// Required env vars:
//   VAPID_PUBLIC_KEY      — base64url EC P-256 public key (65 raw bytes)
//   VAPID_PRIVATE_KEY     — base64url EC P-256 private key (32 raw bytes)
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY — same as VAPID_PUBLIC_KEY (exposed to client)
//   VAPID_SUBJECT         — mailto: or https: URI identifying the sender
//
// Generate once:
//   node -e "
//     const { generateKeyPairSync } = require('crypto');
//     const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
//     const pub = publicKey.export({ type: 'spki', format: 'der' });
//     const priv = privateKey.export({ type: 'sec1', format: 'der' });
//     console.log('VAPID_PUBLIC_KEY=' + pub.slice(-65).toString('base64url'));
//     console.log('VAPID_PRIVATE_KEY=' + priv.slice(7, 39).toString('base64url'));
//   "

import { createSign, createCipheriv, randomBytes, createECDH } from 'crypto'
import { createSupabaseAdminClient } from './supabase/admin'

export type PushSubscription = {
  endpoint: string;
  p256dh: string;  // base64url
  auth: string;    // base64url
};

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

// ── Env validation ────────────────────────────────────────────────────────────

function getEnv() {
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub  = process.env.VAPID_SUBJECT ?? 'mailto:admin@jabumarket.com';
  if (!pub || !priv) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set');
  return { pub, priv, sub };
}

// ── Base64url helpers ─────────────────────────────────────────────────────────

function b64uDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function b64uEncode(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── VAPID JWT ─────────────────────────────────────────────────────────────────
// Produces the Authorization header value for a push request.

function buildVapidJwt(endpoint: string, pub: string, priv: string, sub: string): string {
  const origin = new URL(endpoint).origin;
  const exp    = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h

  const header  = b64uEncode(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64uEncode(Buffer.from(JSON.stringify({ aud: origin, exp, sub })));
  const unsigned = `${header}.${payload}`;

  // Import private key from raw 32-byte EC P-256 scalar (sec1 der wrapper)
  // Node createSign with 'ES256' needs the key in PEM or DER
  const privRaw = b64uDecode(priv);

  // Construct minimal SEC1 DER for EC P-256 private key
  // SEQUENCE { INTEGER 1, OCTET STRING(privRaw), [0] OID P-256, [1] pubkey }
  const oid   = Buffer.from('06082a8648ce3d030107', 'hex'); // P-256 OID
  const pubRaw = b64uDecode(pub); // 65-byte uncompressed point

  const ecPriv = Buffer.concat([
    Buffer.from('3079', 'hex'),                                      // SEQUENCE (length 121)
    Buffer.from('020101', 'hex'),                                    // INTEGER 1
    Buffer.from('0420', 'hex'), privRaw,                             // OCTET STRING 32
    Buffer.from('a00a', 'hex'), Buffer.from('0608', 'hex'), oid.slice(2), // [0] OID
    Buffer.from('a144034200', 'hex'), pubRaw,                        // [1] BIT STRING (length 66: 1 unused-bits byte + 65 key bytes)
  ]);

  const pem = `-----BEGIN EC PRIVATE KEY-----\n${ecPriv.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END EC PRIVATE KEY-----`;

  const sign = createSign('SHA256');
  sign.update(unsigned);
  const derSig = sign.sign(pem);

  // DER → raw r||s (64 bytes) for JWT ES256
  let offset = 2; // skip SEQUENCE tag + length
  if (derSig[1] > 0x80) offset += derSig[1] - 0x80;
  offset++; // skip INTEGER tag
  const rLen = derSig[offset++];
  const r = derSig.slice(offset + (rLen > 32 ? rLen - 32 : 0), offset + rLen);
  offset += rLen;
  offset++; // skip INTEGER tag
  const sLen = derSig[offset++];
  const s = derSig.slice(offset + (sLen > 32 ? sLen - 32 : 0), offset + sLen);

  const rawSig = Buffer.concat([r.length < 32 ? Buffer.concat([Buffer.alloc(32 - r.length), r]) : r,
                                 s.length < 32 ? Buffer.concat([Buffer.alloc(32 - s.length), s]) : s]);

  return `${unsigned}.${b64uEncode(rawSig)}`;
}

// ── Message encryption (RFC 8291 — ECDH + AES-GCM) ───────────────────────────

function encryptPayload(subscription: PushSubscription, body: string): {
  ciphertext: Buffer; salt: Buffer; serverPublicKey: Buffer;
} {
  const salt          = randomBytes(16);
  const serverECDH    = createECDH('prime256v1');
  serverECDH.generateKeys();
  const serverPub     = serverECDH.getPublicKey();           // 65 bytes
  const clientPub     = b64uDecode(subscription.p256dh);    // 65 bytes
  const authSecret    = b64uDecode(subscription.auth);      // 16 bytes

  const sharedSecret  = serverECDH.computeSecret(clientPub);

  // HKDF-SHA256 key derivation (RFC 8291 §3.3)
  function hkdf(key: Buffer, info: Buffer, salt2: Buffer, len: number): Buffer {
    // Extract
    const { createHmac } = require('crypto');
    const prk = createHmac('sha256', salt2).update(key).digest();
    // Expand
    const out: Buffer[] = [];
    let prev = Buffer.alloc(0);
    let bytesLeft = len;
    let i = 1;
    while (bytesLeft > 0) {
      prev = createHmac('sha256', prk).update(Buffer.concat([prev, info, Buffer.from([i++])])).digest();
      out.push(prev);
      bytesLeft -= prev.length;
    }
    return Buffer.concat(out).slice(0, len);
  }

  const authInfo     = Buffer.from('WebPush: info\x00');
  const prk          = hkdf(sharedSecret, Buffer.concat([authInfo, clientPub, serverPub]), authSecret, 32);

  const cekInfo      = Buffer.from('Content-Encoding: aes128gcm\x00');
  const nonceInfo    = Buffer.from('Content-Encoding: nonce\x00');

  const cek          = hkdf(prk, cekInfo, salt, 16);
  const nonce        = hkdf(prk, nonceInfo, salt, 12);

  // Encrypt: plaintext + padding byte 0x02
  const plaintext    = Buffer.concat([Buffer.from(body), Buffer.from([0x02])]);
  const cipher       = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted    = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  return { ciphertext: encrypted, salt, serverPublicKey: serverPub };
}

// ── RFC 8291 Content-Encoding: aes128gcm header ──────────────────────────────

function buildContentHeader(salt: Buffer, serverPublicKey: Buffer): Buffer {
  const recordSize  = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const keyLen      = Buffer.from([serverPublicKey.length]);
  return Buffer.concat([salt, recordSize, keyLen, serverPublicKey]);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a Web Push notification.
 * Returns true on success, false on failure (bad subscription, gone, etc.).
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<boolean> {
  try {
    const { pub, priv, sub } = getEnv();

    const body   = JSON.stringify(payload);
    const { ciphertext, salt, serverPublicKey } = encryptPayload(subscription, body);
    const header = buildContentHeader(salt, serverPublicKey);
    const content = Buffer.concat([header, ciphertext]);

    const jwt     = buildVapidJwt(subscription.endpoint, pub, priv, sub);
    const vapidPub = b64uEncode(b64uDecode(pub)); // normalise

    const res = await fetch(subscription.endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':     'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL':              '86400',
        'Authorization':    `vapid t=${jwt},k=${vapidPub}`,
      },
      body: content,
    });

    // 201 Created = delivered. 410 Gone / 404 = subscription expired → caller should delete.
    if (res.status === 410 || res.status === 404) return false;
    return res.ok || res.status === 201;
  } catch (err) {
    console.error('[webPush] sendPush error:', err)
    return false
  }
}

/**
 * Send a Web Push notification to all devices of a given user.
 * Automatically removes expired subscriptions (410/404 responses).
 * Never throws — push is fire-and-forget.
 */
export async function sendUserPush(
  userId: string,
  payload: PushPayload & { tag?: string; href?: string }
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient()
    const { data: subs } = await admin
      .from('user_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (!subs?.length) return

    const results = await Promise.allSettled(
      subs.map(sub =>
        sendPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { ...payload, data: { href: payload.href ?? '/', tag: payload.tag } }
        )
      )
    )

    // Remove expired subscriptions (sendPush returns false for 410/404)
    const expired = subs.filter((_, i) => {
      const r = results[i]
      return r.status === 'fulfilled' && r.value === false
    })

    if (expired.length) {
      await admin
        .from('user_push_subscriptions')
        .delete()
        .in('endpoint', expired.map(s => s.endpoint))
    }
  } catch {
    // Never throw — push is fire-and-forget
  }
}