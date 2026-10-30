import Link from 'next/link';
import { HealthDashboard } from '@/components/health-dashboard';
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 sm:px-12 sm:py-14">
      <header className="flex items-center justify-between gap-4 border-b border-stone-300 pb-6">
        <Link
          className="flex items-center gap-3 font-semibold tracking-tight"
          href="/"
          aria-label="SoloRPG início"
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-amber-100"
            aria-hidden="true"
          >
            S
          </span>
          SoloRPG
        </Link>
        <span className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600">
          Ambiente de desenvolvimento
        </span>
      </header>
      <section className="pb-12 pt-20 sm:pt-28">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
          O início da jornada
        </p>
        <h1 className="max-w-2xl font-serif text-5xl leading-[1.08] tracking-tight text-stone-900 sm:text-7xl">
          Toda história precisa
          <br />
          <span className="text-stone-500">de uma boa base.</span>
        </h1>
        <p className="mt-7 max-w-lg text-base leading-7 text-stone-600">
          Bem-vinda ao SoloRPG. Este é o ponto de partida do seu ambiente local.
          Acompanhe abaixo a disponibilidade dos serviços.
        </p>
      </section>
      <Link href="/campaigns" className="primary-button mb-8 w-fit">
        Abrir campanhas →
      </Link>
      <HealthDashboard />
      <footer className="mt-auto flex flex-wrap justify-between gap-3 border-t border-stone-300 pt-6 text-xs text-stone-500">
        <span>SoloRPG · Fundação do projeto</span>
        <span>Uma jogadora. Um mundo de possibilidades.</span>
      </footer>
    </main>
  );
}
