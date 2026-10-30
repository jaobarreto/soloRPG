import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    );
  return result.data;
}
