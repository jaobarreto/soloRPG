'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CampaignSession } from '@solo-rpg/shared-contracts';
import { apiRequest, errorMessage } from '@/lib/campaign-api';
import { libraryAdventurePath } from '@/lib/adventure-library';
import { ErrorNotice, useApiData } from './campaign-ui';
import { Sheet, type PreparationResponse } from './campaign-preparation';

export function GuidedSetup({
  campaignId,
  sessionId,
}: {
  campaignId: string;
  sessionId: string;
}) {
  const campaign = `/campaigns/${campaignId}`;
  const endpoint = `${campaign}/preparation`;
  const play = `${campaign}/sessions/${sessionId}`;
  const { data, error, refresh } = useApiData<PreparationResponse>(endpoint);
  const router = useRouter();
  const [stage, setStage] = useState<'character' | 'party' | 'confirm'>(
    'character',
  );
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const adventure = data?.adventure;
  const choice = adventure?.selectedCompanions ?? selected;
  const companions = adventure?.companions ?? [];
  const naelis = adventure?.sheets?.[0];

  async function chooseCharacter() {
    setFailure('');
    if (adventure?.available && adventure.needsParty) {
      setBusy(true);
      try {
        await apiRequest(endpoint, { method: 'POST' });
        await refresh();
      } catch (error) {
        setFailure(errorMessage(error));
        return;
      } finally {
        setBusy(false);
      }
    }
    setChoosing(true);
  }

  async function start() {
    if (!adventure?.available) return;
    setBusy(true);
    setFailure('');
    try {
      await apiRequest(`${endpoint}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          confirmed: true,
          revision: adventure.revision,
          companions: choice,
        }),
      });
      await apiRequest(`${play}/start`, { method: 'POST' });
      router.replace(play);
    } catch (error) {
      const session = await apiRequest<CampaignSession>(play).catch(() => null);
      if (session?.startedAt) {
        router.replace(play);
        return;
      }
      setFailure(errorMessage(error));
      setBusy(false);
      await refresh();
    }
  }

  return (
    <>
      <Link href={libraryAdventurePath} className="back-link">
        ← Aventura
      </Link>
      <header className="my-8">
        <p className="eyebrow">Sessão I · Preparação</p>
        <h1 className="page-title">
          {stage === 'character'
            ? 'Protagonista'
            : stage === 'party'
              ? 'Selecionar companheiros'
              : 'Confirmar escolhas'}
        </h1>
      </header>
      <ErrorNotice message={failure || error} />
      {error && (
        <button className="secondary-button mt-3" onClick={refresh}>
          Recarregar fichas
        </button>
      )}
      {!data && !error && <p role="status">Carregando fichas…</p>}
      {data && !adventure?.available && (
        <Link className="primary-button" href={play}>
          Abrir sessão
        </Link>
      )}
      {adventure?.available && (
        <section className="panel space-y-5">
          {adventure.errors.length > 0 && (
            <ul role="alert" className="list-disc pl-5 text-sm text-red-900">
              {adventure.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          {stage === 'character' && (
            <>
              <div className="flex flex-wrap gap-3">
                <button disabled className="secondary-button">
                  Criar personagem
                </button>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={chooseCharacter}
                >
                  Selecionar personagem
                </button>
              </div>
              <p className="text-sm text-stone-600">
                A criação de personagens estará disponível futuramente.
              </p>
              {choosing && naelis && (
                <>
                  <Sheet sheet={naelis} />
                  <button
                    className="primary-button"
                    disabled={adventure.errors.length > 0}
                    onClick={() => setStage('party')}
                  >
                    Confirmar Naelis
                  </button>
                </>
              )}
            </>
          )}
          {stage === 'party' && (
            <>
              <p className="text-sm text-stone-600">
                Escolha até três companheiros. Com todos os cartões desmarcados,
                Naelis viaja sozinha.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {companions.map((member) => (
                  <label
                    key={member.key}
                    className="block cursor-pointer rounded-lg border border-stone-300 p-4 has-checked:border-amber-800 has-checked:bg-amber-50"
                  >
                    <span className="flex gap-2 font-serif text-lg">
                      <input
                        type="checkbox"
                        checked={choice.includes(member.key)}
                        disabled={adventure.selectedCompanions != null}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSelected((prev) =>
                            checked
                              ? [...prev, member.key]
                              : prev.filter((key) => key !== member.key),
                          );
                        }}
                      />
                      {member.name}
                    </span>
                    <span className="mt-2 block text-sm text-stone-700">
                      {member.people} · {member.role}
                    </span>
                    <span className="mt-2 block text-sm">
                      {member.personality} {member.presentation}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  className="secondary-button"
                  onClick={() => setStage('character')}
                >
                  Voltar
                </button>
                <button
                  className="primary-button"
                  onClick={() => setStage('confirm')}
                >
                  Revisar escolhas
                </button>
              </div>
            </>
          )}
          {stage === 'confirm' && (
            <>
              <dl className="space-y-2 text-stone-700">
                <div>
                  <dt className="font-medium">Aventura</dt>
                  <dd>{adventure.title}</dd>
                </div>
                <div>
                  <dt className="font-medium">Sessão</dt>
                  <dd>Sessão I</dd>
                </div>
                <div>
                  <dt className="font-medium">Protagonista</dt>
                  <dd>{naelis?.name}</dd>
                </div>
                <div>
                  <dt className="font-medium">Companheiros</dt>
                  <dd>
                    {companions
                      .filter((member) => choice.includes(member.key))
                      .map((member) => member.name)
                      .join(', ') || 'Naelis viaja sozinha'}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-3">
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => setStage('party')}
                >
                  Voltar
                </button>
                <button
                  className="primary-button"
                  disabled={busy || !!error || adventure.errors.length > 0}
                  onClick={start}
                >
                  {busy ? 'Iniciando…' : 'Confirmar e iniciar'}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
