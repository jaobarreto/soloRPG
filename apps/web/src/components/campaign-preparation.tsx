'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CampaignDetail,
  CampaignSession,
  PublicCharacter,
} from '@solo-rpg/shared-contracts';
import { apiRequest, errorMessage } from '@/lib/campaign-api';
import { ErrorNotice, useApiData } from './campaign-ui';
import { abilityLabels } from '@/lib/blue-rose-labels';

type ReviewSheet = Pick<
  PublicCharacter,
  'name' | 'kind' | 'people' | 'characterClass' | 'level' | 'abilities'
> & {
  description?: string;
  background?: string;
  health: { current: number; maximum: number } | null;
  features: Pick<
    PublicCharacter['features'][number],
    'name' | 'kind' | 'degree' | 'improved'
  >[];
  equipment: Pick<
    PublicCharacter['inventory'][number],
    'name' | 'quantity' | 'equipped'
  >[];
  armor: string | null;
  shield: string | null;
};

export type CompanionCard = {
  key: string;
  name: string;
  people: string;
  role: string;
  personality: string;
  presentation: string;
};
export type PreparationResponse = {
  adventure:
    | ({
        title: string;
        version: number;
        guided?: boolean;
        companions?: CompanionCard[];
        selectedCompanions?: string[] | null;
        sheets?: ReviewSheet[];
      } & (
        | { available: false }
        | {
            available: true;
            needsParty: boolean;
            reviewed: boolean;
            revision: string;
            errors: string[];
            sheets: ReviewSheet[];
          }
      ))
    | null;
};

const classLabels = {
  ADEPT: 'Adepta',
  EXPERT: 'Especialista',
  WARRIOR: 'Guerreiro',
};
const equipmentLabels: Record<string, string> = {
  NONE: 'Nenhum',
  LIGHT: 'Leve',
  MEDIUM: 'Médio',
  HEAVY: 'Pesado',
};
const featureGroups = [
  ['FOCUS', 'Focos'],
  ['TALENT', 'Talentos'],
  ['ARCANUM', 'Arcanos'],
] as const;
const degreeLabels: Record<string, string> = {
  NOVICE: 'Novato',
  JOURNEYMAN: 'Experiente',
  MASTER: 'Mestre',
};

export function Sheet({ sheet }: { sheet: ReviewSheet }) {
  return (
    <details className="rounded-lg border border-stone-200 p-4">
      <summary className="cursor-pointer font-medium">
        {sheet.name} ·{' '}
        {sheet.kind === 'PROTAGONIST' ? 'Protagonista' : 'Companhia'}
      </summary>
      <div className="mt-3 space-y-2 text-sm text-stone-700">
        <p>
          {sheet.people} ·{' '}
          {sheet.characterClass
            ? classLabels[sheet.characterClass]
            : 'Classe não informada'}{' '}
          · Nível {sheet.level}
        </p>
        {sheet.description && <p>{sheet.description}</p>}
        {sheet.background && <p>Antecedente · {sheet.background}</p>}
        {sheet.health && (
          <p>
            Saúde {sheet.health.current} / {sheet.health.maximum}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-3">
          {Object.entries(abilityLabels).map(([ability, label]) => (
            <div key={ability} className="flex justify-between gap-2">
              <dt>{label}</dt>
              <dd>
                {sheet.abilities[ability as keyof ReviewSheet['abilities']] ??
                  '—'}
              </dd>
            </div>
          ))}
        </dl>
        <p className="font-medium">Equipamentos</p>
        <ul>
          {sheet.equipment.map((item, index) => (
            <li key={index}>
              {item.name} · {item.quantity}
              {item.equipped ? ' · em uso' : ''}
            </li>
          ))}
          {sheet.armor && <li>Armadura · {equipmentLabels[sheet.armor]}</li>}
          {sheet.shield && <li>Escudo · {equipmentLabels[sheet.shield]}</li>}
        </ul>
        {featureGroups.map(([kind, label]) => {
          const features = sheet.features.filter(
            (feature) => feature.kind === kind,
          );
          return (
            features.length > 0 && (
              <div key={kind}>
                <p className="font-medium">{label}</p>
                <ul>
                  {features.map((feature) => (
                    <li key={feature.name}>
                      {feature.name}
                      {feature.degree && ` · ${degreeLabels[feature.degree]}`}
                      {feature.improved && ' · aprimorado'}
                    </li>
                  ))}
                </ul>
              </div>
            )
          );
        })}
      </div>
    </details>
  );
}

export function CampaignPreparation({
  campaign,
}: {
  campaign: CampaignDetail;
}) {
  const router = useRouter();
  const path = `/campaigns/${campaign.id}`;
  const endpoint = `${path}/preparation`;
  const {
    data,
    error: loadError,
    refresh,
  } = useApiData<PreparationResponse>(endpoint);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = campaign.sessions.find(
    (session) => session.sessionNumber === 1,
  );
  const adventure = data?.adventure;

  async function submit(target: string, body: object = {}, redirect?: string) {
    setBusy(true);
    setError('');
    try {
      await apiRequest(target, { method: 'POST', body: JSON.stringify(body) });
      if (redirect) router.push(redirect);
      else await refresh();
    } catch (error) {
      if (redirect && first) {
        // The response may have been lost after the opening committed.
        const session = await apiRequest<CampaignSession>(
          `${path}/sessions/${first.id}`,
        ).catch(() => null);
        if (session?.startedAt) {
          router.push(redirect);
          return;
        }
      }
      setError(errorMessage(error));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!data)
    return (
      <div className="mb-6">
        {loadError ? (
          <>
            <ErrorNotice message={loadError} />
            <button className="secondary-button mt-3" onClick={refresh}>
              Recarregar preparação
            </button>
          </>
        ) : (
          <p role="status">Carregando aventura…</p>
        )}
      </div>
    );
  if (!adventure) return null;
  return (
    <section id="preparacao" className="panel mb-6 space-y-4">
      <p className="eyebrow">Aventura selecionada</p>
      <h2 className="font-serif text-2xl">
        {adventure.title} · v{adventure.version}
      </h2>
      <ErrorNotice message={error || loadError} />
      {adventure.available && (
        <>
          <h3 className="font-serif text-xl">Fichas da campanha</h3>
          {adventure.needsParty ? (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => submit(endpoint)}
            >
              Carregar fichas fornecidas
            </button>
          ) : (
            <>
              <div className="space-y-2">
                {adventure.sheets.map((sheet, index) => (
                  <Sheet key={index} sheet={sheet} />
                ))}
              </div>
              {adventure.errors.length > 0 ? (
                <ul
                  role="alert"
                  className="list-disc pl-5 text-sm text-red-900"
                >
                  {adventure.errors.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              ) : adventure.reviewed ? (
                <>
                  <p role="status">
                    Fichas confirmadas. A abertura de Una será salva no
                    histórico da sessão.
                  </p>
                  {first?.status === 'AVAILABLE' && (
                    <button
                      className="primary-button"
                      disabled={busy || !!loadError}
                      onClick={() =>
                        submit(
                          `${path}/sessions/${first.id}/start`,
                          {},
                          `${path}/sessions/${first.id}#history`,
                        )
                      }
                    >
                      Iniciar aventura
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-stone-600">
                    Confira Naelis e seus companheiros antes de confirmar. A
                    confirmação registra sua conferência das fichas.
                  </p>
                  <button
                    className="primary-button"
                    disabled={busy || !!loadError}
                    onClick={() =>
                      submit(`${endpoint}/confirm`, {
                        confirmed: true,
                        revision: adventure.revision,
                      })
                    }
                  >
                    Confirmar fichas
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
