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
  }).catch(() => {
    throw new Error('A conexão com o CAOS foi interrompida. Tente novamente.');
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? body.message
        : null;
    if (message === 'Internal server error')
      throw new Error(
        'O CAOS não conseguiu concluir a operação. Tente novamente.',
      );
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
  OUT_OF_CHARACTER: 'Una',
  SPEAK: 'Fala',
  ACT: 'Ação',
  THINK: 'Pensamento',
  REQUEST_CHECK: 'Pedir teste',
  ROLL_RESULT: 'Resultado de rolagem',
};

export const modePlaceholders = {
  OUT_OF_CHARACTER: 'Pergunte algo à narradora...',
  SPEAK: 'O que sua personagem diz?',
  ACT: 'O que sua personagem tenta fazer?',
  THINK: 'O que passa pela cabeça da personagem?',
  REQUEST_CHECK: 'Qual teste você gostaria de solicitar?',
  ROLL_RESULT: 'Informe os dois dados comuns e depois o Dado de Drama...',
};

export function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
