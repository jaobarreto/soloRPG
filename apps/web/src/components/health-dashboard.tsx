'use client';
import { useEffect, useState } from 'react';
import { checkHealth, type HealthState } from '@/lib/health';
const services = [
  {
    name: 'API principal',
    service: 'solo-rpg-api',
    path: '',
    description: 'Conexão com o backend NestJS.',
  },
  {
    name: 'Serviço de IA',
    service: 'solo-rpg-ai',
    path: '/ai-service',
    description: 'Disponibilidade do FastAPI, via API principal.',
  },
  {
    name: 'Banco de dados',
    service: 'postgresql',
    path: '/database',
    description: 'Consulta real ao PostgreSQL.',
  },
] as const;
const labels = {
  loading: 'Verificando…',
  online: 'Disponível',
  offline: 'Indisponível',
};
export function HealthDashboard() {
  const [states, setStates] = useState<HealthState[]>([
    'loading',
    'loading',
    'loading',
  ]);
  const [checking, setChecking] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    async function refresh() {
      setChecking(true);
      const base = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(
        /\/$/,
        '',
      );
      const result = await Promise.all(
        services.map((item) =>
          checkHealth(`${base}/health${item.path}`, item.service),
        ),
      );
      if (active) {
        setStates(result);
        setUpdatedAt(new Date().toLocaleTimeString('pt-BR'));
        setChecking(false);
      }
    }
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [revision]);
  return (
    <section className="mb-20" aria-labelledby="services-title">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2
          id="services-title"
          className="text-sm font-semibold text-stone-800"
        >
          Status dos serviços
        </h2>
        <button
          className="rounded-md border border-stone-300 px-3 py-2 text-xs text-stone-700 transition hover:bg-stone-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-800 disabled:opacity-50"
          disabled={checking}
          onClick={() => setRevision((value) => value + 1)}
        >
          {checking ? 'Verificando…' : 'Atualizar status'}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
        {services.map((item, index) => {
          const state = states[index] ?? 'loading';
          return (
            <article
              key={item.service}
              className="rounded-xl border border-stone-300 bg-white/60 p-5"
            >
              <div className="mb-5 flex items-center gap-2 text-xs text-stone-600">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${state === 'online' ? 'bg-emerald-600' : state === 'offline' ? 'bg-red-600' : 'bg-stone-400'}`}
                />
                {labels[state]}
              </div>
              <h3 className="text-base font-semibold text-stone-900">
                {item.name}
              </h3>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                {item.description}
              </p>
            </article>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-stone-500">
        {updatedAt
          ? `Última consulta às ${updatedAt}. Atualização automática a cada 15 segundos.`
          : 'Consultando os serviços locais…'}
      </p>
    </section>
  );
}
