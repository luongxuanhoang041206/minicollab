import {
  badRequest,
  methodNotAllowed,
  notFound,
} from '../core/errors.js';

export function routerMiddleware(router) {
  if (!router || typeof router.match !== 'function') {
    throw new TypeError('routerMiddleware requires a router with match()');
  }

  return async function routeRequest(ctx) {
    const match = router.match(ctx.req.method, ctx.url.pathname);
    switch (match.type) {
      case 'found':
        ctx.params = match.params;
        return match.handler(ctx);
      case 'method_not_allowed':
        throw methodNotAllowed(match.allowed);
      case 'bad_request':
        throw badRequest('bad_path');
      default:
        throw notFound();
    }
  };
}