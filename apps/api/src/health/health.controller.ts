import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiProperty,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { HealthResponse } from '@solo-rpg/shared-contracts';
import { DatabaseService } from '../database/database.service';
import { AiServiceClient } from '../integrations/ai-service/ai-service.client';
class HealthDto implements HealthResponse {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
  @ApiProperty({ enum: ['solo-rpg-api', 'solo-rpg-ai', 'postgresql'] })
  service!: HealthResponse['service'];
}
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly ai: AiServiceClient,
  ) {}
  @Get()
  @ApiOkResponse({ type: HealthDto })
  health(): HealthResponse {
    return { status: 'ok', service: 'solo-rpg-api' };
  }
  @Get('database')
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ description: 'Database unavailable' })
  async databaseHealth(): Promise<HealthResponse> {
    try {
      await this.database.checkHealth();
      return { status: 'ok', service: 'postgresql' };
    } catch {
      this.logger.warn('Database health check failed');
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'postgresql',
      });
    }
  }
  @Get('ai-service')
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ description: 'AI service unavailable' })
  async aiHealth(): Promise<HealthResponse> {
    try {
      return await this.ai.checkHealth();
    } catch {
      this.logger.warn('AI service health check failed');
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'solo-rpg-ai',
      });
    }
  }
}
