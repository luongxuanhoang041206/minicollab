// lab/router-bench.js
import { createRouter } from '../src/core/router/index.js';
import { createLinearEngine } from '../src/core/router/linear-engine.js';
import { createTrieEngine } from '../src/core/router/trie-engine.js';

const engines = { linear: createLinearEngine, trie: createTrieEngine };

function build(makeEngine, n) {
  const r = createRouter({ engine: makeEngine() });
  for (let i = 0; i < n; i++) r.get(`/r${i}/:id/items`, () => {});
  return r;
}

function bench(label, fn, iterations = 200_000) {
  for (let i = 0; i < 20_000; i++) fn();                 // warm-up cho JIT
  let found = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) if (fn().type === 'found') found++;   // dùng kết quả
  const ns = Number(process.hrtime.bigint() - t0) / iterations;
  console.log(label.padEnd(26), ns.toFixed(0).padStart(8), 'ns/op', ` found=${found}`);
}

for (const [name, makeEngine] of Object.entries(engines)) {
  for (const n of [10, 100, 500, 2000]) {
    const r = build(makeEngine, n);
    bench(`${name} n=${n} first`,   () => r.match('GET', '/r0/42/items'));
    bench(`${name} n=${n} last`,    () => r.match('GET', `/r${n - 1}/42/items`));
    bench(`${name} n=${n} missing`, () => r.match('GET', '/nope/42/items'));
  }
}
