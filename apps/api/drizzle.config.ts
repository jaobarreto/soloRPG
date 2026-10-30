import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
config({ path: '../../.env', quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/database/schema.ts',
    './src/database/game-schema.ts',
    './src/database/narrative-schema.ts',
  ],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL },
});
