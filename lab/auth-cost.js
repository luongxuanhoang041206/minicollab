import { createPaswordHasher } from "../src/lib/password";

for (const N of [16384, 32768, 65536]) {
    const h = createPaswordHasher({ N });
    const t0 = performance.now();
    await h.hash('password');
    console.log(N, performance.now() - t0.toFixed(0), 'ms');
}