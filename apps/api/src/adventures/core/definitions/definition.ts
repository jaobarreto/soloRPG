import { z } from 'zod';
import { progressionSchema, type Condition } from '../director/progression';
import { abilitySchema } from '@solo-rpg/shared-contracts';

const key = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/)
  .max(100);
const line = z.string().trim().min(1).max(3000);
const refs = z.array(z.number().int().min(1).max(10000)).min(1);
export const adventureDefinitionSchema = z
  .strictObject({
    id: key,
    version: z.number().int().min(1),
    title: line,
    sourceBook: line,
    sourcePages: refs,
    minimumLevel: z.number().int().min(1).max(20),
    maximumLevel: z.number().int().min(1).max(20),
    originalPartySize: z.tuple([
      z.number().int().min(1).max(30),
      z.number().int().min(1).max(30),
    ]),
    synopsis: line,
    centralConflict: line,
    characters: z
      .array(
        z.strictObject({
          key,
          identityKind: z
            .enum(['INDIVIDUAL', 'ARCHETYPE'])
            .default('INDIVIDUAL'),
          name: line,
          description: line,
          role: line,
          personality: line,
          speech: line,
          history: line,
          motivations: line,
          goals: line,
          fears: line,
          secrets: z.array(line),
          knowledge: z.array(line),
          relationships: z.array(line),
          locationKey: key,
          sheet: z.string().nullable(),
          sourcePages: refs,
        }),
      )
      .min(1),
    locations: z
      .array(
        z.strictObject({
          key,
          name: line,
          description: line,
          characteristics: z.array(line),
          discoverable: z.array(line),
          secrets: z.array(line),
          objects: z.array(line),
          connections: z.array(key),
          sourcePages: refs,
        }),
      )
      .min(1),
    spatial: z
      .strictObject({
        places: z.array(
          z.strictObject({ key, region: key, parent: key.optional() }),
        ),
        passages: z.array(
          z.strictObject({
            key,
            from: key,
            to: key.nullable(),
            label: line,
            kind: z.enum(['DOOR', 'STAIRS', 'TRAPDOOR', 'PATH']),
            condition: z.enum(['OPEN', 'LOCAL', 'BLOCKED']),
            sourcePages: refs,
            uphillOnly: z.boolean().optional(),
          }),
        ),
      })
      .optional(),
    encounters: z
      .array(
        z.strictObject({
          key,
          title: line,
          locationKey: key,
          characterKeys: z.array(key),
          sourcePages: refs,
          optional: z.boolean(),
          initialConditions: line,
          objective: line,
          secrets: z.array(line),
          mechanics: z.array(line).min(1),
          blockers: z.array(line),
          consequences: z.array(line).min(1),
        }),
      )
      .min(1),
    scenes: z
      .array(
        z.strictObject({
          key,
          locationKey: key,
          encounterKey: key,
          opening: line,
          characterKeys: z.array(key),
          gmSecrets: z.array(line),
          endingKeys: z.array(key).optional(),
          options: z
            .array(
              z.strictObject({
                key,
                intent: line,
                mode: z.enum(['SPEAK', 'ACT']),
                keywords: z.array(line).min(1),
                durationMinutes: z.number().int().min(0).max(1440).optional(),
                nextSceneKey: key.optional(),
                arcana: z.literal('CURE_SELF').optional(),
                worldStatus: z
                  .strictObject({
                    expected: z.string().min(1).max(100),
                    next: z.string().min(1).max(100),
                  })
                  .optional(),
                check: z
                  .strictObject({
                    ability: abilitySchema,
                    targetNumber: z.number().int().min(1).max(100),
                  })
                  .nullable(),
                successText: line,
                failureText: line,
              }),
            )
            .max(10),
        }),
      )
      .min(1),
    progression: progressionSchema.optional(),
    sessions: z
      .array(
        z.strictObject({
          number: z.number().int().min(1),
          title: line,
          targetMinutes: z.literal(120).optional(),
          mainObjective: line,
          secondaryObjectives: z.array(line),
          sceneKeys: z.array(key).min(1),
          milestones: z.array(line).min(1),
          completionCriteria: z.array(line).min(1),
          completionEvidence: z
            .array(z.strictObject({ sceneKey: key, optionKey: key }))
            .min(1)
            .max(40)
            .optional(),
          possibleEndings: z.array(line).min(1),
        }),
      )
      .min(1),
    endings: z
      .array(
        z.strictObject({
          key,
          condition: line,
          consequence: line,
          sourcePages: refs,
        }),
      )
      .min(1),
  })
  .superRefine((d, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (d.progression) {
      const p = d.progression;
      if (p.units.length !== d.sessions.length)
        fail('Units must match narrative sessions');
      for (const rows of [
        p.facts,
        p.units,
        ...p.units.map((u) => u.objectives),
      ])
        if (new Set(rows.map((r) => r.key)).size !== rows.length)
          fail('Duplicate progression key');
      if (!p.units.at(-1)?.terminal)
        fail('Last unit requires an explicit terminal policy');
      for (const f of p.facts)
        if (!p.units.some((u) => u.key === f.unitKey))
          fail('Unknown fact unit');
      const checkCondition = (c: Condition, depth = 0): void => {
        if (depth > 12) {
          fail('Condition nesting exceeds limit');
          return;
        }
        if ('operator' in c)
          c.conditions.forEach((child) => checkCondition(child, depth + 1));
        else if (
          c.type === 'FACT' &&
          !p.facts.some((f) => f.key === c.reference)
        )
          fail('Unknown progression fact');
        else if (
          c.type === 'OPTION' &&
          !d.scenes
            .find((s) => s.key === c.sceneKey)
            ?.options.some((o) => o.key === c.optionKey)
        )
          fail('Unknown progression option');
      };
      for (const u of p.units) {
        checkCondition(u.completion);
        if (u.terminal) checkCondition(u.terminal);
        for (const o of u.objectives) {
          checkCondition(o.completion);
          if (o.availableWhen) checkCondition(o.availableWhen);
          if (o.unavailableWhen) checkCondition(o.unavailableWhen);
        }
        for (const m of u.milestones ?? []) checkCondition(m.completion);
      }
      for (const f of p.facts) if (f.requires) checkCondition(f.requires);
    }
    if (d.minimumLevel > d.maximumLevel) fail('Invalid level interval');
    if (d.originalPartySize[0] > d.originalPartySize[1])
      fail('Invalid party interval');
    for (const [name, list] of Object.entries({
      characters: d.characters,
      locations: d.locations,
      encounters: d.encounters,
      scenes: d.scenes,
      endings: d.endings,
    })) {
      const keys = list.map((r) => r.key);
      if (new Set(keys).size !== keys.length) fail(`Duplicate ${name} keys`);
    }
    const has = (list: { key: string }[], value: string) =>
      list.some((r) => r.key === value);
    for (const c of d.characters)
      if (!has(d.locations, c.locationKey)) fail('Unknown character location');
    for (const l of d.locations)
      for (const k of l.connections)
        if (!has(d.locations, k)) fail('Unknown location connection');
    if (d.spatial) {
      const { places, passages } = d.spatial;
      if (
        new Set(places.map((p) => p.key)).size !== places.length ||
        new Set(passages.map((p) => p.key)).size !== passages.length
      )
        fail('Duplicate spatial identity');
      for (const place of places)
        if (
          !has(d.locations, place.key) ||
          (place.parent && !has(places, place.parent))
        )
          fail('Unknown spatial place');
      for (const place of places) {
        const ancestors = new Set([place.key]);
        let parent = place.parent;
        while (parent) {
          if (ancestors.has(parent)) {
            fail('Spatial hierarchy contains a cycle');
            break;
          }
          ancestors.add(parent);
          parent = places.find((candidate) => candidate.key === parent)?.parent;
        }
      }
      for (const edge of passages)
        if (
          !has(places, edge.from) ||
          (edge.to && !has(places, edge.to)) ||
          edge.from === edge.to ||
          (!edge.to && edge.condition !== 'BLOCKED')
        )
          fail('Invalid spatial passage');
    }
    for (const e of d.encounters) {
      if (!has(d.locations, e.locationKey)) fail('Unknown encounter location');
      for (const k of e.characterKeys)
        if (!has(d.characters, k)) fail('Unknown encounter character');
    }
    for (const s of d.scenes) {
      if (
        !has(d.locations, s.locationKey) ||
        !has(d.encounters, s.encounterKey)
      )
        fail('Unknown scene reference');
      for (const k of s.endingKeys ?? [])
        if (!has(d.endings, k)) fail('Unknown scene ending');
      for (const k of s.characterKeys)
        if (!has(d.characters, k)) fail('Unknown scene character');
      for (const option of s.options) {
        if (option.nextSceneKey && !has(d.scenes, option.nextSceneKey))
          fail('Unknown next scene');
        if (
          option.arcana &&
          (option.mode !== 'ACT' || option.check || option.worldStatus)
        )
          fail('Arcana requires an ACT option with its own official test');
      }
      if (new Set(s.options.map((o) => o.key)).size !== s.options.length)
        fail('Duplicate option keys');
      const encounter = d.encounters.find((e) => e.key === s.encounterKey);
      if (encounter?.blockers.length && s.options.length)
        fail('Blocked encounter cannot execute automatic options');
    }
    for (const [i, s] of d.sessions.entries()) {
      for (const evidence of s.completionEvidence ?? []) {
        if (
          !s.sceneKeys.includes(evidence.sceneKey) ||
          !d.scenes
            .find((scene) => scene.key === evidence.sceneKey)
            ?.options.some((option) => option.key === evidence.optionKey)
        )
          fail('Unknown objective evidence option');
      }
      if (s.number !== i + 1) fail('Sessions must be consecutive');
      for (const k of s.sceneKeys)
        if (!has(d.scenes, k)) fail('Unknown session scene');
    }
  });
export type AdventureDefinition = z.infer<typeof adventureDefinitionSchema>;
