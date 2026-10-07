import { badRequest, HttpError, unauthorized } from '../core/errors.js';
import { DuplicateEmailError } from '../storage/memory-users.js';
import { publicUser } from './public-user.js';

function readCredentials(body) {
  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw badRequest(
      'validation_failed',
      undefined,
      { details: { body: 'Phải là một object JSON' } },
    );
  }

  const problems = {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = body.password;

  if (!email) {
    problems.email = 'Email không được để trống';
  } else if (email.length > 254) {
    problems.email = 'Email không được dài quá 254 ký tự';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.email = 'Email không hợp lệ';
  }

  if (typeof password !== 'string') {
    problems.password = 'Password phải là chuỗi';
  } else if (password.length < 8 || password.length > 256) {
    problems.password = 'Password phải có từ 8 đến 256 ký tự';
  }

  if (Object.keys(problems).length > 0) {
    throw badRequest('validation_failed', undefined, { details: problems });
  }

  return { email, password };
}

export function createAuthHandlers({ users, hasher, tokens, ttlSeconds }) {
  if (!users || !hasher || !tokens) {
    throw new TypeError('Auth handlers require users, hasher, and tokens');
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError('ttlSeconds must be a positive integer');
  }

  const dummyPasswordHash = hasher.hash('minicollab-dummy-password');

  async function register(ctx) {
    const { email, password } = readCredentials(ctx.body);
    const passwordHash = await hasher.hash(password);

    let user;
    try {
      user = await users.create({ email, passwordHash });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw new HttpError(409, 'email_already_exists');
      }
      throw error;
    }

    ctx.json(201, { user: publicUser(user) });
  }

  async function login(ctx) {
    const { email, password } = readCredentials(ctx.body);
    const user = await users.findByEmail(email);
    const passwordHash = user
      ? user.passwordHash
      : await dummyPasswordHash;
    const passwordValid = await hasher.verify(password, passwordHash);

    if (!user || !passwordValid) {
      throw unauthorized(
        'invalid_credentials',
        'Email hoặc mật khẩu không đúng',
      );
    }

    const token = tokens.sign({ sub: user.id });
    ctx.res.setHeader('Cache-Control', 'no-store');
    ctx.json(200, {
      token,
      tokenType: 'Bearer',
      expiresIn: ttlSeconds,
    });
  }

  async function me(ctx) {
    ctx.json(200, { user: publicUser(ctx.state.user) });
  }

  return { register, login, me };
}
