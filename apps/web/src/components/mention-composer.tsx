'use client';
import { useEffect, useRef, useState } from 'react';
import {
  mentionCatalogSchema,
  type MentionCandidate,
  type ResolvedMention,
} from '@solo-rpg/shared-contracts';
import { apiRequest } from '@/lib/campaign-api';
import { editMentions, mentionQuery, selectMention } from '@/lib/mentions';

export function MentionComposer({
  path,
  content,
  mentions,
  disabled,
  placeholder,
  onChange,
}: {
  path: string;
  content: string;
  mentions: ResolvedMention[];
  disabled: boolean;
  placeholder: string;
  onChange: (content: string, mentions: ResolvedMention[]) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data: MentionCandidate[];
    hasMore: boolean;
    error?: boolean;
  }>({ key: '', data: [], hasMore: false });
  const query = mentionQuery(content, cursor, mentions);
  const querySymbol = query?.symbol;
  const queryText = query?.query;
  const queryKey = query
    ? `${query.start}:${query.end}:${query.symbol}:${query.query}`
    : '';
  const open = !!query && dismissed !== queryKey && !disabled;
  useEffect(() => {
    if (!open || !querySymbol) return;
    let active = true;
    const timer = setTimeout(() => {
      apiRequest<unknown>(
        `${path}/mentions?symbol=${encodeURIComponent(querySymbol)}&q=${encodeURIComponent(queryText ?? '')}`,
      )
        .then((raw) => {
          if (active) {
            setResult({ key: queryKey, ...mentionCatalogSchema.parse(raw) });
            setSelected(0);
          }
        })
        .catch(() => {
          if (active)
            setResult({ key: queryKey, data: [], hasMore: false, error: true });
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, path, queryKey, queryText, querySymbol]);
  const data = result.key === queryKey ? result.data : [];
  function choose(candidate: MentionCandidate) {
    if (!query) return;
    const next = selectMention(content, mentions, query, candidate);
    onChange(next.content, next.mentions);
    setCursor(next.cursor);
    setDismissed(queryKey);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(next.cursor, next.cursor);
    });
  }
  return (
    <div className="relative">
      <textarea
        ref={input}
        aria-label="Mensagem"
        rows={4}
        maxLength={10000}
        value={content}
        disabled={disabled}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-controls={open ? 'mention-suggestions' : undefined}
        aria-activedescendant={
          open && data[selected] ? `mention-option-${selected}` : undefined
        }
        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
        onChange={(e) => {
          const value = e.target.value;
          onChange(value, editMentions(content, value, mentions));
          setCursor(e.target.selectionStart);
          setDismissed('');
        }}
        onKeyDown={(e) => {
          if (!open || e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            setDismissed(queryKey);
          }
          if (['ArrowDown', 'ArrowUp'].includes(e.key) && data.length) {
            e.preventDefault();
            setSelected(
              (i) =>
                (i + (e.key === 'ArrowDown' ? 1 : -1) + data.length) %
                data.length,
            );
          }
          if (e.key === 'Enter' && data[selected]) {
            e.preventDefault();
            choose(data[selected]!);
          }
        }}
      />
      {open && (
        <div className="rounded-lg border border-stone-300 bg-white p-2 shadow-lg">
          <ul
            id="mention-suggestions"
            role="listbox"
            aria-label={
              query?.symbol === '@'
                ? 'Personagens conhecidos'
                : 'Itens e objetos acessíveis'
            }
            className="max-h-60 overflow-auto"
          >
            {data.map((candidate, i) => (
              <li
                key={`${candidate.type}:${candidate.entityId}`}
                id={`mention-option-${i}`}
                role="option"
                aria-selected={i === selected}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className={`w-full rounded px-3 py-2 text-left ${i === selected ? 'bg-stone-100' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(candidate)}
                >
                  <span>
                    {query?.symbol}
                    {candidate.label}
                  </span>
                  <span className="ml-3 text-xs text-stone-500">
                    {candidate.context}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!data.length && (
            <p role="status" className="px-3 py-2 text-sm text-stone-500">
              {result.key !== queryKey
                ? 'Buscando referências…'
                : result.error
                  ? 'Referências indisponíveis. Você pode continuar escrevendo.'
                  : 'Nenhuma referência disponível.'}
            </p>
          )}
          {!!data.length && (
            <p className="px-3 text-xs text-stone-500">
              ↑ ↓ para navegar · Enter para selecionar · Esc para fechar
              {result.hasMore ? ' · Digite mais para filtrar' : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
