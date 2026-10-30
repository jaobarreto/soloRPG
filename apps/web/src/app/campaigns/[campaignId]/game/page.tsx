'use client';
import { use } from 'react';
import { GamePanel } from '@/components/game-panel';
export default function GamePage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  return <GamePanel key={campaignId} campaignId={campaignId} />;
}
