import { createHmac, timingSafeEqual } from 'node:crypto';

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const HEADER = encode({ alg: 'HS256', typ: 'JWT' });
const SECONDS_PER_MILLISECOND = 1000;

export function createTokenService({
  secret,
  ttlSeconds = 3600,
  now = () => Date.now(),
}) {
  if (typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error('secret must be at least 32 characters');
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError('ttlSeconds must be a positive integer');
  }
  if (typeof now !== 'function') {
    throw new TypeError('now must be a function');
  }

  return {
    sign({ sub }) {
      if (typeof sub !== 'string' || sub.length === 0) {
        throw new TypeError('sub must be a non-empty string');
      }

      const iat = Math.floor(now() / SECONDS_PER_MILLISECOND);
      const exp = iat + ttlSeconds;
      const payloadB64 = encode({ sub, iat, exp });
      const signingInput = `${HEADER}.${payloadB64}`;
      const signatureB64 = createHmac('sha256', secret)
        .update(signingInput)
        .digest('base64url');

      return `${signingInput}.${signatureB64}`;
    },

    verify(token) {
      if (typeof token !== 'string') {
        return { ok: false, error: 'malformed' };
      }

      const parts = token.split('.');
      if (
        parts.length !== 3 ||
        parts.some((part) => part.length === 0) ||
        parts[0] !== HEADER
      ) {
        return { ok: false, error: 'malformed' };
      }

      const [headerB64, payloadB64, signatureB64] = parts;
      const signingInput = `${headerB64}.${payloadB64}`;
      const expectedSignature = createHmac('sha256', secret)
        .update(signingInput)
        .digest();
      const receivedSignature = Buffer.from(signatureB64, 'base64url');

      if (
        receivedSignature.toString('base64url') !== signatureB64 ||
        receivedSignature.byteLength !== expectedSignature.byteLength ||
        !timingSafeEqual(receivedSignature, expectedSignature)
      ) {
        return { ok: false, error: 'bad_signature' };
      }

      let payload;
      try {
        payload = JSON.parse(
          Buffer.from(payloadB64, 'base64url').toString('utf8'),
        );
      } catch {
        return { ok: false, error: 'malformed' };
      }

      if (
        payload === null ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0 ||
        !Number.isInteger(payload.exp)
      ) {
        return { ok: false, error: 'malformed' };
      }

      const currentTime = Math.floor(now() / SECONDS_PER_MILLISECOND);
      if (payload.exp <= currentTime) {
        return { ok: false, error: 'expired' };
      }

      return {
        ok: true,
        claims: {
          sub: payload.sub,
          iat: payload.iat,
          exp: payload.exp,
        },
      };
    },
  };
}
