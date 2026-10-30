import { z } from 'zod';
const httpUrl = z.url({ protocol: /^https?$/ });
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  AI_SERVICE_URL: httpUrl,
  MESSAGE_MAX_LENGTH: z.coerce.number().int().min(1).max(100000).default(10000),
  HEALTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(3000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(httpUrl).min(1)),
});
export type Environment = z.infer<typeof schema>;
export function validateEnvironment(
  config: Record<string, unknown>,
): Environment {
  const result = schema.safeParse(config);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid environment variables: ${fields.join(', ')}`);
  }
  return result.data;
}
