import Link from 'next/link';
import { CampaignForm } from '@/components/campaign-form';
export default function NewCampaignPage() {
  return (
    <>
      <Link href="/campaigns" className="back-link">
        ← Campanhas
      </Link>
      <p className="eyebrow mt-8">O primeiro capítulo</p>
      <h1 className="page-title mb-8">Nova campanha</h1>
      <CampaignForm />
    </>
  );
}
