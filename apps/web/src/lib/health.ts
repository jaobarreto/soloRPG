import { healthSchema, type HealthResponse } from '@solo-rpg/shared-contracts';
export type HealthState = 'loading' | 'online' | 'offline';
export async function checkHealth(
  url: string,
  service: HealthResponse['service'],
  fetcher: typeof fetch = fetch,
): Promise<HealthState> {
  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return 'offline';
    const health = healthSchema.safeParse(await response.json());
    return health.success && health.data.service === service
      ? 'online'
      : 'offline';
  } catch {
    return 'offline';
  }
}
