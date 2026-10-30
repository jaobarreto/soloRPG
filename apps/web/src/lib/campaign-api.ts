import type { CampaignSession } from '@solo-rpg/shared-contracts';
export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(`/api/v1${path}`, {
    ...options,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? body.message
        : null;
    throw new Error(
      Array.isArray(message)
        ? message.join('; ')
        : typeof message === 'string'
          ? message
          : `Não foi possível acessar a API (HTTP ${response.status}).`,
    );
  }
  return body as T;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a operação.';
}
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  return `${hours ? `${hours}h ` : ''}${Math.floor((whole % 3600) / 60)}min ${String(whole % 60).padStart(2, '0')}s`;
}
export function mergeMessages<T extends { id: string; sequenceNumber: number }>(
  previous: T[],
  next: T[],
): T[] {
  return Array.from(
    new Map(
      [...previous, ...next].map((message) => [message.id, message]),
    ).values(),
  ).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}
export const sessionLabels: Record<CampaignSession['status'], string> = {
  LOCKED: 'Bloqueada',
  AVAILABLE: 'Disponível',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Pausada',
  COMPLETED: 'Concluída',
};
export const campaignLabels = {
  DRAFT: 'Planejada',
  ACTIVE: 'Ativa',
  COMPLETED: 'Concluída',
};
export const modeLabels = {
  SPEAK: 'Falar',
  ACT: 'Fazer',
  THINK: 'Pensar',
  OUT_OF_CHARACTER: 'Fora do RPG',
};
