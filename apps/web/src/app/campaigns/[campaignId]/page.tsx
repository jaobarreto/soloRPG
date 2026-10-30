'use client';
import Link from 'next/link';
import { use } from 'react';
import type { CampaignDetail } from '@solo-rpg/shared-contracts';
import { ErrorNotice, StatusBadge, useApiData } from '@/components/campaign-ui';
import { CampaignForm } from '@/components/campaign-form';
import { campaignLabels, sessionLabels } from '@/lib/campaign-api';
export default function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  const {
    data: campaign,
    error,
    refresh,
  } = useApiData<CampaignDetail>(`/campaigns/${campaignId}`);
  return (
    <>
      <Link href="/campaigns" className="back-link">
        ← Campanhas
      </Link>
      <ErrorNotice message={error} />
      {error && (
        <button className="secondary-button mt-3" onClick={refresh}>
          Tentar novamente
        </button>
      )}
      {!campaign && !error && <p role="status">Carregando campanha…</p>}
      {campaign && (
        <>
          <div className="mb-8 mt-8">
            <StatusBadge label={campaignLabels[campaign.status]} />
            <h1 className="page-title mt-4 break-words">{campaign.title}</h1>
            <p className="mt-4 whitespace-pre-wrap break-words text-stone-600">
              {campaign.description}
            </p>
            <p className="mt-4 text-sm text-stone-500">
              {campaign.currentSessionNumber
                ? `Sessão ${campaign.currentSessionNumber} de ${campaign.plannedSessions}`
                : `${campaign.plannedSessions} sessões planejadas`}{' '}
              · {campaign.defaultSessionDurationMinutes} minutos estimados por
              sessão
            </p>
          </div>
          {campaign.status === 'COMPLETED' && (
            <div className="panel mb-6 border-emerald-200 bg-emerald-50">
              <h2 className="font-serif text-2xl">Campanha concluída</h2>
              <p className="mt-2">
                Todas as sessões planejadas foram encerradas. Seu histórico
                continua disponível abaixo.
              </p>
            </div>
          )}
          <Link
            href={`/campaigns/${campaign.id}/game`}
            className="primary-button mb-6"
          >
            Ficha, dados e mundo →
          </Link>
          <h2 className="mb-4 font-serif text-2xl">Sessões</h2>
          <ol className="space-y-3">
            {campaign.sessions.map((session) => (
              <li
                key={session.id}
                className="panel flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <h3 className="font-medium">
                    {session.sessionNumber}. {session.title}
                  </h3>
                  <p className="mt-1 text-sm text-stone-500">
                    {sessionLabels[session.status]}
                  </p>
                </div>
                {session.status === 'LOCKED' ? (
                  <span className="text-sm text-stone-500">
                    Bloqueada até concluir a anterior
                  </span>
                ) : (
                  <Link
                    className="secondary-button"
                    href={`/campaigns/${campaign.id}/sessions/${session.id}`}
                  >
                    {session.status === 'COMPLETED'
                      ? 'Ver histórico'
                      : session.status === 'AVAILABLE'
                        ? 'Abrir sessão'
                        : 'Continuar no chat'}{' '}
                    →
                  </Link>
                )}
              </li>
            ))}
          </ol>
          <details className="mt-8">
            <summary className="cursor-pointer text-sm underline">
              Editar título e descrição
            </summary>
            <div className="mt-4">
              <CampaignForm campaign={campaign} onSaved={refresh} />
            </div>
          </details>
        </>
      )}
    </>
  );
}
