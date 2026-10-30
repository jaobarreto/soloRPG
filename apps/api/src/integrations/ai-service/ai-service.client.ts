import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { healthSchema, type HealthResponse } from '@solo-rpg/shared-contracts';
@Injectable()
export class AiServiceClient {
  constructor(private readonly config: ConfigService) {}
  async turn(input: Record<string, unknown>): Promise<unknown> {
    const token = this.config.get<string>('AI_INTERNAL_TOKEN');
    if (!token) throw new Error('AI internal authentication not configured');
    const response = await fetch(
      new URL(
        '/internal/turn',
        this.config.getOrThrow<string>('AI_SERVICE_URL'),
      ),
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(55000),
        headers: { 'Content-Type': 'application/json', 'X-AI-Token': token },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error('AI turn unavailable');
    // Bound the response before JSON parsing; never log provider output.
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty AI response');
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100000) {
        await reader.cancel();
        throw new Error('AI response too large');
      }
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  }
  async checkHealth(): Promise<HealthResponse> {
    const url = new URL(
      '/health',
      this.config.getOrThrow<string>('AI_SERVICE_URL'),
    ).toString();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(
        this.config.getOrThrow<number>('HEALTH_TIMEOUT_MS'),
      ),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('AI service unavailable');
    const health = healthSchema.parse(await response.json());
    if (health.service !== 'solo-rpg-ai')
      throw new Error('Invalid AI service response');
    return health;
  }
}
