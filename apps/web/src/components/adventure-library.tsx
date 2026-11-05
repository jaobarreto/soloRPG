'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNotice, useApiData } from './campaign-ui';
import { apiRequest, errorMessage, sessionLabels } from '@/lib/campaign-api';
import {
  libraryAdventurePath,
  libraryEndpoint,
  type LibraryAdventure,
} from '@/lib/adventure-library';

function Metadata({ adventure }: { adventure: LibraryAdventure }) {
  return (
    <dl className="my-5 grid grid-cols-2 gap-3 text-sm text-stone-700">
      <div>
        <dt className="font-medium">Sistema</dt>
        <dd>{adventure.system}</dd>
      </div>
      <div>
        <dt className="font-medium">Gênero</dt>
        <dd>{adventure.genre}</dd>
      </div>
      <div>
        <dt className="font-medium">Níveis recomendados</dt>
        <dd>{adventure.levels.join('–')}</dd>
      </div>
      <div>
        <dt className="font-medium">Narradora</dt>
        <dd>{adventure.narrator}</dd>
      </div>
    </dl>
  );
}

export function AdventureLibrary({ details = false }: { details?: boolean }) {
  const { data, error, refresh } =
    useApiData<LibraryAdventure>(libraryEndpoint);
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState('');

  async function openSession() {
    setOpening(true);
    setFailure('');
    try {
      const result = await apiRequest<LibraryAdventure>(libraryEndpoint, {
        method: 'POST',
      });
      if (!result.campaignId || !result.session.id)
        throw new Error('A sessão não está disponível.');
      const campaignPath = `/campaigns/${result.campaignId}`;
      const play = `${campaignPath}/sessions/${result.session.id}`;
      if (result.session.status === 'AVAILABLE') {
        await apiRequest(`${campaignPath}/preparation`, { method: 'POST' });
        router.push(`${play}/prepare`);
      } else {
        router.push(play);
      }
    } catch (error) {
      setFailure(errorMessage(error));
      setOpening(false);
      await refresh();
    }
  }

  return (
    <>
      {details && (
        <Link href="/campaigns" className="back-link">
          ← Campanhas
        </Link>
      )}
      <header className="my-8">
        <p className="eyebrow">Biblioteca de aventuras</p>
        <h1 className="page-title">
          {details ? (data?.title ?? 'Aventura') : 'Campanhas'}
        </h1>
      </header>
      <ErrorNotice message={failure || error} />
      {!data && !error && <p role="status">Carregando biblioteca…</p>}
      {error && (
        <button className="secondary-button mt-3" onClick={refresh}>
          Recarregar biblioteca
        </button>
      )}
      {data &&
        (details ? (
          <>
            <section className="panel">
              <Metadata adventure={data} />
              <p className="font-serif text-lg leading-relaxed">
                {data.presentation}
              </p>
            </section>
            <section className="mt-8" aria-label="Índice de sessões">
              <h2 className="mb-4 font-serif text-2xl">Sessões</h2>
              <article className="panel flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="font-serif text-xl">{data.session.title}</h3>
                  <p className="text-sm text-stone-600">
                    {data.session.outcome === 'WITHDRAWN'
                      ? 'Retirada confirmada'
                      : sessionLabels[data.session.status]}{' '}
                    · {data.session.progress}%
                  </p>
                </div>
                <button
                  className="primary-button"
                  disabled={opening}
                  onClick={openSession}
                >
                  {opening
                    ? 'Abrindo…'
                    : data.session.status === 'AVAILABLE'
                      ? 'Iniciar sessão'
                      : data.session.status === 'COMPLETED'
                        ? 'Ler histórico'
                        : 'Continuar sessão'}
                </button>
              </article>
              <ol className="mt-3 space-y-3">
                {data.sessions
                  .filter((entry) => entry.status === 'LOCKED')
                  .map((entry) => (
                    <li
                      key={entry.number}
                      className="panel flex flex-wrap items-center justify-between gap-2 text-stone-600"
                    >
                      <h3 className="font-serif text-xl">{entry.title}</h3>
                      <p className="text-sm">Bloqueada — Em preparação</p>
                    </li>
                  ))}
              </ol>
              {data.session.status === 'COMPLETED' && (
                <p className="mt-4 text-sm text-stone-600">
                  {data.session.outcome === 'WITHDRAWN'
                    ? 'Retirada definitiva registrada. O diário permanece disponível.'
                    : 'Sessão I concluída. As próximas sessões estão em preparação.'}
                </p>
              )}
            </section>
          </>
        ) : (
          <article className="panel max-w-xl border-t-4 border-t-amber-800">
            <p className="eyebrow">Aventura disponível</p>
            <h2 className="mt-2 font-serif text-3xl">
              <Link href={libraryAdventurePath} className="hover:underline">
                {data.title}
              </Link>
            </h2>
            <Metadata adventure={data} />
            <Link href={libraryAdventurePath} className="secondary-button">
              Ver aventura →
            </Link>
          </article>
        ))}
      {!details && (
        <Link
          href="/campaigns/historico"
          className="back-link mt-8 inline-block"
        >
          Campanhas anteriores
        </Link>
      )}
    </>
  );
}
