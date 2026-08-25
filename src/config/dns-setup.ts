import { getServers, setServers } from 'node:dns';

/**
 * Atlas uses `mongodb+srv://`, which needs a DNS SRV lookup.
 *
 * On this Windows setup Node’s resolver list is `127.0.0.1` (Docker Desktop /
 * VPN stub). That stub returns ECONNREFUSED for SRV even though `nslookup`
 * (router DNS) succeeds — so Mongoose never reaches the cluster.
 *
 * Prefer public resolvers first; keep the original list as fallback.
 * Call this before `MongooseModule.forRoot`.
 */
export function ensurePublicDnsForSrv(): void {
  const current = getServers();
  const stub = new Set(['127.0.0.1', '::1']);
  if (!current.some((server) => stub.has(server))) {
    return;
  }

  setServers([
    '8.8.8.8',
    '1.1.1.1',
    ...current.filter((server) => !stub.has(server)),
  ]);
}
