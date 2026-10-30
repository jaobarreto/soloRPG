import { SessionChat } from '@/components/session-chat';
export default async function SessionPage({
  params,
}: {
  params: Promise<{ campaignId: string; sessionId: string }>;
}) {
  const { campaignId, sessionId } = await params;
  return (
    <SessionChat
      key={sessionId}
      campaignId={campaignId}
      sessionId={sessionId}
    />
  );
}
