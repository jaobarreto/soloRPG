import { GuidedSetup } from '@/components/guided-setup';

export default async function PrepareSession({
  params,
}: {
  params: Promise<{ campaignId: string; sessionId: string }>;
}) {
  const { campaignId, sessionId } = await params;
  return <GuidedSetup campaignId={campaignId} sessionId={sessionId} />;
}
