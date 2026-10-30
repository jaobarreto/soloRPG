import Link from 'next/link';
export default function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-8 sm:px-10">
      <header className="mb-10 flex items-center justify-between border-b border-stone-300 pb-5">
        <Link href="/campaigns" className="font-serif text-2xl font-semibold">
          SoloRPG{' '}
          <span className="ml-2 text-sm font-normal text-stone-500">
            Diário de aventuras
          </span>
        </Link>
        <Link href="/" className="text-sm text-stone-500 underline">
          Ambiente local
        </Link>
      </header>
      {children}
      <footer className="mt-12 border-t border-stone-300 py-6 text-xs text-stone-500">
        Seu mundo, uma sessão por vez. Histórico salvo no PostgreSQL local.
      </footer>
    </main>
  );
}
