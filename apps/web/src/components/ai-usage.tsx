'use client';
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/campaign-api';
type Usage = {
  provider: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  errors: number;
};
export function AiUsage({
  path,
  revision,
}: {
  path: string;
  revision: string;
}) {
  const [rows, setRows] = useState<Usage[]>([]);
  useEffect(() => {
    let active = true;
    apiRequest<Usage[]>(`${path}/ai-usage`)
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [path, revision]);
  return (
    <details className="panel mt-5 text-sm">
      <summary>Uso da IA · desenvolvimento</summary>
      <p className="mt-3 text-stone-600">
        O contexto e as mensagens enviados ao provedor deixam esta máquina. Use
        uma conta gratuita sem faturamento.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3">Nenhuma métrica registrada nesta sessão.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={`${row.provider}:${row.model}`}>
              {row.provider} · {row.model}: {row.requests} requisições ·{' '}
              {row.inputTokens} tokens de entrada · {row.outputTokens} de saída
              · {row.errors} falhas.
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
