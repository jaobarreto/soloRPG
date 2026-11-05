import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gloamhaleModule } from '../src/adventures/gloamhale/gloamhale-module';

const root = resolve(__dirname, '../../../docs/narrative');
const index = JSON.parse(
  readFileSync(resolve(root, 'story-card-editorial-index.v1.json'), 'utf8'),
) as {
  scope: string;
  referenceDefinition: string;
  entityNamespace: string;
  documents: {
    path: string;
    sha256: string;
    identity: { origin: string; key: string; referenceName: string };
  }[];
};

it('accounts for each unmodified editorial source once', () => {
  const paths = ['party', 'npcs'].flatMap((folder) =>
    readdirSync(resolve(root, folder)).map((file) => `${folder}/${file}`),
  );
  expect(index.documents.map((d) => d.path).sort()).toEqual(paths.sort());
  for (const source of index.documents) {
    expect(
      createHash('sha256')
        .update(readFileSync(resolve(root, source.path)))
        .digest('hex'),
    ).toBe(source.sha256);
  }
});

it('resolves editorial links by origin and stable key, never by display name', () => {
  const { definition, entityNamespace, suppliedParty } = gloamhaleModule;
  expect(index.scope).toBe('EDITORIAL_ONLY');
  expect(index.entityNamespace).toBe(entityNamespace);
  expect(index.referenceDefinition).toBe(
    `${definition.id}:v${definition.version}`,
  );
  const regularKeys: string[] = [];
  const castKeys: string[] = [];
  for (const { identity, path } of index.documents) {
    if (identity.origin === 'REGULAR_PARTY_PRESET') {
      expect(path.startsWith('party/')).toBe(true);
      regularKeys.push(identity.key);
      const member = suppliedParty?.find((entry) => entry.key === identity.key);
      expect(member?.sheet.name).toBe(identity.referenceName);
    } else {
      expect(identity.origin).toBe('ADVENTURE_INDIVIDUAL');
      expect(path.startsWith('npcs/')).toBe(true);
      castKeys.push(identity.key);
      const card = definition.characters.find((c) => c.key === identity.key);
      expect(card?.identityKind).toBe('INDIVIDUAL');
      expect(card?.name).toBe(identity.referenceName);
    }
  }
  expect(regularKeys.sort()).toEqual(['aren', 'lys', 'mira']);
  expect(castKeys.sort()).toEqual([
    'bamala',
    'chant',
    'eric',
    'erila',
    'griseld',
    'jaymes',
    'mud-mother',
  ]);
});
