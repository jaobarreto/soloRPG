import { validateEnvironment } from '../src/config/environment';
const valid = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  AI_SERVICE_URL: 'http://localhost:8000',
};
describe('environment', () => {
  it('accepts optional LLM keys and coerces ports', () => {
    expect(validateEnvironment({ ...valid, API_PORT: '3001' }).API_PORT).toBe(
      3001,
    );
  });
  it.each(['DATABASE_URL', 'AI_SERVICE_URL'])('requires %s', (key) => {
    expect(() => validateEnvironment({ ...valid, [key]: undefined })).toThrow(
      key,
    );
  });
  it.each([
    { API_PORT: 'bad' },
    { API_PORT: 0 },
    { AI_SERVICE_URL: 'file:///tmp/test' },
    { DATABASE_URL: 'https://db' },
    { CORS_ORIGINS: '*' },
  ])('rejects invalid config %o', (config) => {
    expect(() => validateEnvironment({ ...valid, ...config })).toThrow();
  });
  it('does not leak credentials on validation failure', () => {
    expect(() =>
      validateEnvironment({ ...valid, DATABASE_URL: 'secret-value' }),
    ).toThrow('DATABASE_URL');
    try {
      validateEnvironment({ ...valid, DATABASE_URL: 'secret-value' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });
});
