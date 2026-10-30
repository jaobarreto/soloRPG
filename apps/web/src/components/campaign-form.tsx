'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Campaign, CampaignDetail } from '@solo-rpg/shared-contracts';
import { apiRequest, errorMessage } from '@/lib/campaign-api';
import { ErrorNotice } from './campaign-ui';
export function CampaignForm({
  campaign,
  onSaved,
}: {
  campaign?: Campaign;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const body = {
      title: String(form.get('title')).trim(),
      description: String(form.get('description')).trim() || null,
      ...(!campaign
        ? {
            plannedSessions: Number(form.get('plannedSessions')),
            defaultSessionDurationMinutes: Number(form.get('duration')),
          }
        : {}),
    };
    try {
      const result = await apiRequest<CampaignDetail>(
        campaign ? `/campaigns/${campaign.id}` : '/campaigns',
        { method: campaign ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      if (campaign) onSaved?.();
      else router.push(`/campaigns/${result.id}`);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel space-y-5">
      <ErrorNotice message={error} />
      <label className="field-label">
        Título
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={campaign?.title}
          placeholder="Os Ecos da Montanha"
        />
      </label>
      <label className="field-label">
        Descrição
        <textarea
          name="description"
          rows={3}
          maxLength={10000}
          defaultValue={campaign?.description ?? ''}
          placeholder="O ponto de partida da sua aventura…"
        />
      </label>
      {!campaign && (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="field-label">
            Quantidade de sessões
            <input
              name="plannedSessions"
              type="number"
              min={1}
              max={1000}
              required
              defaultValue={8}
            />
          </label>
          <label className="field-label">
            Duração estimada por sessão (minutos)
            <input
              name="duration"
              type="number"
              min={1}
              max={10080}
              required
              defaultValue={120}
            />
          </label>
        </div>
      )}
      {!campaign && (
        <p className="text-sm text-stone-500">
          A duração é uma referência. Você decide quando pausar ou encerrar cada
          sessão.
        </p>
      )}
      <button disabled={busy} className="primary-button" type="submit">
        {busy ? 'Salvando…' : campaign ? 'Salvar alterações' : 'Criar campanha'}
      </button>
    </form>
  );
}
