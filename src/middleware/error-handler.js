import { HttpError } from '../core/errors.js';

export function errorHandler() {
  return async function handleErrors(ctx, next) {
    try {
      await next();
    } catch (err) {
      if (ctx.res.headersSent) {
        ctx.logger.error('response_failed_after_headers', {
          err: String(err?.stack ?? err),
        });
        ctx.res.destroy();
        return;
      }

      if (err instanceof HttpError) {
        for (const [name, value] of Object.entries(err.headers ?? {})) {
          ctx.res.setHeader(name, value);
        }
        const error = { code: err.code };
        if (err.expose && err.message) error.message = err.message;
        if (err.details !== undefined) error.details = err.details;
        ctx.json(err.status, { error });
        return;
      }

      ctx.logger.error('request_failed', {
        err: String(err?.stack ?? err),
      });
      ctx.json(500, { error: { code: 'internal_error' } });
    }
  };
}