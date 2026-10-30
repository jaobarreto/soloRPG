'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CampaignDetail,
  CampaignSession,
  MessagePage,
  SessionMessage,
} from '@solo-rpg/shared-contracts';
import {
  apiRequest,
  errorMessage,
  formatDuration,
  mergeMessages,
  modeLabels,
  sessionLabels,
} from '@/lib/campaign-api';
import { ErrorNotice, StatusBadge } from './campaign-ui';

function ActiveTime({ session }: { session: CampaignSession }) {
  const [extra, setExtra] = useState(0);
  useEffect(() => {
    if (session.status !== 'IN_PROGRESS') return;
    const start = Date.now();
    const timer = setInterval(
      () => setExtra(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [session.status]);
  return <span>{formatDuration(session.activeDurationSeconds + extra)}</span>;
}
export function SessionChat({
  campaignId,
  sessionId,
}: {
  campaignId: string;
  sessionId: string;
}) {
  const router = useRouter();
  const path = `/campaigns/${campaignId}/sessions/${sessionId}`;
  const [session, setSession] = useState<CampaignSession | null>(null);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [page, setPage] = useState<{
    hasMore: boolean;
    nextCursor: number | null;
  }>({ hasMore: false, nextCursor: null });
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<keyof typeof modeLabels>('SPEAK');
  const [endingType, setEndingType] = useState('PLAYER_REQUESTED');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [endedNow, setEndedNow] = useState(false);

  const refreshSession = useCallback(async () => {
    const [current, detail] = await Promise.all([
      apiRequest<CampaignSession>(path),
      apiRequest<CampaignDetail>(`/campaigns/${campaignId}`),
    ]);
    setSession(current);
    setCampaign(detail);
  }, [path, campaignId]);
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<CampaignSession>(path),
      apiRequest<CampaignDetail>(`/campaigns/${campaignId}`),
      apiRequest<MessagePage>(`${path}/messages`),
    ])
      .then(([current, detail, history]) => {
        if (active) {
          setSession(current);
          setCampaign(detail);
          setMessages(history.data);
          setPage(history);
          setError('');
        }
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [path, campaignId]);

  async function loadMore() {
    if (!page.hasMore || page.nextCursor === null) return;
    setBusy(true);
    setError('');
    try {
      const next = await apiRequest<MessagePage>(
        `${path}/messages?after=${page.nextCursor}`,
      );
      setMessages((previous) => mergeMessages(previous, next.data));
      setPage(next);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function transition(
    action: 'start' | 'pause' | 'resume' | 'complete',
    targetId = sessionId,
  ) {
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<CampaignSession>(
        `/campaigns/${campaignId}/sessions/${targetId}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify(action === 'complete' ? { endingType } : {}),
        },
      );
      if (targetId !== sessionId) {
        router.push(`/campaigns/${campaignId}/sessions/${targetId}`);
        return;
      }
      setSession(updated);
      if (action === 'complete') setEndedNow(true);
      setCampaign(await apiRequest<CampaignDetail>(`/campaigns/${campaignId}`));
    } catch (error) {
      setError(errorMessage(error));
      await refreshSession().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || session?.status !== 'IN_PROGRESS') return;
    setBusy(true);
    setError('');
    try {
      const message = await apiRequest<SessionMessage>(`${path}/messages`, {
        method: 'POST',
        body: JSON.stringify({ interactionMode: mode, content }),
      });
      setContent('');
      // If older pages are not loaded, keep the cursor gap visible and append this
      // committed message only once that gap has been fetched.
      if (!page.hasMore)
        setMessages((previous) => mergeMessages(previous, [message]));
      else {
        let cursor = page.nextCursor!;
        for (;;) {
          const next = await apiRequest<MessagePage>(
            `${path}/messages?after=${cursor}`,
          );
          setMessages((previous) => mergeMessages(previous, next.data));
          setPage(next);
          if (!next.hasMore) break;
          cursor = next.nextCursor!;
        }
      }
    } catch (error) {
      setError(errorMessage(error));
      await refreshSession().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const next = campaign?.sessions.find(
    (item) => item.sessionNumber === (session?.sessionNumber ?? 0) + 1,
  );
  return (
    <>
      <Link href={`/campaigns/${campaignId}`} className="back-link">
        ← Voltar à campanha
      </Link>
      <Link
        href={`/campaigns/${campaignId}/game`}
        className="secondary-button ml-4"
      >
        Ficha e dados
      </Link>
      <div className="mt-5">
        <ErrorNotice message={error} />
      </div>
      {!session && !error && (
        <p role="status" className="mt-6">
          Carregando sessão e histórico…
        </p>
      )}
      {error && (
        <button
          className="secondary-button mt-3"
          onClick={() => window.location.reload()}
        >
          Recarregar dados
        </button>
      )}
      {session && (
        <>
          <header className="my-8 flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="eyebrow">
                Sessão {session.sessionNumber} de{' '}
                {campaign?.plannedSessions ?? '…'}
              </p>
              <h1 className="page-title">{session.title}</h1>
              <div className="mt-4">
                <StatusBadge label={sessionLabels[session.status]} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-stone-500">
                Tempo ativo
              </p>
              <p className="mt-2 font-mono text-xl">
                <ActiveTime
                  key={`${session.timeMeasuredAt}-${session.status}`}
                  session={session}
                />
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Duração estimada: {session.estimatedDurationMinutes} min
              </p>
            </div>
          </header>
          <p className="mb-5 text-sm text-stone-500">
            A IA será integrada em uma etapa posterior. Este chat registra suas
            mensagens.
          </p>
          {session.status === 'AVAILABLE' && (
            <section className="panel mb-6">
              <h2 className="font-serif text-2xl">Pronta para começar?</h2>
              <p className="my-3 text-sm text-stone-600">
                O cronômetro começa ao iniciar a sessão. Pause quando precisar
                de uma pausa.
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => transition('start')}
              >
                Iniciar sessão {session.sessionNumber}
              </button>
            </section>
          )}
          {session.status === 'LOCKED' && (
            <p className="panel mb-6">
              Conclua a sessão anterior para liberar este capítulo.
            </p>
          )}
          {session.status === 'COMPLETED' && (
            <section
              className="panel mb-6 border-emerald-300 bg-emerald-50"
              aria-label="Encerramento da sessão"
            >
              <p className="eyebrow">Fim da sessão {session.sessionNumber}</p>
              <h2 className="font-serif text-3xl">{session.title}</h2>
              <p className="mt-3">
                Tempo jogado: {formatDuration(session.activeDurationSeconds)}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Progresso salvo com sucesso. Sessão concluída, disponível para
                leitura.
              </p>
              {campaign?.status === 'COMPLETED' && (
                <div className="mt-6">
                  <h3 className="font-serif text-2xl">Campanha concluída</h3>
                  <p className="mt-2 text-sm">
                    Todas as sessões planejadas foram encerradas.
                  </p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  className="secondary-button"
                  href="#history"
                  onClick={() => setEndedNow(false)}
                >
                  Ver histórico da sessão
                </a>
                {next?.status === 'AVAILABLE' && (
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => transition('start', next.id)}
                  >
                    Iniciar sessão {next.sessionNumber}
                  </button>
                )}
                {next &&
                  next.status !== 'AVAILABLE' &&
                  next.status !== 'LOCKED' && (
                    <Link
                      className="secondary-button"
                      href={`/campaigns/${campaignId}/sessions/${next.id}`}
                    >
                      Abrir sessão {next.sessionNumber}
                    </Link>
                  )}
                {campaign?.status === 'COMPLETED' && (
                  <Link
                    className="secondary-button"
                    href={`/campaigns/${campaignId}`}
                  >
                    Ver histórico da campanha
                  </Link>
                )}
              </div>
            </section>
          )}
          {!endedNow && (
            <section
              id="history"
              aria-label="Histórico da sessão"
              className="panel"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-serif text-2xl">Histórico</h2>
                <span className="text-xs text-stone-500">
                  {messages.length} mensagens carregadas
                </span>
              </div>
              {messages.length === 0 && (
                <p className="py-8 text-center text-sm text-stone-500">
                  O diário desta sessão ainda está em branco.
                </p>
              )}
              <ol className="space-y-4">
                {messages.map((message) => (
                  <li
                    key={message.id}
                    className="rounded-lg border border-stone-200 bg-white p-4"
                  >
                    <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-stone-500">
                      <span>
                        {message.role === 'PLAYER'
                          ? 'Protagonista'
                          : message.role === 'SYSTEM'
                            ? 'Sistema'
                            : 'Mestre'}
                        {message.interactionMode
                          ? ` · ${modeLabels[message.interactionMode]}`
                          : ''}
                      </span>
                      <span>
                        #{message.sequenceNumber} ·{' '}
                        {new Date(message.createdAt).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words leading-7">
                      {message.content}
                    </p>
                  </li>
                ))}
              </ol>
              {page.hasMore && (
                <button
                  disabled={busy}
                  className="secondary-button mt-5 w-full"
                  onClick={loadMore}
                >
                  Carregar próximas mensagens
                </button>
              )}
              {!page.hasMore && messages.length > 0 && (
                <p className="mt-5 text-center text-xs text-stone-500">
                  Todo o histórico salvo foi carregado.
                </p>
              )}
            </section>
          )}
          {!endedNow && (
            <form className="panel mt-5 space-y-4" onSubmit={send}>
              <div className="flex flex-wrap gap-3">
                <label className="field-label min-w-48 flex-1">
                  Modo de interação
                  <select
                    value={mode}
                    disabled={busy || session.status !== 'IN_PROGRESS'}
                    onChange={(event) =>
                      setMode(event.target.value as keyof typeof modeLabels)
                    }
                  >
                    {Object.entries(modeLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field-label">
                Mensagem
                <textarea
                  rows={4}
                  maxLength={10000}
                  value={content}
                  disabled={busy || session.status !== 'IN_PROGRESS'}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={
                    session.status === 'COMPLETED'
                      ? 'Sessão concluída — histórico somente para leitura.'
                      : session.status === 'PAUSED'
                        ? 'Continue a sessão para enviar mensagens.'
                        : 'O que você quer dizer, fazer ou pensar?'
                  }
                />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-stone-500">
                  Até 10.000 caracteres por mensagem.
                </p>
                <button
                  className="primary-button"
                  disabled={
                    busy || session.status !== 'IN_PROGRESS' || !content.trim()
                  }
                  type="submit"
                >
                  {busy ? 'Salvando…' : 'Enviar mensagem'}
                </button>
              </div>
            </form>
          )}
          {(session.status === 'IN_PROGRESS' ||
            session.status === 'PAUSED') && (
            <div className="mt-6 flex flex-wrap items-end gap-3">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  transition(session.status === 'PAUSED' ? 'resume' : 'pause')
                }
              >
                {session.status === 'PAUSED'
                  ? 'Continuar sessão'
                  : 'Pausar sessão'}
              </button>
              <label className="field-label flex-1">
                Motivo do encerramento
                <select
                  disabled={busy}
                  value={endingType}
                  onChange={(event) => setEndingType(event.target.value)}
                >
                  <option value="PLAYER_REQUESTED">
                    Solicitado pela jogadora
                  </option>
                  <option value="NARRATIVE_PAUSE">Pausa narrativa</option>
                  <option value="OBJECTIVE_COMPLETED">
                    Objetivo concluído
                  </option>
                </select>
              </label>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => transition('complete')}
              >
                Encerrar sessão
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
