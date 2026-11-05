import { z } from 'zod';
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(['solo-rpg-api', 'solo-rpg-ai', 'postgresql']),
});
export type HealthResponse = z.infer<typeof healthSchema>;

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}
export enum SessionStatus {
  LOCKED = 'LOCKED',
  AVAILABLE = 'AVAILABLE',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
}
export enum InteractionMode {
  SPEAK = 'SPEAK',
  ACT = 'ACT',
  THINK = 'THINK',
  OUT_OF_CHARACTER = 'OUT_OF_CHARACTER',
  REQUEST_CHECK = 'REQUEST_CHECK',
  ROLL_RESULT = 'ROLL_RESULT',
}
export enum EndingType {
  OBJECTIVE_COMPLETED = 'OBJECTIVE_COMPLETED',
  NARRATIVE_PAUSE = 'NARRATIVE_PAUSE',
  PLAYER_REQUESTED = 'PLAYER_REQUESTED',
}
export enum MessageRole {
  PLAYER = 'PLAYER',
  GAME_MASTER = 'GAME_MASTER',
  SYSTEM = 'SYSTEM',
}
export interface Campaign {
  id: string;
  title: string;
  description: string | null;
  plannedSessions: number;
  defaultSessionDurationMinutes: number;
  currentSessionNumber: number | null;
  status: `${CampaignStatus}`;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
export interface CampaignSession {
  id: string;
  campaignId: string;
  sessionNumber: number;
  title: string;
  description: string | null;
  status: `${SessionStatus}`;
  estimatedDurationMinutes: number;
  /** Total active seconds at timeMeasuredAt, including the current running interval. */
  activeDurationSeconds: number;
  timeMeasuredAt: string;
  startedAt: string | null;
  resumedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  endingType: `${EndingType}` | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface CampaignDetail extends Campaign {
  sessions: CampaignSession[];
}
export interface SessionMessage {
  id: string;
  campaignId: string;
  sessionId: string;
  role: `${MessageRole}`;
  interactionMode: `${InteractionMode}` | null;
  content: string;
  sequenceNumber: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
export interface MessagePage {
  data: SessionMessage[];
  nextCursor: number | null;
  hasMore: boolean;
}
export * from './game';
export * from './narrative';
export * from './arcana';
export * from './adventure-actions';
export * from './free-action';

export * from './mentions';
export * from './dialogue';
