import type { CampaignSession } from '@solo-rpg/shared-contracts';

export type LibraryAdventure = {
  title: string;
  system: string;
  genre: string;
  narrator: string;
  levels: [number, number];
  presentation: string;
  campaignId: string | null;
  sessions: {
    number: number;
    title: string;
    status: CampaignSession['status'];
  }[];
  session: {
    id: string | null;
    title: string;
    status: CampaignSession['status'];
    progress: number;
    outcome?: 'COMPLETED' | 'WITHDRAWN';
  };
};

export const libraryEndpoint = '/campaigns/library';
export const libraryAdventurePath = '/campaigns/gloamhale';
