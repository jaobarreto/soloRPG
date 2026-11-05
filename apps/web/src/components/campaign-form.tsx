'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Campaign, CampaignDetail } from '@solo-rpg/shared-contracts';
import { apiRequest, errorMessage, requestId } from '@/lib/campaign-api';
import { ErrorNotice } from './campaign-ui';
const creationStorageKey = 'solo-rpg:campaign-create';

function creationRequest(details: {
  title: string;
  description: string | null;
}) {
  const stored = sessionStorage.getItem(creationStorageKey);
  const fingerprint = JSON.stringify(details);
  const id =
    stored?.slice(36) === fingerprint ? stored.slice(0, 36) : requestId();
  sessionStorage.setItem(creationStorageKey, id + fingerprint);
  return { ...details, requestId: id };
}

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
    };
    try {
      const result = await apiRequest<CampaignDetail>(
        campaign ? `/campaigns/${campaign.id}` : '/campaigns',
        {
          method: campaign ? 'PATCH' : 'POST',
          body: JSON.stringify(campaign ? body : creationRequest(body)),
        },
      );
      if (campaign) onSaved?.();
      else {
        sessionStorage.removeItem(creationStorageKey);
        router.push(`/campaigns/${result.id}`);
      }
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    } finally {
      if (campaign) setBusy(false);
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
        <p className="text-sm text-stone-500">
          Aventura padrão: Gloamhale v5. Depois de criar a campanha, confira as
          fichas fornecidas.
        </p>
      )}
      <button disabled={busy} className="primary-button" type="submit">
        {busy ? 'Salvando…' : campaign ? 'Salvar alterações' : 'Criar campanha'}
      </button>
    </form>
  );
}
