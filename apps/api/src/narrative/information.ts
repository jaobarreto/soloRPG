import { createHash } from 'node:crypto';

export interface InformationSource {
  key: string;
  scope: 'PUBLIC' | 'KNOWN' | 'RULES' | 'INVENTORY' | 'OBJECTIVES';
  text: string;
  target?: { type: 'CHARACTER' | 'WORLD' | 'ITEM'; name: string };
}
export interface SelectionContext {
  version: 1;
  information: InformationSource[];
}
export function informationSource(
  scope: InformationSource['scope'],
  text: string,
  target?: InformationSource['target'],
): InformationSource {
  return {
    key:
      'info-' +
      createHash('sha256')
        .update(JSON.stringify({ scope, text, target }))
        .digest('hex')
        .slice(0, 24),
    scope,
    text,
    ...(target ? { target } : {}),
  };
}

// Only explicit public projections and the protagonist's own event associations
// enter retrieval. Summaries, arbitrary chat and NPC-only knowledge are not facts.
export function selectionContext(
  snapshot: {
    scene?: string;
    characters: {
      name: string;
      kind: string;
      inventory: { name: string; quantity: number; description?: string }[];
      knowledge: { description: string; source: string }[];
    }[];
    world: { name: string; description: string; accessible: boolean }[];
    rules: {
      name: string;
      source: string;
      page: string;
      usage: string | null;
      effect: string | null;
      limitations: string | null;
      cost: string | null;
    }[];
  },
  objectives: { description: string; completed: boolean }[],
): SelectionContext {
  const pc = snapshot.characters.find((c) => c.kind === 'PROTAGONIST');
  const information: InformationSource[] = [];
  if (snapshot.scene)
    information.push(informationSource('PUBLIC', snapshot.scene));
  for (const world of snapshot.world.filter((w) => w.accessible))
    information.push(
      informationSource('PUBLIC', `${world.name}: ${world.description}`, {
        type: 'WORLD',
        name: world.name,
      }),
    );
  for (const item of pc?.inventory ?? [])
    if (item.quantity > 0)
      information.push(
        informationSource(
          'INVENTORY',
          `${item.name}: ${item.quantity}.${item.description ? ' ' + item.description : ''}`,
          {
            type: 'ITEM',
            name: item.name,
          },
        ),
      );
  for (const fact of pc?.knowledge ?? [])
    information.push(
      informationSource(
        'KNOWN',
        ['HEARD', 'RUMOR'].includes(fact.source)
          ? `Relato ouvido, sem comprovação de seu conteúdo: ${fact.description}`
          : fact.description,
      ),
    );
  information.push(
    informationSource(
      'RULES',
      'Blue Rose AGE: o teste básico usa 3d6 + habilidade + foco aplicável contra a dificuldade. O terceiro dado é o Drama Die. Fonte: livro básico, pp.15–17.',
    ),
  );
  for (const rule of snapshot.rules)
    information.push(
      informationSource(
        'RULES',
        [
          rule.name,
          rule.usage,
          rule.effect,
          rule.cost,
          rule.limitations,
          `Fonte: ${rule.source}, ${rule.page}.`,
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    );
  for (const objective of objectives)
    information.push(
      informationSource(
        'OBJECTIVES',
        `${objective.description}: ${objective.completed ? 'confirmado' : 'em andamento'}.`,
      ),
    );
  return { version: 1, information };
}
