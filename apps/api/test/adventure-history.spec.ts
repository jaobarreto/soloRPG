import { Test } from '@nestjs/testing';
import { AdventureRegistryModule } from '../src/adventures/adventure-registry.module';
import { AdventureRegistry } from '../src/adventures/core/registry/registry';
import { digest } from '../src/adventures/core/state/identity';

// Captured from the serialized registered definitions before modularization.
const historicalDigests = [
  'e61c692d23398d49d506a0a311073c099818c07f78591f174ba9aef4de0a54aa',
  '06c6aa8ed9b7e9de14f1ea6e87688633238858bd4fd3f0205ddadee8811bb577',
  '885f2f008f912e586156db94c182fed651dbb6cbeadb0abe01a6ba7c8e7c193d',
  'ae46c714507564ef25fc1403a4fc0895b1d8e859b8593950add798d1ab677e99',
  '9b2a7de38a4ed40373a1dce3f7f3d79fdf7b14601ffd91271ba2e5031b15f770',
];

it('preserves the five registered definitions and both default selectors', async () => {
  const module = await Test.createTestingModule({
    imports: [AdventureRegistryModule],
  }).compile();
  try {
    const registry = module.get(AdventureRegistry);
    const id = 'six-of-swords-gloamhale';
    expect(registry.forImport().definition.version).toBe(1);
    expect(registry.forNewCampaign().definition.version).toBe(5);
    historicalDigests.forEach((expected, index) => {
      const version = index + 1;
      const registered = registry.forImport(id, version);
      expect(registered.definition).toMatchObject({ id, version });
      expect(registered.entityNamespace).toBe('gloamhale');
      expect(digest(registered.definition)).toBe(expected);
      expect(!!registered.scenePolicy).toBe(version >= 4);
    });
  } finally {
    await module.close();
  }
});
