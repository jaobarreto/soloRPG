import { ConfigService } from '@nestjs/config';
import { AiServiceClient } from '../src/integrations/ai-service/ai-service.client';
describe('AI gateway', () => {
  const config = new ConfigService({
    AI_SERVICE_URL: 'http://localhost:8000',
    HEALTH_TIMEOUT_MS: 100,
  });
  afterEach(() => jest.restoreAllMocks());
  it('queries FastAPI health', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', service: 'solo-rpg-ai' })),
      );
    await expect(new AiServiceClient(config).checkHealth()).resolves.toEqual({
      status: 'ok',
      service: 'solo-rpg-ai',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it.each([
    new Response('{}', { status: 503 }),
    new Response('{"status":"ok","service":"wrong"}'),
    new Response('invalid'),
  ])('rejects an unhealthy/invalid reply', async (response) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(new AiServiceClient(config).checkHealth()).rejects.toThrow();
  });
  it('rejects connection failures', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unavailable'));
    await expect(new AiServiceClient(config).checkHealth()).rejects.toThrow();
  });
  it('authenticates and bounds structured narrative responses', async () => {
    const client = new AiServiceClient(
      new ConfigService({
        AI_SERVICE_URL: 'http://localhost:8000',
        AI_INTERNAL_TOKEN: 'fake-internal',
      }),
    );
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"proposal":{"kind":"OBSERVE"}}'));
    await expect(client.turn({ actionId: 'test' })).resolves.toEqual({
      proposal: { kind: 'OBSERVE' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Token': 'fake-internal',
        },
        redirect: 'error',
      }),
    );
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(100001)));
    await expect(client.turn({})).rejects.toThrow('too large');
    fetchMock.mockResolvedValueOnce(new Response(null));
    await expect(client.turn({})).rejects.toThrow('Empty');
    fetchMock.mockResolvedValueOnce(
      new Response('secret provider body', { status: 503 }),
    );
    await expect(client.turn({})).rejects.toThrow('unavailable');
    await expect(new AiServiceClient(config).turn({})).rejects.toThrow(
      'authentication',
    );
  });
});
