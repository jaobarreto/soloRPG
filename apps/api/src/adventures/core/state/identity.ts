import { createHash } from 'node:crypto';

export function adventureEntityId(
  campaignId: string,
  key: string,
  namespace: string,
) {
  const hex = createHash('sha256')
    .update(`${namespace}:${campaignId}:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
