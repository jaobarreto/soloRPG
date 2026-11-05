import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'CAOS · Campanhas e sessões',
  description: 'Campanhas, sessões e diário de RPG solo persistente.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
