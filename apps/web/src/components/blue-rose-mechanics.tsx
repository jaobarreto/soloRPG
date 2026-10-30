'use client';
import { useRef, useState } from 'react';
import type { PublicCombat, PublicCharacter } from '@solo-rpg/shared-contracts';
import { apiRequest, errorMessage } from '@/lib/campaign-api';
import { ErrorNotice, useApiData } from './campaign-ui';
export function BlueRoseMechanics({
  campaignId,
  characters,
  active,
  onChange,
}: {
  campaignId: string;
  characters: PublicCharacter[];
  active: boolean;
  onChange: () => Promise<void>;
}) {
  const base = `/campaigns/${campaignId}/blue-rose`,
    combat = useApiData<PublicCombat | null>(`${base}/combat`),
    arcana = useApiData<
      { id: string; characterId: string; targetId: string }[]
    >(`${base}/arcana/requests`),
    tasks = useApiData<
      {
        id: string;
        reason: string;
        progress: number;
        threshold: number;
        attempts: number;
        intervalMinutes: number;
      }[]
    >(`${base}/advanced-tests`),
    catalog = useApiData<{
      implemented: { id: string; name: string; cost: number }[];
    }>('/blue-rose/stunts');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [targetId, setTarget] = useState(''),
    [stunts, setStunts] = useState<string[]>([]),
    [x, setX] = useState(0),
    [y, setY] = useState(0);
  const pendingKeys = useRef(new Map<string, string>());
  const pc = characters.find((c) => c.kind === 'PROTAGONIST'),
    state = combat.data,
    own = state?.members.find((m) => m.characterId === pc?.id),
    pending = state?.pendingAttacks.find((a) => a.actorId === pc?.id);
  async function send(path: string, body: Record<string, unknown>) {
    const signature = JSON.stringify({ path, body });
    let commandId = pendingKeys.current.get(signature);
    if (!commandId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 15) | 64;
      bytes[8] = (bytes[8]! & 63) | 128;
      const hex = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      commandId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      pendingKeys.current.set(signature, commandId);
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest(path, {
        method: 'POST',
        body: JSON.stringify({ ...body, commandId }),
      });
      pendingKeys.current.delete(signature);
      setStunts([]);
      await Promise.all([
        combat.refresh(),
        arcana.refresh(),
        tasks.refresh(),
        onChange(),
      ]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function action(action: string, extra: Record<string, unknown> = {}) {
    if (state && pc)
      void send(`${base}/combat/actions`, {
        sessionId: state.sessionId,
        encounterId: state.id,
        characterId: pc.id,
        action,
        ...extra,
      });
  }
  const acting = active && state?.turnCharacterId === pc?.id && !busy;
  return (
    <>
      <section className="panel mt-6">
        <h2 className="font-serif text-2xl">Combate Blue Rose</h2>
        <ErrorNotice
          message={
            error ||
            combat.error ||
            arcana.error ||
            tasks.error ||
            catalog.error
          }
        />
        {!state && (
          <p className="mt-3 text-sm text-stone-500">
            Nenhum encontro público em andamento. O Mestre prepara os
            participantes e equipamentos pela ferramenta local.
          </p>
        )}
        {state && (
          <>
            <p className="mt-3 text-sm">
              Rodada {state.round} · Turno de{' '}
              {
                state.members.find(
                  (m) => m.characterId === state.turnCharacterId,
                )?.name
              }
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {state.members.map((m) => (
                <li
                  key={m.characterId}
                  className="rounded-lg border border-stone-200 p-3"
                >
                  {m.name} · Iniciativa {m.initiative} · Vida {m.health} ·
                  Posição ({m.x}, {m.y}) {m.prone ? '· Caído' : ''} ·{' '}
                  {m.lifeState}
                </li>
              ))}
            </ul>
            {own && (
              <p className="mt-3 text-xs text-stone-500">
                Ação maior: {own.majorUsed ? 'usada' : 'disponível'} · Ações
                menores usadas: {own.minorUsed}
              </p>
            )}
            {pending ? (
              <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-4">
                <h3 className="font-medium">
                  Escolha imediata de Stunts · {pending.stuntPoints} SP
                </h3>
                <p className="mt-1 text-sm">
                  Selecione os efeitos para este ataque ou confirme sem Stunts.
                  Os pontos restantes serão descartados.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {catalog.data?.implemented.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={stunts.includes(s.id)}
                        onChange={(e) =>
                          setStunts((old) =>
                            e.target.checked
                              ? [...old, s.id]
                              : old.filter((id) => id !== s.id),
                          )
                        }
                      />
                      {s.name} · {s.cost} SP
                    </label>
                  ))}
                </div>
                <button
                  className="primary-button mt-4"
                  disabled={!acting}
                  onClick={() =>
                    send(`${base}/combat/stunts`, {
                      sessionId: state.sessionId,
                      attackId: pending.id,
                      stunts,
                    })
                  }
                >
                  Confirmar dano e Stunts
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="field-label">
                  Alvo do ataque
                  <select
                    value={targetId}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Selecionar…</option>
                    {state.members
                      .filter((m) => m.characterId !== pc?.id && m.health > 0)
                      .map((m) => (
                        <option key={m.characterId} value={m.characterId}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="primary-button"
                    disabled={!acting || !targetId}
                    onClick={() => action('ATTACK', { targetId })}
                  >
                    Atacar
                  </button>
                  {[
                    ['AIM', 'Mirar'],
                    ['DEFEND', 'Defender'],
                    ['STAND', 'Levantar'],
                    ['RELOAD', 'Recarregar'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className="secondary-button"
                      disabled={!acting}
                      onClick={() => action(id!)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="field-label w-24">
                    X
                    <input
                      aria-label="Destino X"
                      type="number"
                      value={x}
                      onChange={(e) => setX(Number(e.target.value))}
                    />
                  </label>
                  <label className="field-label w-24">
                    Y
                    <input
                      aria-label="Destino Y"
                      type="number"
                      value={y}
                      onChange={(e) => setY(Number(e.target.value))}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    disabled={!acting}
                    onClick={() => action('MOVE', { x, y })}
                  >
                    Mover
                  </button>
                </div>
              </div>
            )}
            <button
              className="secondary-button mt-4"
              disabled={!acting}
              onClick={() => action('END_TURN')}
            >
              Encerrar turno {pending ? 'e descartar SP' : ''}
            </button>
            <p className="mt-3 text-xs text-stone-500">
              Combate básico a pé, níveis 1–2. A API valida turno, ações,
              alcance, equipamento, proteção e dano.
            </p>
          </>
        )}
      </section>
      <section className="panel mt-6">
        <h2 className="font-serif text-2xl">Arcanos</h2>
        <p className="mt-2 text-sm text-stone-600">
          Curar está automatizado pela tradição de Cura, fora de combate. Toque
          e alvo são aprovados pelo Mestre; o servidor calcula cura, limite por
          alvo e fadiga.
        </p>
        <ul className="mt-3 space-y-3">
          {arcana.data?.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <span>
                Curar{' '}
                {characters.find((c) => c.id === a.targetId)?.name ??
                  'alvo aprovado'}
              </span>
              <button
                className="secondary-button"
                disabled={busy || !active}
                onClick={() => send(`${base}/arcana/cure`, { requestId: a.id })}
              >
                Usar Curar
              </button>
            </li>
          ))}
        </ul>
        {!arcana.data?.length && (
          <p className="mt-3 text-sm text-stone-500">
            Nenhum uso de arcano aguardando resolução.
          </p>
        )}
      </section>
      {!!tasks.data?.length && (
        <section className="panel mt-6">
          <h2 className="font-serif text-2xl">Testes prolongados</h2>
          <ul className="mt-3 space-y-3">
            {tasks.data.map((t) => (
              <li key={t.id}>
                <p>
                  {t.reason} · {t.progress}/{t.threshold}
                </p>
                <progress
                  value={Math.min(t.progress, t.threshold)}
                  max={t.threshold}
                  aria-label={t.reason}
                />
                <p className="text-xs text-stone-500">
                  {t.attempts} tentativas · {t.attempts * t.intervalMinutes}{' '}
                  minutos de jogo
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
