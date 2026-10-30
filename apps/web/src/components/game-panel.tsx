'use client';
import { BlueRoseMechanics } from './blue-rose-mechanics';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import {
  abilities,
  type CampaignDetail,
  type GamePage,
  type PublicCharacter,
  type PublicCheckRequest,
  type PublicRelationship,
  type PublicRoll,
  type PublicWorldEntity,
} from '@solo-rpg/shared-contracts';
import { ErrorNotice, StatusBadge, useApiData } from './campaign-ui';
import { apiRequest, errorMessage, sessionLabels } from '@/lib/campaign-api';

type Rule = { id: string; name: string; kind: string; status: string };
const labels: Record<(typeof abilities)[number], string> = {
  ACCURACY: 'Precisão',
  COMMUNICATION: 'Comunicação',
  CONSTITUTION: 'Constituição',
  DEXTERITY: 'Destreza',
  FIGHTING: 'Luta',
  INTELLIGENCE: 'Inteligência',
  PERCEPTION: 'Percepção',
  STRENGTH: 'Força',
  WILLPOWER: 'Vontade',
};
function commandId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function Dice({ roll }: { roll: PublicRoll }) {
  return (
    <div
      className="rounded-xl border border-rose-200 bg-rose-50 p-4"
      aria-label="Resultado oficial da rolagem"
    >
      <div className="flex flex-wrap items-center gap-3">
        {roll.dice.map((die, index) => (
          <span
            key={index}
            aria-label={`${index === 2 ? 'Drama Die' : 'Dado ' + (index + 1)}: ${die}`}
            className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 text-xl font-bold ${index === 2 ? 'border-rose-600 bg-rose-700 text-white' : 'border-stone-300 bg-white'}`}
          >
            {die}
          </span>
        ))}
        <span className="font-medium">
          {roll.modifier >= 0 ? '+' : ''}
          {roll.modifier} = {roll.total}
        </span>
      </div>
      <p className="mt-3 text-sm">
        Terceiro dado: Drama Die ·{' '}
        {roll.success === null
          ? 'Rolagem livre'
          : roll.success
            ? 'Sucesso'
            : 'Falha'}{' '}
        · {roll.stuntPoints} SP gerados
      </p>
      <p className="mt-1 text-xs text-stone-600">
        {roll.reason} ·{' '}
        {roll.visibility === 'PLAYER_ONLY' ? 'Somente jogadora' : 'Pública'}
      </p>
    </div>
  );
}
export function GamePanel({ campaignId }: { campaignId: string }) {
  const base = `/campaigns/${campaignId}`;
  const campaign = useApiData<CampaignDetail>(base);
  const characters = useApiData<PublicCharacter[]>(`${base}/characters`);
  const world = useApiData<PublicWorldEntity[]>(`${base}/world-state`);
  const relationships = useApiData<PublicRelationship[]>(
    `${base}/relationships`,
  );
  const requests = useApiData<PublicCheckRequest[]>(
    `${base}/blue-rose/requests`,
  );
  const rules = useApiData<Rule[]>('/blue-rose/rules');
  const history = useApiData<GamePage<PublicRoll>>(`${base}/blue-rose/rolls`);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [latest, setLatest] = useState<PublicRoll | null>(null);
  const [older, setOlder] = useState<PublicRoll[]>([]),
    [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const pending = useRef(new Map<string, string>());
  const actor =
    characters.data?.find((c) => c.id === selected) ??
    characters.data?.find((c) => c.kind === 'PROTAGONIST') ??
    characters.data?.[0];
  const active = campaign.data?.sessions.find(
    (s) => s.status === 'IN_PROGRESS',
  );
  async function perform(
    path: string,
    body: Record<string, unknown>,
    method = 'POST',
  ) {
    const signature = JSON.stringify({ path, body, method });
    let key = pending.current.get(signature);
    if (!key) {
      key = commandId();
      pending.current.set(signature, key);
    }
    setBusy(true);
    setError('');
    try {
      const result = await apiRequest<PublicCharacter | PublicRoll>(path, {
        method,
        body: JSON.stringify({ ...body, commandId: key }),
      });
      pending.current.delete(signature);
      if ('dice' in result) setLatest(result);
      await Promise.all([
        characters.refresh(),
        requests.refresh(),
        history.refresh(),
      ]);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function loadMore() {
    const after = cursor === undefined ? history.data?.nextCursor : cursor;
    if (after === null || after === undefined) return;
    setBusy(true);
    setError('');
    try {
      const page = await apiRequest<GamePage<PublicRoll>>(
        `${base}/blue-rose/rolls?after=${after}`,
      );
      setOlder((previous) => [...previous, ...page.data]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const rolls = Array.from(
    new Map(
      [...(history.data?.data ?? []), ...older].map((r) => [r.id, r]),
    ).values(),
  );
  const failure =
    error ||
    campaign.error ||
    characters.error ||
    world.error ||
    relationships.error ||
    requests.error ||
    rules.error ||
    history.error;
  return (
    <>
      <Link href={`/campaigns/${campaignId}`} className="back-link">
        ← Campanha e sessões
      </Link>
      <header className="mb-8 mt-8">
        <StatusBadge label="Blue Rose · AGE · 2ª edição" />
        <h1 className="page-title mt-4">Ficha e mundo</h1>
        <p className="mt-3 text-stone-600">
          {campaign.data?.title ?? 'Carregando campanha…'}
        </p>
        {campaign.data && (
          <p className="mt-3 text-sm">
            {active
              ? `${active.title} · ${sessionLabels[active.status]}`
              : campaign.data.sessions.some((s) => s.status === 'PAUSED')
                ? 'Sessão pausada. Retome o chat para rolar.'
                : 'Nenhuma sessão em andamento.'}{' '}
            {active && (
              <Link
                className="underline"
                href={`${base}/sessions/${active.id}`}
              >
                Voltar ao chat
              </Link>
            )}
          </p>
        )}
      </header>
      <ErrorNotice message={failure} />
      {!characters.data && !characters.error && (
        <p role="status" className="mt-6">
          Carregando fichas…
        </p>
      )}
      {characters.data &&
        !characters.data.some((c) => c.kind === 'PROTAGONIST') &&
        campaign.data?.status === 'DRAFT' && (
          <CreateSheet
            rules={rules.data ?? []}
            busy={busy}
            onCreate={(body) => perform(`${base}/characters`, body)}
          />
        )}
      {characters.data &&
        characters.data.length === 0 &&
        campaign.data?.status !== 'DRAFT' && (
          <p className="panel mt-6">
            Nenhuma ficha disponível. O cadastro inicial durante uma campanha em
            andamento é feito pela ferramenta local do Mestre.
          </p>
        )}
      {!!characters.data?.length && (
        <div className="my-6">
          <label className="field-label" htmlFor="character-picker">
            Personagens conhecidos
          </label>
          <select
            id="character-picker"
            className="form-input"
            value={actor?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            {characters.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ·{' '}
                {c.kind === 'PROTAGONIST'
                  ? 'Protagonista'
                  : c.kind === 'COMPANION'
                    ? 'Companheiro'
                    : 'NPC / adversário'}
              </option>
            ))}
          </select>
        </div>
      )}
      {actor && (
        <section className="panel mt-6" aria-label="Ficha de personagem">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-serif text-3xl">{actor.name}</h2>
            <StatusBadge
              label={`Nível ${actor.level} · ${actor.characterClass ?? 'Sem classe'}`}
            />
          </div>
          <p className="mt-2 text-sm text-stone-600">
            {actor.people} · {actor.background}
          </p>
          <p className="mt-3 whitespace-pre-wrap">{actor.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {abilities.map((a) => (
              <div key={a} className="rounded-lg bg-stone-100 p-3">
                <dt className="text-xs text-stone-600">{labels[a]}</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {actor.abilities[a] ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-6">
            {actor.resources.map((r) => (
              <div key={r.name}>
                <p className="text-sm font-medium">
                  {r.name === 'HEALTH'
                    ? 'Vida'
                    : r.name === 'CONVICTION'
                      ? 'Convicção'
                      : 'Corrupção'}
                  : {r.current}/{r.maximum}
                </p>
                <meter
                  className="mt-2 w-40"
                  min={0}
                  max={r.maximum || 1}
                  value={r.current}
                  aria-label={r.name}
                />
              </div>
            ))}
          </div>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            {[
              ['Chamado', actor.calling],
              ['Destino', actor.destiny],
              ['Sina', actor.fate],
            ].map(([title, value]) => (
              <div key={title}>
                <dt className="font-medium">{title}</dt>
                <dd>{value || 'Não registrado'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm">
            Idiomas: {actor.languages.join(', ') || 'Nenhum registrado'}
          </p>
          <p className="mt-2 text-sm">
            Objetivos: {actor.goals.join(' · ') || 'Nenhum registrado'}
          </p>
          <p className="mt-3 text-sm">
            {actor.personality} {actor.motivations} {actor.state}
          </p>
          <h3 className="mt-6 font-medium">Focos, talentos e arcanos</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {actor.features.map((f) => (
              <li key={f.ruleId}>
                {f.name} {f.degree ? `· ${f.degree}` : ''} ·{' '}
                {f.kind === 'FOCUS' && f.status === 'IMPLEMENTED'
                  ? `Foco +${f.improved ? 3 : 2}`
                  : 'Registro sem efeitos automáticos'}
              </li>
            ))}
          </ul>
          {!actor.features.length && (
            <p className="mt-2 text-sm text-stone-500">Nenhum registrado.</p>
          )}
          <p className="mt-4 text-sm">
            Fadiga: {actor.fatigueLevel} · Estado: {actor.lifeState}
          </p>
          <h3 className="mt-6 font-medium">Condições</h3>
          {actor.conditions.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {actor.conditions.map((c) => (
                <li key={c.id}>
                  {c.name} — {c.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-stone-500">
              Nenhuma condição pública registrada.
            </p>
          )}
          <h3 className="mt-6 font-medium">Inventário</h3>
          {!actor.inventory.length && (
            <p className="mt-2 text-sm text-stone-500">
              Nenhum item registrado.
            </p>
          )}
          <ul className="mt-3 space-y-3">
            {actor.inventory.map((item) => (
              <li
                key={item.itemId}
                className="rounded-lg border border-stone-200 p-3"
              >
                <p className="font-medium">
                  {item.quantity} × {item.name}{' '}
                  {item.equipped ? '· Equipado' : ''}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {item.description}
                </p>
                {actor.kind === 'PROTAGONIST' && active && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() =>
                        perform(`/characters/${actor.id}/inventory/actions`, {
                          sessionId: active.id,
                          itemId: item.itemId,
                          action: item.equipped ? 'UNEQUIP' : 'EQUIP',
                        })
                      }
                    >
                      {item.equipped ? 'Desequipar' : 'Equipar'}
                    </button>
                    {item.consumable && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          perform(`/characters/${actor.id}/inventory/actions`, {
                            sessionId: active.id,
                            itemId: item.itemId,
                            action: 'CONSUME',
                            quantity: 1,
                          })
                        }
                      >
                        Consumir 1
                      </button>
                    )}
                    <label className="text-sm">
                      Transferir 1 para
                      <select
                        className="form-input ml-2"
                        disabled={busy}
                        value=""
                        onChange={(e) => {
                          if (e.target.value)
                            void perform(
                              `/characters/${actor.id}/inventory/actions`,
                              {
                                sessionId: active.id,
                                itemId: item.itemId,
                                action: 'TRANSFER',
                                toCharacterId: e.target.value,
                                quantity: 1,
                              },
                            );
                        }}
                      >
                        <option value="">Selecionar…</option>
                        {characters.data
                          ?.filter((c) => c.id !== actor.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="panel mt-6" aria-label="Rolagens">
        <h2 className="font-serif text-2xl">Dados e testes</h2>
        <p className="mt-2 text-sm text-stone-600">
          O servidor gera os dados. Rolagens livres não geram Stunt Points;
          testes usam o atributo e o foco da ficha.
        </p>
        <button
          className="primary-button mt-4"
          disabled={busy || !active}
          onClick={() =>
            active &&
            perform(`${base}/blue-rose/rolls`, { sessionId: active.id })
          }
        >
          Rolar 3d6
        </button>
        {!!requests.data?.length && (
          <ul className="mt-4 space-y-3">
            {requests.data.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <span>
                  {r.reason} · {labels[r.ability]}
                </span>
                <button
                  disabled={busy || !active}
                  className="secondary-button"
                  onClick={() =>
                    perform(`${base}/blue-rose/checks`, { requestId: r.id })
                  }
                >
                  Resolver teste
                </button>
              </li>
            ))}
          </ul>
        )}
        {busy && (
          <p className="mt-3 text-sm" role="status">
            Registrando no servidor…
          </p>
        )}
        {latest && (
          <div className="mt-5" aria-live="polite">
            <Dice roll={latest} />
          </div>
        )}
        <p className="mt-4 text-xs text-stone-600">
          SP de combate são usados na resolução imediata do ataque. Pontos de
          outros testes ainda não têm efeitos automatizados e não acumulam
          saldo.
        </p>
        <details className="mt-6">
          <summary className="cursor-pointer font-medium">
            Histórico de rolagens visíveis
          </summary>
          <ol className="mt-4 space-y-3">
            {rolls.map((r) => (
              <li key={r.id}>
                <p className="mb-1 text-xs text-stone-500">
                  {new Date(r.createdAt).toLocaleString('pt-BR')}
                </p>
                <Dice roll={r} />
              </li>
            ))}
          </ol>
          {!rolls.length && (
            <p className="mt-3 text-sm text-stone-500">
              Nenhuma rolagem visível.
            </p>
          )}
          {(cursor === undefined ? history.data?.hasMore : cursor !== null) && (
            <button
              className="secondary-button mt-4"
              disabled={busy}
              onClick={loadMore}
            >
              Carregar próximas rolagens
            </button>
          )}
        </details>
      </section>
      <BlueRoseMechanics
        campaignId={campaignId}
        characters={characters.data ?? []}
        active={!!active}
        onChange={async () => {
          await Promise.all([
            characters.refresh(),
            requests.refresh(),
            history.refresh(),
          ]);
        }}
      />
      <section className="panel mt-6">
        <h2 className="font-serif text-2xl">Estado do mundo</h2>
        <ul className="mt-4 space-y-4">
          {world.data?.map((w) => (
            <li key={w.id}>
              <p className="font-medium">
                {w.name} · {w.status}
              </p>
              <p className="mt-1 text-sm">
                {w.description} · {w.accessible ? 'Acessível' : 'Inacessível'}
              </p>
            </li>
          ))}
        </ul>
        {!world.data?.length && (
          <p className="mt-3 text-sm text-stone-500">
            Nenhum local ou objeto público registrado.
          </p>
        )}
      </section>
      <section className="panel mt-6">
        <h2 className="font-serif text-2xl">Relacionamentos</h2>
        <p className="mt-2 text-xs text-stone-500">
          Indicadores narrativos SoloRPG. Os números não determinam o
          comportamento dos NPCs.
        </p>
        <ul className="mt-4 space-y-3 text-sm">
          {relationships.data?.map((r) => (
            <li key={`${r.fromCharacterId}-${r.toCharacterId}-${r.metric}`}>
              {characters.data?.find((c) => c.id === r.fromCharacterId)?.name} →{' '}
              {characters.data?.find((c) => c.id === r.toCharacterId)?.name}:{' '}
              {r.metric} {r.value} ({r.minimum} a {r.maximum})
              <p className="mt-1 text-stone-500">{r.reason}</p>
            </li>
          ))}
        </ul>
        {!relationships.data?.length && (
          <p className="mt-3 text-sm text-stone-500">
            Nenhum relacionamento público registrado.
          </p>
        )}
      </section>
    </>
  );
}
function CreateSheet({
  rules,
  busy,
  onCreate,
}: {
  rules: Rule[];
  busy: boolean;
  onCreate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const split = (key: string) =>
      String(data.get(key) || '')
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
    await onCreate({
      name: data.get('name'),
      description: data.get('description'),
      people: data.get('people'),
      characterClass: data.get('characterClass'),
      background: data.get('background'),
      level: Number(data.get('level')),
      maxHealth: Number(data.get('maxHealth')),
      abilities: Object.fromEntries(
        abilities.map((a) => [a, Number(data.get(a))]),
      ),
      calling: data.get('calling'),
      destiny: data.get('destiny'),
      fate: data.get('fate'),
      languages: split('languages'),
      goals: split('goals'),
      features: data.getAll('features').map((id) => {
        const rule = rules.find((r) => r.id === id);
        return {
          ruleId: id,
          ...(rule?.kind === 'TALENT' || rule?.kind === 'SPECIALIZATION'
            ? { degree: 'NOVICE' }
            : {}),
        };
      }),
    });
  }
  return (
    <section className="panel mt-6">
      <h2 className="font-serif text-2xl">Sua protagonista</h2>
      <p className="mt-2 text-sm text-stone-600">
        Transcreva uma ficha Blue Rose AGE existente. A criação por pontos,
        benefícios de classe e progressão ainda não são automatizados. Os
        valores mecânicos ficam protegidos depois de iniciar a campanha.
      </p>
      <button
        className="secondary-button mt-4"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? 'Fechar cadastro' : 'Cadastrar ficha'}
      </button>
      {expanded && (
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['name', 'Nome'],
              ['people', 'Povo'],
              ['background', 'Antecedente'],
            ].map(([name, label]) => (
              <label key={name} className="field-label">
                {label}
                <input
                  className="form-input mt-1"
                  name={name}
                  required
                  maxLength={200}
                />
              </label>
            ))}
            <label className="field-label">
              Classe
              <select name="characterClass" className="form-input mt-1">
                <option value="ADEPT">Adepto</option>
                <option value="EXPERT">Especialista</option>
                <option value="WARRIOR">Guerreiro</option>
              </select>
            </label>
            <label className="field-label">
              Nível
              <input
                className="form-input mt-1"
                name="level"
                type="number"
                min={1}
                max={20}
                defaultValue={1}
                required
              />
            </label>
            <label className="field-label">
              Vida máxima da ficha
              <input
                className="form-input mt-1"
                name="maxHealth"
                type="number"
                min={1}
                max={10000}
                required
              />
            </label>
          </div>
          <label className="field-label">
            Descrição
            <textarea
              className="form-input mt-1"
              name="description"
              maxLength={10000}
            />
          </label>
          <fieldset>
            <legend className="mb-3 font-medium">Atributos da ficha</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {abilities.map((a) => (
                <label className="field-label" key={a}>
                  {labels[a]}
                  <input
                    name={a}
                    className="form-input mt-1"
                    type="number"
                    min={-10}
                    max={30}
                    defaultValue={0}
                    required
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ['calling', 'Chamado'],
              ['destiny', 'Destino'],
              ['fate', 'Sina'],
            ].map(([name, label]) => (
              <label key={name} className="field-label">
                {label}
                <input
                  className="form-input mt-1"
                  name={name}
                  maxLength={200}
                />
              </label>
            ))}
          </div>
          {[
            ['languages', 'Idiomas (um por linha)'],
            ['goals', 'Objetivos (um por linha)'],
          ].map(([name, label]) => (
            <label key={name} className="field-label">
              {label}
              <textarea
                name={name}
                className="form-input mt-1"
                maxLength={6000}
              />
            </label>
          ))}
          <fieldset>
            <legend className="mb-2 font-medium">Catálogo inicial</legend>
            <p className="mb-3 text-xs text-stone-500">
              Talentos e especializações são registrados em grau Novice. Seus
              efeitos e requisitos aguardam automação.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {rules
                .filter((r) => r.status !== 'PENDING' && r.kind !== 'STUNT')
                .map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="features" value={r.id} />
                    {r.name} ·{' '}
                    {r.kind === 'FOCUS'
                      ? 'Foco +2'
                      : r.id === 'cure'
                        ? 'Curar: tradição de Cura'
                        : 'Somente registro'}
                  </label>
                ))}
            </div>
          </fieldset>
          <button className="primary-button" disabled={busy}>
            Salvar ficha
          </button>
        </form>
      )}
    </section>
  );
}
