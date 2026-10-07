export function accessLog() {
  return async function accessLogMiddleware(ctx, next) {
    const start = process.hrtime.bigint();
    let finished = false;

    const fields = () => ({
      method: ctx.req.method,
      path: ctx.url.pathname,
      status: ctx.res.statusCode,
      ms: Number(process.hrtime.bigint() - start) / 1e6,
      requestId: ctx.requestId,
    });

    ctx.res.once('finish', () => {
      finished = true;
      const status = ctx.res.statusCode;
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      ctx.logger[level]('access_log', fields());
    });

    ctx.res.once('close', () => {
      if (!finished) {
        ctx.logger.warn('aborted', fields());
      }
    });

    await next();
  };
}