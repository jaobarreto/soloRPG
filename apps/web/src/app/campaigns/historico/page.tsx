'use client';
import Link from 'next/link';
import {
  libraryEndpoint,
  type LibraryAdventure,
} from '@/lib/adventure-library';
import type { Campaign } from '@solo-rpg/shared-contracts';
import { ErrorNotice, StatusBadge, useApiData } from '@/components/campaign-ui';
import { campaignLabels } from '@/lib/campaign-api';
export default function CampaignsPage() {
  const {
    data: campaigns,
    error,
    refresh,
  } = useApiData<Campaign[]>('/campaigns');
  const library = useApiData<LibraryAdventure>(libraryEndpoint);
  const history = campaigns?.filter(
    (campaign) => campaign.id !== library.data?.campaignId,
  );
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Suas histórias</p>
          <h1 className="page-title">Campanhas anteriores</h1>
        </div>
        <Link className="primary-button" href="/campaigns">
          Voltar à biblioteca
        </Link>
      </div>
      <ErrorNotice message={error} />
      {error && (
        <button className="secondary-button mt-3" onClick={refresh}>
          Tentar novamente
        </button>
      )}
      {!campaigns && !error && <p role="status">Carregando campanhas…</p>}
      {history?.length === 0 && (
        <section className="panel py-12 text-center">
          <h2 className="font-serif text-2xl">
            Seu arquivo de campanhas está vazio.
          </h2>
          <p className="mt-3 text-stone-600">
            As aventuras disponíveis ficam na biblioteca.
          </p>
        </section>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {history?.map((campaign) => (
          <li key={campaign.id} className="panel">
            <div className="mb-4">
              <StatusBadge label={campaignLabels[campaign.status]} />
            </div>
            <h2 className="break-words font-serif text-2xl">
              <Link
                href={`/campaigns/${campaign.id}`}
                className="underline decoration-stone-300 underline-offset-4"
              >
                {campaign.title}
              </Link>
            </h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-stone-600">
              {campaign.description ?? 'Sem descrição.'}
            </p>
            <p className="mt-6 text-sm text-stone-500">
              {campaign.plannedSessions} sessões ·{' '}
              {campaign.currentSessionNumber
                ? `Sessão atual: ${campaign.currentSessionNumber}`
                : 'Ainda não iniciada'}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
