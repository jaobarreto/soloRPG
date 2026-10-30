import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagesService } from '../src/messages/messages.service';
import { DatabaseService } from '../src/database/database.service';
import { CampaignsRepository } from '../src/campaigns/campaigns.repository';
import { SessionsRepository } from '../src/sessions/sessions.repository';
import { MessagesRepository } from '../src/messages/messages.repository';
import { InteractionMode } from '@solo-rpg/shared-contracts';

describe('configurable message limit', () => {
  it('rejects oversized content before opening a database transaction', async () => {
    const transaction = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: DatabaseService, useValue: { db: { transaction } } },
        {
          provide: ConfigService,
          useValue: new ConfigService({ MESSAGE_MAX_LENGTH: 4 }),
        },
        { provide: CampaignsRepository, useValue: {} },
        { provide: SessionsRepository, useValue: {} },
        { provide: MessagesRepository, useValue: {} },
      ],
    }).compile();
    await expect(
      module.get(MessagesService).create('campaign', 'session', {
        interactionMode: InteractionMode.SPEAK,
        content: '12345',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
    await module.close();
  });
});
