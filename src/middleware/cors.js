const ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOW_HEADERS = 'Content-Type, Authorization, X-Request-Id';

export function cors({ origins = [] } = {}) {
  const allowedOrigins = new Set(origins);

  return async function corsMiddleware(ctx, next) {
    const origin = ctx.req.headers.origin;
    if (typeof origin === 'string' && allowedOrigins.has(origin)) {
      ctx.res.setHeader('Access-Control-Allow-Origin', origin);
      ctx.res.setHeader('Vary', 'Origin');

      if (
        ctx.req.method === 'OPTIONS' &&
        ctx.req.headers['access-control-request-method']
      ) {
        ctx.res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
        ctx.res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
        ctx.res.writeHead(204);
        ctx.res.end();
        return;
      }
    }

    await next();
  };
}