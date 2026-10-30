import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { healthSchema, type HealthResponse } from '@solo-rpg/shared-contracts';
@Injectable()
export class AiServiceClient {
  constructor(private readonly config: ConfigService) {}
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
