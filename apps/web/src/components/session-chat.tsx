'use client';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import type {
  CampaignDetail,
  CampaignSession,
  MessagePage,
  SessionMessage,
  PublicNarrativeAction,
  ResolvedMention,
} from '@solo-rpg/shared-contracts';
import {
  apiRequest,
  errorMessage,
  formatDuration,
  mergeMessages,
  modeLabels,
  modePlaceholders,
  requestId,
  sessionLabels,
} from '@/lib/campaign-api';
import type { PreparationResponse } from './campaign-preparation';
import {
  libraryAdventurePath,
  libraryEndpoint,
  type LibraryAdventure,
} from '@/lib/adventure-library';
import { SessionResetDialog } from './session-reset-dialog';
import { Sheet } from './campaign-preparation';
import { ErrorNotice, StatusBadge, useApiData } from './campaign-ui';
import { AiUsage } from './ai-usage';
import { MentionComposer } from './mention-composer';

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
  const [mentions, setMentions] = useState<ResolvedMention[]>([]);
  const [mode, setMode] = useState<keyof typeof modeLabels>('SPEAK');
  const [drafts, setDrafts] = useState<
    Partial<
      Record<
        keyof typeof modeLabels,
        { content: string; mentions: ResolvedMention[] }
      >
    >
  >({});
  const [mounts, setMounts] = useState<
    {
      id: string;
      name: string;
      health: number;
      maxHealth: number;
      lifeState: string;
      mounted: boolean;
      location: string;
      conditions: { name: string }[];
    }[]
  >([]);
  const [endingType, setEndingType] = useState('PLAYER_REQUESTED');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const resetInFlight = useRef(false);
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const [endedNow, setEndedNow] = useState(false);
  const [action, setAction] = useState<PublicNarrativeAction | null>(null);
  const [progress, setProgress] = useState<{
    progress: number;
    campaignProgress?: number;
    progressionMode?: 'OBJECTIVES';
    outcome?: 'COMPLETED' | 'WITHDRAWN';
    objectives?: { id: string; description: string; completed: boolean }[];
    suggestSessionEnding: boolean;
  }>({ progress: 0, suggestSessionEnding: false });
  const [unsent, setUnsent] = useState<{
    id: string;
    interactionMode: string;
    content: string;
    mentions?: ResolvedMention[];
  } | null>(null);
  const preparation = useApiData<PreparationResponse>(
    `/campaigns/${campaignId}/preparation`,
  );
  const storageKey = `caos:queued-draft:${sessionId}`;
  const batchKey = `caos:batch:${sessionId}`;
  const resetKey = `caos:confirmed-reset:${sessionId}`;
  const openReplacement = useCallback(
    (
      replacementCampaign: string,
      replacementSession: string,
      available: boolean,
    ) => {
      for (const key of [resetKey, batchKey, storageKey])
        sessionStorage.removeItem(key);
      setMessages([]);
      setSession(null);
      setResetOpen(false);
      router.replace(
        `/campaigns/${replacementCampaign}/sessions/${replacementSession}${available ? '/prepare' : ''}`,
      );
    },
    [batchKey, resetKey, router, storageKey],
  );
  const recoverReset = useCallback(async () => {
    const library = await apiRequest<LibraryAdventure>(libraryEndpoint);
    if (
      !library.campaignId ||
      !library.session.id ||
      library.campaignId === campaignId
    )
      return false;
    openReplacement(
      library.campaignId,
      library.session.id,
      library.session.status === 'AVAILABLE',
    );
    return true;
  }, [campaignId, openReplacement]);
  useEffect(() => {
    if (sessionStorage.getItem(resetKey)) recoverReset().catch(() => {});
  }, [recoverReset, resetKey]);

  function cancelReset() {
    setResetOpen(false);
    setResetError('');
    requestAnimationFrame(() => resetTrigger.current?.focus());
  }

  async function confirmReset() {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    setResetError('');
    sessionStorage.setItem(resetKey, 'confirmed');
    try {
      const replacement = await apiRequest<{
        campaignId: string;
        sessionId: string;
      }>(`${path}/reset`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      });
      openReplacement(replacement.campaignId, replacement.sessionId, true);
    } catch (error) {
      if (await recoverReset().catch(() => false)) return;
      setResetError(errorMessage(error));
      resetInFlight.current = false;
      setResetting(false);
    }
  }
  const pending =
    !!unsent ||
    (!!action && !['COMPLETED', 'REJECTED'].includes(action.status));

  const syncNarrative = useCallback(async () => {
    const state = await apiRequest<{
      action: PublicNarrativeAction | null;
      mounts?: typeof mounts;
      progress: number;
      suggestSessionEnding: boolean;
    }>(`${path}/narrative-state`);
    setAction(state.action);
    setMounts(state.mounts ?? []);
    setProgress(state);
  }, [path]);
  const syncHistory = useCallback(async () => {
    let cursor = 0;
    for (;;) {
      const history = await apiRequest<MessagePage>(
        `${path}/messages?after=${cursor}`,
      );
      setMessages((previous) => mergeMessages(previous, history.data));
      setPage(history);
      if (!history.hasMore || history.nextCursor === null) break;
      cursor = history.nextCursor;
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(async () => {
        if (!active) return;
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          try {
            setUnsent(JSON.parse(stored));
          } catch {
            sessionStorage.removeItem(storageKey);
          }
        }
        await syncNarrative();
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [storageKey, syncNarrative]);
  useEffect(() => {
    if (!pending || busy) return;
    const timer = setInterval(() => {
      Promise.all([syncNarrative(), syncHistory()]).catch((e) =>
        setError(errorMessage(e)),
      );
    }, 2500);
    return () => clearInterval(timer);
  }, [pending, busy, syncNarrative, syncHistory]);

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
        `/campaigns/${campaignId}/sessions/${targetId}/${action === 'complete' ? 'finalize' : action}`,
        {
          method: 'POST',
          body: JSON.stringify(
            action === 'complete'
              ? {
                  endingType:
                    progress.progressionMode === 'OBJECTIVES'
                      ? 'OBJECTIVE_COMPLETED'
                      : endingType,
                }
              : {},
          ),
        },
      );
      if (targetId !== sessionId) {
        router.push(`/campaigns/${campaignId}/sessions/${targetId}`);
        return;
      }
      setSession(updated);
      if (action === 'start')
        await Promise.all([syncHistory(), syncNarrative()]);
      if (action === 'complete') {
        setEndedNow(true);
        await syncNarrative();
      }
      setCampaign(await apiRequest<CampaignDetail>(`/campaigns/${campaignId}`));
    } catch (error) {
      setError(errorMessage(error));
      await Promise.allSettled([
        refreshSession(),
        syncHistory(),
        preparation.refresh(),
      ]);
    } finally {
      setBusy(false);
    }
  }
  async function submitTurn(payload: {
    id: string;
    interactionMode: string;
    content: string;
    mentions?: ResolvedMention[];
  }) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${path}/messages/queue`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUnsent(null);
      setContent('');
      setMentions([]);
      setDrafts((previous) => ({
        ...previous,
        [payload.interactionMode]: undefined,
      }));
      sessionStorage.removeItem(storageKey);
      await Promise.all([syncHistory(), syncNarrative()]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || session?.status !== 'IN_PROGRESS' || unsent || busy)
      return;
    const payload = {
      id: requestId(),
      interactionMode: mode,
      content,
      ...(mentions.length ? { mentions } : {}),
    };
    sessionStorage.setItem(storageKey, JSON.stringify(payload));
    setUnsent(payload);
    await submitTurn(payload);
  }
  async function continueNarrative() {
    if (busy || session?.status !== 'IN_PROGRESS') return;
    if (
      content.trim() ||
      Object.entries(drafts).some(
        ([key, draft]) => key !== mode && draft.content.trim(),
      ) ||
      unsent
    ) {
      setError(
        'Há um rascunho por enviar. Envie ou limpe o texto antes de continuar.',
      );
      return;
    }
    setBusy(true);
    setError('');
    const id = sessionStorage.getItem(batchKey) ?? requestId();
    sessionStorage.setItem(batchKey, id);
    try {
      const state = await apiRequest<{ action: PublicNarrativeAction | null }>(
        `${path}/continue`,
        { method: 'POST', body: JSON.stringify({ id }) },
      );
      sessionStorage.removeItem(batchKey);
      if (state.action?.error) setError(state.action.error);
      await Promise.all([syncHistory(), syncNarrative()]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function continueAction(
    operation: 'retry' | 'roll' | 'decline-npc-stunts' | 'cancel',
  ) {
    if (!action) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<PublicNarrativeAction>(
        `${path}/actions/${action.id}/${operation}`,
        { method: 'POST', body: '{}' },
      );
      setAction(result);
      if (result.error) setError(result.error);
      await Promise.all([syncHistory(), syncNarrative()]);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const guided = preparation.data?.adventure?.guided === true;
  const adventure = preparation.data?.adventure;
  const companions = adventure?.companions?.filter((member) =>
    adventure.selectedCompanions?.includes(member.key),
  );
  const protagonist = adventure?.sheets?.[0];
  const progressPanel = (
    <section className="panel" aria-label="Progresso narrativo">
      <label className="field-label">
        Progresso da sessão: {progress.progress}%
        <progress className="w-full" max={100} value={progress.progress} />
      </label>
      {!guided && progress.campaignProgress !== undefined && (
        <p className="mt-2 text-sm">Campanha: {progress.campaignProgress}%</p>
      )}
      {!!progress.objectives?.length && (
        <ul className="mt-3 space-y-1 text-sm">
          {progress.objectives.map((o) => (
            <li key={o.id}>
              {o.completed ? '✓ ' : '○ '}
              {o.description}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  const next = campaign?.sessions.find(
    (item) => item.sessionNumber === (session?.sessionNumber ?? 0) + 1,
  );
  return (
    <>
      <Link
        href={guided ? libraryAdventurePath : `/campaigns/${campaignId}`}
        className="back-link"
      >
        ← Voltar à campanha
      </Link>
      {!guided && (
        <Link
          href={`/campaigns/${campaignId}/game`}
          className="secondary-button ml-4"
        >
          Ficha e dados
        </Link>
      )}
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
      {resetOpen && (
        <SessionResetDialog
          busy={resetting}
          error={resetError}
          onClose={cancelReset}
          onConfirm={confirmReset}
        />
      )}
      {session && (
        <>
          <header className="my-8 flex flex-wrap items-start justify-between gap-5">
            <div>
              {!guided && (
                <p className="eyebrow">
                  Sessão {session.sessionNumber} de{' '}
                  {campaign?.plannedSessions ?? '…'}
                </p>
              )}
              <h1 className="page-title">
                {guided ? 'Sessão I' : session.title}
              </h1>
              <div className="mt-4">
                <StatusBadge
                  label={
                    progress.outcome === 'WITHDRAWN'
                      ? 'Retirada confirmada'
                      : sessionLabels[session.status]
                  }
                />
              </div>
            </div>
            {!guided && (
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
                  Estatística de jogo; a história determina o encerramento.
                </p>
              </div>
            )}
          </header>
          <p className="mb-5 text-sm text-stone-500">
            Una responde após a validação do motor. Suas mensagens e os
            resultados confirmados ficam salvos, inclusive quando a IA está
            indisponível.
          </p>
          {session.status === 'AVAILABLE' && (
            <section className="panel mb-6">
              <h2 className="font-serif text-2xl">Pronta para começar?</h2>
              <p className="my-3 text-sm text-stone-600">
                Pause quando precisar. Ao continuar, você retoma este mesmo
                chat.
              </p>
              {guided ? (
                <Link className="primary-button" href={`${path}/prepare`}>
                  Selecionar protagonista
                </Link>
              ) : session.sessionNumber === 1 &&
                (!preparation.data ||
                  (preparation.data.adventure?.available &&
                    !preparation.data.adventure.reviewed)) ? (
                <Link
                  href={`/campaigns/${campaignId}#preparacao`}
                  className="secondary-button"
                >
                  Conferir preparação da campanha
                </Link>
              ) : (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => transition('start')}
                >
                  Iniciar sessão {session.sessionNumber}
                </button>
              )}
            </section>
          )}
          {session.status === 'LOCKED' && (
            <p className="panel mb-6">
              {campaign?.status === 'COMPLETED'
                ? 'Esta unidade não foi iniciada. A campanha já possui um desfecho confirmado.'
                : 'Conclua a sessão anterior para liberar este capítulo.'}
            </p>
          )}
          {!guided && session.status === 'COMPLETED' && (
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
                    O desfecho da campanha foi registrado.
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
          <div
            className={
              guided
                ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]'
                : undefined
            }
          >
            <div className="min-w-0">
              {(!endedNow || guided) && (
                <section
                  id="history"
                  aria-label="Histórico da sessão"
                  className="panel"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <h2 className="font-serif text-2xl">
                      {guided ? 'Diário de Una' : 'Histórico'}
                    </h2>
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
                        className={
                          guided && message.role === 'GAME_MASTER'
                            ? 'border-b border-stone-200 px-2 pb-5 pt-2'
                            : 'rounded-lg border border-stone-200 bg-white p-4'
                        }
                      >
                        <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-stone-500">
                          <span>
                            {message.role === 'PLAYER'
                              ? [
                                  'OUT_OF_CHARACTER',
                                  'REQUEST_CHECK',
                                  'ROLL_RESULT',
                                ].includes(message.interactionMode ?? '')
                                ? 'Jogadora'
                                : 'Protagonista'
                              : message.role === 'SYSTEM'
                                ? 'Sistema'
                                : message.metadata?.clarification
                                  ? 'Esclarecimento de Una'
                                  : 'Una'}
                            {message.metadata?.queued === true &&
                              ' · Aguardando processamento'}
                            {message.interactionMode
                              ? ` · ${modeLabels[message.interactionMode]}`
                              : ''}
                          </span>
                          <span>
                            #{message.sequenceNumber} ·{' '}
                            {new Date(message.createdAt).toLocaleString(
                              'pt-BR',
                            )}
                          </span>
                        </div>
                        <p
                          className={
                            guided && message.role === 'GAME_MASTER'
                              ? 'whitespace-pre-wrap break-words font-serif text-xl leading-relaxed text-stone-900'
                              : 'whitespace-pre-wrap break-words leading-7'
                          }
                        >
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
              {!guided && process.env.NODE_ENV === 'development' && (
                <AiUsage
                  path={path}
                  revision={`${action?.id}:${action?.status}:${action?.error}`}
                />
              )}
              {session.summary && (
                <p className="panel mt-5 whitespace-pre-wrap">
                  {session.summary}
                </p>
              )}
              {!guided && <div className="mt-5">{progressPanel}</div>}
              {progress.suggestSessionEnding &&
                session.status === 'IN_PROGRESS' && (
                  <p className="panel mt-5">
                    Os objetivos possuem evidências confirmadas. Este pode ser
                    um bom ponto de encerramento; a decisão é sua.
                  </p>
                )}
              {pending && (
                <section className="panel mt-5" aria-label="Turno do Mestre">
                  <p role="status">
                    {busy
                      ? 'Una está respondendo…'
                      : action?.status === 'AWAITING_ROLL'
                        ? `Teste de ${action.pendingRoll?.ability ?? 'habilidade'} aguardando sua rolagem.`
                        : action?.status === 'AWAITING_STUNTS'
                          ? 'O ataque aguarda decisão de façanhas. O dano ainda não foi confirmado.'
                          : 'Turno pendente. Sua mensagem permanece salva para recuperação.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {unsent && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => submitTurn(unsent)}
                      >
                        Recuperar envio
                      </button>
                    )}
                    {!unsent && action?.retryable && (
                      <button
                        className="secondary-button"
                        disabled={busy || session.status !== 'IN_PROGRESS'}
                        onClick={() => continueAction('retry')}
                      >
                        Tentar resposta novamente
                      </button>
                    )}
                    {action?.status === 'AWAITING_ROLL' && (
                      <button
                        className="primary-button"
                        disabled={busy || session.status !== 'IN_PROGRESS'}
                        onClick={() => continueAction('roll')}
                      >
                        Rolar 3d6
                      </button>
                    )}
                    {action?.status === 'AWAITING_STUNTS' && (
                      <button
                        className="secondary-button"
                        disabled={busy || session.status !== 'IN_PROGRESS'}
                        onClick={() => continueAction('decline-npc-stunts')}
                      >
                        Dispensar façanhas deste ataque
                      </button>
                    )}
                    {!unsent && action?.status === 'PENDING' && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => continueAction('cancel')}
                      >
                        Cancelar tentativa sem efeitos
                      </button>
                    )}
                  </div>
                </section>
              )}
              {!endedNow &&
                (!guided ||
                  (session.status === 'IN_PROGRESS' &&
                    messages.some(
                      (message) => message.role === 'GAME_MASTER',
                    ))) && (
                  <form className="panel mt-5 space-y-4" onSubmit={send}>
                    <div className="flex flex-wrap gap-3">
                      <label className="field-label min-w-48 flex-1">
                        Modo de interação
                        <select
                          value={mode}
                          disabled={
                            busy || !!unsent || session.status !== 'IN_PROGRESS'
                          }
                          onChange={(event) => {
                            const next = event.target
                              .value as keyof typeof modeLabels;
                            setDrafts({
                              ...drafts,
                              [mode]: { content, mentions },
                            });
                            setContent(drafts[next]?.content ?? '');
                            setMentions(drafts[next]?.mentions ?? []);
                            setMode(next);
                          }}
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
                      <MentionComposer
                        path={path}
                        content={content}
                        mentions={mentions}
                        disabled={
                          busy || !!unsent || session.status !== 'IN_PROGRESS'
                        }
                        onChange={(value, references) => {
                          setContent(value);
                          setMentions(references);
                        }}
                        placeholder={
                          session.status === 'COMPLETED'
                            ? 'Sessão concluída — histórico somente para leitura.'
                            : session.status === 'PAUSED'
                              ? 'Continue a sessão para enviar mensagens.'
                              : modePlaceholders[mode]
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
                          busy ||
                          !!unsent ||
                          session.status !== 'IN_PROGRESS' ||
                          !content.trim()
                        }
                        type="submit"
                      >
                        Enviar
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={continueNarrative}
                      >
                        Continuar
                      </button>
                    </div>
                  </form>
                )}
              {['IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(
                session.status,
              ) && (
                <div className="mt-6 flex flex-wrap items-end gap-3">
                  {session.status !== 'COMPLETED' && (
                    <>
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          transition(
                            session.status === 'PAUSED' ? 'resume' : 'pause',
                          )
                        }
                      >
                        {session.status === 'PAUSED'
                          ? 'Continuar sessão'
                          : 'Pausar sessão'}
                      </button>
                      {progress.progressionMode !== 'OBJECTIVES' && (
                        <label className="field-label flex-1">
                          Motivo do encerramento
                          <select
                            disabled={busy}
                            value={endingType}
                            onChange={(event) =>
                              setEndingType(event.target.value)
                            }
                          >
                            <option value="PLAYER_REQUESTED">
                              Solicitado pela jogadora
                            </option>
                            <option value="NARRATIVE_PAUSE">
                              Pausa narrativa
                            </option>
                            <option value="OBJECTIVE_COMPLETED">
                              Objetivo concluído
                            </option>
                          </select>
                        </label>
                      )}
                      <button
                        className="secondary-button"
                        disabled={
                          busy ||
                          pending ||
                          (progress.progressionMode === 'OBJECTIVES' &&
                            !progress.suggestSessionEnding)
                        }
                        onClick={() => transition('complete')}
                      >
                        {progress.progressionMode === 'OBJECTIVES'
                          ? 'Concluir sessão'
                          : 'Encerrar sessão'}
                      </button>
                    </>
                  )}
                  {guided && session.sessionNumber === 1 && (
                    <button
                      type="button"
                      ref={resetTrigger}
                      className="secondary-button"
                      onClick={() => setResetOpen(true)}
                    >
                      Reiniciar sessão
                    </button>
                  )}
                </div>
              )}
            </div>
            {guided && (
              <aside className="space-y-4" aria-label="Sessão e companhia">
                {progressPanel}
                <section className="panel space-y-3">
                  <h2 className="font-serif text-xl">Sessão I</h2>
                  <p>
                    {progress.outcome === 'WITHDRAWN'
                      ? 'Retirada definitiva registrada'
                      : sessionLabels[session.status]}
                  </p>
                  {protagonist && <Sheet sheet={protagonist} />}
                  {!!mounts.length && (
                    <details>
                      <summary className="font-medium">Montarias</summary>
                      <ul className="mt-2 space-y-2 text-sm">
                        {mounts.map((mount) => (
                          <li key={mount.id}>
                            <strong>{mount.name}</strong> · Saúde {mount.health}
                            /{mount.maxHealth}
                            <br />
                            {mount.location} ·{' '}
                            {mount.lifeState === 'DEAD'
                              ? 'Morto'
                              : mount.mounted
                                ? 'Montado'
                                : 'Sem cavaleiro'}
                            {mount.conditions.length > 0 &&
                              ` · ${mount.conditions.map((condition) => condition.name).join(', ')}`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <h3 className="font-medium">Companheiros</h3>
                  {companions?.length ? (
                    companions.map((member) => (
                      <details key={member.key}>
                        <summary>{member.name}</summary>
                        <p className="text-sm">
                          {member.people} · {member.role}. {member.presentation}
                        </p>
                      </details>
                    ))
                  ) : (
                    <p className="text-sm">Naelis viaja sozinha.</p>
                  )}
                </section>
              </aside>
            )}
          </div>
        </>
      )}
    </>
  );
}
