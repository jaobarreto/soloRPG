import { z } from 'zod';
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.enum(['solo-rpg-api', 'solo-rpg-ai', 'postgresql']),
});
export type HealthResponse = z.infer<typeof healthSchema>;
