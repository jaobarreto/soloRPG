import { adventureDefinitionSchema } from '../src/adventures/core/definitions/definition';
import { gloamhale } from '../src/adventures/gloamhale/definitions/v1/gloamhale';
import { gloamhaleModule } from '../src/adventures/gloamhale/gloamhale-module';
import { suppliedParty } from '../src/adventures/gloamhale/party/supplied-party';

describe('Six of Swords, pp.6–29: adaptação Gloamhale', () => {
  it('preserves the six-part proposal and canonical identities without invented sheets', () => {
    const d = adventureDefinitionSchema.parse(gloamhale);
    expect(d.sessions).toHaveLength(6);
    expect(d.characters.find((c) => c.key === 'erila')?.name).toBe(
      'Erila Qinrel',
    );
    expect(d.characters.find((c) => c.key === 'chant')?.sheet).toBeNull();
    expect(d.characters.find((c) => c.key === 'jaymes')?.locationKey).toBe(
      'manor',
    );
    expect(
      d.encounters.find((e) => e.key === 'ritual')?.blockers.length,
    ).toBeGreaterThan(0);
    expect(d.endings.some((e) => e.key === 'haints-remain')).toBe(true);
  });
  it('rejects missing references, duplicate identities and automatic execution of blocked mechanics', () => {
    const bad = structuredClone(gloamhale);
    bad.locations[0]!.connections.push('invented');
    expect(adventureDefinitionSchema.safeParse(bad).success).toBe(false);
    const duplicate = structuredClone(gloamhale);
    duplicate.characters.push(duplicate.characters[0]!);
    expect(adventureDefinitionSchema.safeParse(duplicate).success).toBe(false);
    const blocked = structuredClone(gloamhale);
    blocked.scenes.find((s) => s.encounterKey === 'ritual')!.options =
      gloamhale.scenes[0]!.options;
    expect(adventureDefinitionSchema.safeParse(blocked).success).toBe(false);
  });
  it('keeps source archetypes distinct from individual identities and memories', () => {
    expect(
      gloamhale.characters.filter((c) => c.identityKind === 'INDIVIDUAL'),
    ).toHaveLength(9);
    expect(
      gloamhale.characters.filter((c) => c.identityKind === 'ARCHETYPE'),
    ).toHaveLength(7);
    expect(
      gloamhale.scenes.find((s) => s.key === 'attic')?.characterKeys,
    ).toEqual(['eric', 'bamala']);
    expect(
      gloamhale.scenes.find((s) => s.key === 'grotto')?.characterKeys,
    ).toEqual(['chant']);
    expect(
      gloamhale.characters.find((c) => c.key === 'haint')?.identityKind,
    ).toBe('ARCHETYPE');
    expect(
      gloamhale.characters.find((c) => c.key === 'amos')?.identityKind,
    ).toBe('INDIVIDUAL');
  });
  it('applies the approved creation choices to one authorial preset', () => {
    expect(gloamhaleModule.suppliedParty).toBe(suppliedParty);
    const [naelis, aren, mira, lys] = suppliedParty;
    expect(naelis).toMatchObject({
      key: 'naelis',
      sheet: { people: "Vata'an" },
    });
    expect([aren, mira, lys].map((c) => c?.sheet.people)).toEqual([
      'Humano',
      'Marina',
      'Humana',
    ]);
    expect(aren!.sheet.description).toContain('sobrancelha direita');
    expect(mira!.sheet.description).toContain('Pele azul-esverdeada');
    expect(lys!.sheet.description).toContain('olhos cinzentos');
    expect(lys!.motivations).toContain(
      'confiança profissional não são amizade',
    );
    expect(lys!.privateNotes).toContain('Edran Varen, vivo e aposentado');
    expect(lys!.sheet.description).not.toContain('Edran');
    expect(mira!.sheet).toMatchObject({
      maxHealth: 31,
      abilities: { CONSTITUTION: 2, ACCURACY: 4 },
    });
    expect(mira!.sheet.features).toContainEqual({
      ruleId: 'constitution-swimming',
    });
    expect(lys!.sheet).toMatchObject({
      maxHealth: 30,
      abilities: {
        COMMUNICATION: 4,
        CONSTITUTION: 1,
        FIGHTING: 0,
        STRENGTH: 0,
      },
    });
    expect(aren!.sheet.abilities.FIGHTING).toBe(4);
    expect(aren!.weaponTraining).toEqual([
      'heavy-blade',
      'light-blade',
      'shortbow',
      'longbow',
      'sling',
    ]);
    for (const [member, focuses] of [
      [
        aren!,
        ['dexterity-riding', 'communication-deception', 'constitution-stamina'],
      ],
      [mira!, ['dexterity-acrobatics', 'constitution-swimming']],
      [
        lys!,
        [
          'dexterity-riding',
          'communication-persuasion',
          'accuracy-brawling',
          'intelligence-cultural-lore',
        ],
      ],
    ] as const)
      expect(member.sheet.features?.map((f) => f.ruleId)).toEqual(
        expect.arrayContaining(focuses),
      );
    const removed = [
      'quick-reflexes',
      'intelligence-historical-lore',
      'meditative-talent',
      'body-control',
      'psychic-shield',
      'second-sight',
      'animism-talent',
      'psychic-contact',
    ];
    for (const member of [aren!, mira!, lys!]) {
      const ids = member.sheet.features!.map((f) => f.ruleId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(
        member.sheet.features?.every((f) => !removed.includes(f.ruleId)),
      ).toBe(true);
      expect(member.sheet.languages).toEqual(['Aldino', 'Vatazino Antigo']);
    }
  });
});
