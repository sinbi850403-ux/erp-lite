export function withTimeout(promise, ms, label) {
  let timer = null;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
