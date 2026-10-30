import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'SoloRPG · Ambiente local',
  description: 'Status do ambiente de desenvolvimento SoloRPG.',
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
