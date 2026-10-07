import {
  randomBytes,
  scrypt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const DEFAULTS = { N: 16_384, r: 8, p: 1, keylen: 64 };
const MAX_SALT_BYTES = 64;
const MAX_HASH_BYTES = 128;
const MAX_STORED_N = 65_536;
const MAX_STORED_R = 16;
const MAX_STORED_P = 4;

export function createPasswordHasher({
  N = DEFAULTS.N,
  r = DEFAULTS.r,
  p = DEFAULTS.p,
  keylen = DEFAULTS.keylen,
  mode = 'async',
} = {}) {
  if (
    !Number.isSafeInteger(N) ||
    N < 2 ||
    N > MAX_STORED_N ||
    (N & (N - 1)) !== 0
  ) {
    throw new RangeError(`N must be a power of two from 2 to ${MAX_STORED_N}`);
  }
  if (!Number.isSafeInteger(r) || r < 1 || r > MAX_STORED_R) {
    throw new RangeError(`r must be between 1 and ${MAX_STORED_R}`);
  }
  if (!Number.isSafeInteger(p) || p < 1 || p > MAX_STORED_P) {
    throw new RangeError(`p must be between 1 and ${MAX_STORED_P}`);
  }
  if (!Number.isSafeInteger(keylen) || keylen < 1 || keylen > MAX_HASH_BYTES) {
    throw new RangeError(`keylen must be between 1 and ${MAX_HASH_BYTES}`);
  }
  if (mode !== 'async' && mode !== 'sync') {
    throw new TypeError('mode must be "async" or "sync"');
  }

  const deriveKey = (password, salt, length, params) =>
    mode === 'sync'
      ? Promise.resolve(scryptSync(password, salt, length, params))
      : scryptAsync(password, salt, length, params);

  return {
    async hash(password) {
      if (typeof password !== 'string') {
        throw new TypeError('password must be a string');
      }
      const salt = randomBytes(16);
      const key = await deriveKey(
        password,
        salt,
        keylen,
        scryptOptions(N, r, p),
      );
      return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
    },

    async verify(password, encodedHash) {
      if (typeof password !== 'string' || typeof encodedHash !== 'string') {
        return false;
      }

      const parts = encodedHash.split('$');
      if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

      const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
      if (![rawN, rawR, rawP].every((value) => /^\d+$/.test(value))) {
        return false;
      }

      const storedN = Number(rawN);
      const storedR = Number(rawR);
      const storedP = Number(rawP);
      if (
        !Number.isSafeInteger(storedN) ||
        storedN < 2 ||
        storedN > MAX_STORED_N ||
        (storedN & (storedN - 1)) !== 0 ||
        !Number.isSafeInteger(storedR) ||
        storedR < 1 ||
        storedR > MAX_STORED_R ||
        !Number.isSafeInteger(storedP) ||
        storedP < 1 ||
        storedP > MAX_STORED_P
      ) {
        return false;
      }

      const salt = decodeCanonicalBase64(rawSalt);
      const expectedKey = decodeCanonicalBase64(rawKey);
      if (
        !salt ||
        salt.length === 0 ||
        salt.length > MAX_SALT_BYTES ||
        !expectedKey ||
        expectedKey.length === 0 ||
        expectedKey.length > MAX_HASH_BYTES
      ) {
        return false;
      }

      const actualKey = await deriveKey(password, salt, expectedKey.length, {
        ...scryptOptions(storedN, storedR, storedP),
      });
      return (
        actualKey.length === expectedKey.length &&
        timingSafeEqual(actualKey, expectedKey)
      );
    },
  };
}

export const createPaswordHasher = createPasswordHasher;

function scryptOptions(N, r, p) {
  return {
    N,
    r,
    p,
    maxmem: Math.max(32 * 1024 * 1024, 128 * N * r + 128 * r * p + 1024 * 1024),
  };
}

function decodeCanonicalBase64(value) {
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.toString('base64') === value ? decoded : null;
  } catch {
    return null;
  }
}
