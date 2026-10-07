import { createTrieEngine } from './trie-engine.js';    // mặc định từ M2
import { joinPath } from './path.js';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function createRegistrar(insert, prefix) {
  const api = {
    add(method, path, handler) {
      if (typeof handler !== 'function') throw new TypeError('handler phải là function');
      insert(method.toUpperCase(), joinPath(prefix, path), handler);
    },
    group(sub, fn) {
      const next = joinPath(prefix, sub);
      fn(createRegistrar(insert, next === '/' ? '' : next));
    },
  };
  for (const m of METHODS) api[m] = (path, handler) => api.add(m, path, handler);
  return api;
}

export function createRouter({ engine = createTrieEngine() } = {}) {
  return {
    ...createRegistrar((method, path, handler) => engine.insert(method, path, handler), ''),
    match: (method, pathname) => engine.match(method, pathname),
  };
}