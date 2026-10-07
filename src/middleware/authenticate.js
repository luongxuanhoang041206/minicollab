import { unauthorized } from '../core/errors.js';

const BEARER_PREFIX = /^Bearer\s+/i;
const MAX_AUTHORIZATION_LENGTH = 8_192;

function authError(code, message) {
  return unauthorized(code, message, {
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

export function authenticate({ tokens, users }) {
  if (!tokens || !users) {
    throw new TypeError('authenticate requires tokens and users');
  }

  return async function authenticateRequest(ctx, next) {
    ctx.state.user = null;
    const authorization = ctx.req.headers.authorization;

    if (authorization !== undefined) {
      if (
        typeof authorization !== 'string' ||
        authorization.length > MAX_AUTHORIZATION_LENGTH
      ) {
        throw authError('invalid_token', 'Token không hợp lệ');
      }

      const prefix = BEARER_PREFIX.exec(authorization);
      const token = prefix ? authorization.slice(prefix[0].length) : '';
      if (!prefix || token.length === 0 || /\s/.test(token)) {
        throw authError('invalid_token', 'Token không hợp lệ');
      }

      const verification = tokens.verify(token);
      if (!verification?.ok) {
        if (verification?.error === 'expired') {
          throw authError('token_expired', 'Token đã hết hạn');
        }
        throw authError('invalid_token', 'Token không hợp lệ');
      }

      const user = await users.findById(verification.claims.sub);
      if (!user) {
        throw authError('invalid_token', 'Token không hợp lệ');
      }

      ctx.state.user = { id: user.id, email: user.email };
      ctx.logger = ctx.logger.child({ userId: user.id });
    }

    await next();
  };
}

export function requireAuth(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError('requireAuth requires a handler');
  }

  return function requireAuthenticatedUser(ctx) {
    if (!ctx.state.user) {
      throw authError('unauthorized', 'Cần đăng nhập');
    }
    return handler(ctx);
  };
}
