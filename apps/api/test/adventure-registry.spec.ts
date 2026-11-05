import { AdventureRegistry } from '../src/adventures/core/registry/registry';
import { adventureDefinitionSchema } from '../src/adventures/core/definitions/definition';
import { gloamhaleModule } from '../src/adventures/gloamhale/gloamhale-module';
import { gloamhaleState } from '../src/adventures/gloamhale/runtime/state/mechanics-state';
import { testAdventure } from './fixtures/adventure';

describe('Adventure registry: independent Blue Rose content', () => {
  it('registers two definitions and resolves exact versions without editing either', () => {
    const definition = testAdventure();
    const registry = new AdventureRegistry([
      gloamhaleModule,
      { definition, entityNamespace: definition.id },
    ]);
    expect(registry.get(definition.id, 1).definition.title).toBe(
      'Lanterna de teste',
    );
    expect(registry.get('six-of-swords-gloamhale', 1)).toEqual(gloamhaleModule);
    expect(() => registry.get(definition.id, 2)).toThrow();
    expect(
      () => new AdventureRegistry([gloamhaleModule, gloamhaleModule]),
    ).toThrow();
  });
  it('accepts independent pages, party limits and versions but rejects broken references', () => {
    const definition = testAdventure();
    expect(
      adventureDefinitionSchema.parse({ ...definition, version: 2 }).version,
    ).toBe(2);
    expect(
      adventureDefinitionSchema.safeParse({ ...definition, minimumLevel: 3 })
        .success,
    ).toBe(false);
    expect(
      adventureDefinitionSchema.safeParse({
        ...definition,
        originalPartySize: [3, 1],
      }).success,
    ).toBe(false);
    definition.scenes[0]!.locationKey = 'missing';
    expect(adventureDefinitionSchema.safeParse(definition).success).toBe(false);
  });
  it('does not let caller mutations change a registered version', () => {
    const definition = testAdventure();
    const registry = new AdventureRegistry([
      { definition, entityNamespace: definition.id },
    ]);
    definition.version = 2;
    expect(registry.get('test-lantern', 1).definition.version).toBe(1);
    expect(
      () => new AdventureRegistry([{ definition, entityNamespace: '' }]),
    ).toThrow('namespace');
    expect(
      () =>
        new AdventureRegistry([
          {
            definition,
            entityNamespace: 'valid',
            commandSchema: gloamhaleModule.commandSchema,
          },
        ]),
    ).toThrow('schema and executor');
  });
  it('validates local state instead of trusting opaque JSON storage', () => {
    expect(gloamhaleState(null)).toBeNull();
    expect(() =>
      gloamhaleState({
        children: {},
        stage: 99,
        elapsedMinutes: 0,
        nextChangeAt: null,
      }),
    ).toThrow('Invalid Gloamhale state');
    expect(() =>
      gloamhaleState({
        children: { invalid: { age: 10 } },
        stage: 0,
        elapsedMinutes: 0,
        nextChangeAt: null,
      }),
    ).toThrow('Invalid Gloamhale state');
  });
});
