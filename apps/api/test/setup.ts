// Tests never use local credentials or require a developer .env file.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.AI_SERVICE_URL = 'http://127.0.0.1:8000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
