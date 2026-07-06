/** Build CORS allow-list from CLIENT_ORIGIN, auto-including www ↔ apex pairs. */
export function buildAllowedOrigins(clientOrigin) {
  if (!clientOrigin || clientOrigin.trim() === '*') return '*';

  const origins = new Set();
  for (const raw of clientOrigin.split(',')) {
    const origin = raw.trim();
    if (!origin) continue;
    origins.add(origin);

    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) continue;

      if (url.hostname.startsWith('www.')) {
        origins.add(`${url.protocol}//${url.hostname.slice(4)}${url.port ? `:${url.port}` : ''}`);
      } else {
        origins.add(`${url.protocol}//www.${url.hostname}${url.port ? `:${url.port}` : ''}`);
      }
    } catch {
      /* ignore malformed entries */
    }
  }

  return [...origins];
}
