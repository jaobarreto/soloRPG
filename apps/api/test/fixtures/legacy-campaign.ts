import type { INestApplication } from '@nestjs/common';
import { CampaignsRepository } from '../../src/campaigns/campaigns.repository';
import { CampaignsService } from '../../src/campaigns/campaigns.service';

// Persist a historical, unbound campaign through the internal repository. The public
// creation API deliberately no longer accepts a player-selected chapter count.
export async function legacyCampaign(
  app: INestApplication,
  plannedSessions = 2,
  title = 'Campanha histórica de teste',
) {
  const { campaign } = await app.get(CampaignsRepository).create(
    { title, plannedSessions },
    Array.from({ length: plannedSessions }, (_, i) => ({
      sessionNumber: i + 1,
      title: `Sessão ${i + 1}`,
      status: i === 0 ? ('AVAILABLE' as const) : ('LOCKED' as const),
    })),
  );
  return app.get(CampaignsService).detail(campaign.id);
}
