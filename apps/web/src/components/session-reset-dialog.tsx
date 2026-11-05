'use client';

import { useEffect, useRef } from 'react';
import { ErrorNotice } from './campaign-ui';

export function SessionResetDialog({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="reset-session-title"
      aria-describedby="reset-session-description"
      aria-busy={busy}
      className="panel mx-auto my-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto backdrop:bg-stone-950/60"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="reset-session-title" className="font-serif text-2xl">
        Reiniciar esta sessão?
      </h2>
      <div id="reset-session-description" className="my-4 space-y-3 text-sm">
        <p>Você está prestes a reiniciar sua aventura desde o começo.</p>
        <p>
          <strong>Todo o progresso da partida atual será apagado</strong>,
          incluindo:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Mensagens e narrações do diário.</li>
          <li>Falas, ações e pensamentos registrados.</li>
          <li>Resultados de testes e rolagens.</li>
          <li>Objetivos concluídos e progresso da sessão.</li>
          <li>Decisões e consequências narrativas.</li>
          <li>Descobertas e informações obtidas.</li>
          <li>Alterações de Saúde, recursos e condições.</li>
          <li>Inventário e alterações realizadas durante a partida.</li>
          <li>Memórias e vínculos desenvolvidos com personagens.</li>
          <li>Estado dos companheiros e das montarias.</li>
          <li>Localizações visitadas e acontecimentos registrados.</li>
        </ul>
        <p>
          Você poderá selecionar novamente sua personagem e seus companheiros e
          começar a Sessão I com o estado inicial da aventura.
        </p>
        <p>
          <strong>Esta ação não poderá ser desfeita.</strong>
        </p>
        <p>Deseja realmente apagar seu progresso e reiniciar?</p>
      </div>
      <ErrorNotice message={error} />
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <button
          ref={cancel}
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="primary-button !bg-red-800 !text-white hover:!bg-red-900"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Reiniciando…' : 'Apagar progresso e reiniciar'}
        </button>
      </div>
    </dialog>
  );
}
