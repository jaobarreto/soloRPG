import type {
  FreeAction,
  MechanicalAction,
  ResolvedMention,
  DialogueMenu,
} from '@solo-rpg/shared-contracts';
import type { SelectionContext } from './information';

export const normalizeName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
export interface ActionSnapshot {
  characters: {
    id: string;
    name: string;
    kind: string;
    available?: boolean;
    inventory?: { itemId: string; name: string }[];
  }[];
  actors?: { id: string; name: string; kind: string; available?: boolean }[];
  world: { id: string; name: string; accessible?: boolean }[];
  options: {
    id: string;
    intent: string;
    mode: string;
    requiresCheck: boolean;
    targetEntityId?: string;
  }[];
  combat: { id: string } | null;
  selection?: SelectionContext;
  dialogue?: DialogueMenu[];
}
export interface FreeResolution {
  category:
    | 'DIALOGUE'
    | 'OBSERVE'
    | 'QUERY'
    | 'OOC'
    | 'THINK'
    | 'CLARIFY'
    | 'ADJUDICATE'
    | 'MECHANIC';
  text: string;
  reason?: string;
  authorizedTool?: FreeAction['tool']['type'];
  targetId?: string;
  dialogueOrigin?: 'STORY_CARD';
  command?: MechanicalAction;
  optionId?: string;
  combat?: {
    action: 'ATTACK' | 'DEFEND';
    actorId: string;
    targetId?: string;
    encounterId: string;
  };
  minutes?: number;
}
const clarify = (text: string): FreeResolution => ({
  category: 'CLARIFY',
  text,
  reason: 'CLARIFICATION_REQUIRED',
});
const adjudicate = (): FreeResolution => ({
  category: 'ADJUDICATE',
  reason: 'UNSUPPORTED_CAPABILITY',
  text: 'Essa tentativa depende de uma regra ou de condições que ainda não estão autorizadas nesta cena. Nenhum efeito foi aplicado. Podemos esclarecer a intenção ou tentar outro caminho.',
});

// Applicability follows the existing specific engine commands, not the arcana's
// names or the character's talents. Null/omitted means no proposed choice.
const arcanaParameters: Record<
  Extract<FreeAction['tool'], { type: 'ARCANA' }>['arcanum'],
  readonly string[]
> = {
  'psychic-shield': ['raised'],
  'second-sight': [],
  'psychic-contact': ['tradition'],
  cure: [],
  'body-control': ['tradition', 'use'],
  'move-object': ['fatigue'],
  'wind-shaping': ['category'],
};

// The model interprets language; this policy resolves names and limits capabilities.
// It never accepts IDs, DCs, invented discoveries or world patches from the model.
export function interpretFreeAction(
  action: FreeAction,
  mode: string,
  snapshot: ActionSnapshot,
  mentions: ResolvedMention[] = [],
): FreeResolution {
  if (mode === 'THINK' || action.intent === 'THINK')
    return {
      category: 'THINK',
      text: 'Seu pensamento permanece privado. O que deseja fazer ou dizer?',
    };
  const tool = action.tool;
  const expression = action.expression;
  if (expression === 'COMPOUND')
    return {
      ...clarify(
        'Há mais de uma tentativa nesse pedido. Qual deseja resolver primeiro?',
      ),
      reason: 'COMPOUND_ACTION',
    };
  if (expression === 'NEGATED' || expression === 'QUOTED')
    return {
      category: 'THINK',
      text: 'A ação negada ou citada não foi executada. O que deseja fazer ou perguntar?',
      reason: 'NON_EXECUTING',
    };
  if (
    ['QUESTION', 'HYPOTHETICAL'].includes(expression ?? '') &&
    !['QUERY', 'CLARIFY', 'ADJUDICATE', 'DIALOGUE'].includes(tool.type)
  )
    return {
      ...clarify(
        'Você deseja apenas consultar essa possibilidade ou realizar uma tentativa?',
      ),
      reason: 'NON_EXECUTING',
    };
  if (expression === 'HYPOTHETICAL' && tool.type === 'DIALOGUE')
    return {
      category: 'THINK',
      text: 'Essa possibilidade não foi executada nem comunicada aos personagens.',
      reason: 'NON_EXECUTING',
    };
  const ooc =
    mode === 'OUT_OF_CHARACTER' || ['OOC', 'CORRECT'].includes(action.intent);
  if (ooc && tool.type !== 'QUERY')
    return {
      category: 'OOC',
      text:
        action.intent === 'CORRECT'
          ? 'Vamos esclarecer a interpretação. O histórico e os resultados confirmados foram preservados; uma correção de estado precisa de uma operação autorizada.'
          : 'Não há informação autorizada suficiente para responder a essa pergunta. Nenhum resultado oficial foi alterado.',
    };
  if (
    snapshot.selection &&
    action.evidence?.some(
      (key) =>
        !snapshot.selection!.information.some((source) => source.key === key),
    )
  )
    return {
      ...clarify(
        'Não encontrei uma fonte autorizada para essa interpretação. Pode reformular?',
      ),
      reason: 'INVALID_EVIDENCE',
    };
  // A planner can see GM data. Never publish its free-form question or target
  // label: both could carry a secret. Clarifications use server-owned text.
  if (tool.type === 'CLARIFY')
    return clarify(
      action.intent === 'ARCANA'
        ? 'Qual arcano deseja utilizar e em quem?'
        : action.intent === 'WAIT' || action.intent === 'REST'
          ? 'Por quanto tempo deseja esperar ou repousar?'
          : 'Pode esclarecer o que deseja tentar e qual é o alvo?',
    );
  const pc = snapshot.characters.find(
    (c) => c.kind === 'PROTAGONIST' && c.available !== false,
  );
  const actors = (snapshot.actors ?? snapshot.characters).filter(
    (c) => c.available !== false,
  );
  let target: { id: string; name: string; kind?: string } | undefined;
  const effectiveTarget =
    action.target ??
    (mentions.length === 1
      ? { type: mentions[0]!.type, name: mentions[0]!.label }
      : null);
  if (effectiveTarget) {
    const candidates =
      effectiveTarget.type === 'CHARACTER'
        ? actors
        : effectiveTarget.type === 'WORLD'
          ? snapshot.world.filter(
              (w) => w.accessible !== false || tool.type === 'QUERY',
            )
          : (pc?.inventory ?? []).map((item) => ({
              id: item.itemId,
              name: item.name,
            }));
    const explicit = mentions.filter((m) => m.type === effectiveTarget.type);
    const selected = explicit.filter(
      (m) =>
        normalizeName(m.label) ===
        normalizeName(effectiveTarget.name.replace(/^[@#]/, '')),
    );
    if (explicit.length && !selected.length)
      return clarify(
        'A referência selecionada não corresponde ao alvo interpretado. Pode esclarecer a tentativa?',
      );
    const ids = [...new Set(selected.map((m) => m.entityId))];
    if (ids.length > 1)
      return clarify(
        'Qual das referências selecionadas é o alvo desta tentativa?',
      );
    const matches = candidates.filter((candidate) =>
      ids.length
        ? candidate.id === ids[0]
        : normalizeName(candidate.name) ===
          normalizeName(effectiveTarget.name.replace(/^[@#]/, '')),
    );
    // A revalidated known-but-absent mention can identify a memory subject;
    // it still cannot become an actor for dialogue or any mechanical action.
    const memorySubject =
      tool.type === 'QUERY' && matches.length === 0 && ids.length === 1
        ? { id: ids[0]!, name: selected[0]!.label }
        : undefined;
    if (matches.length !== 1 && !memorySubject)
      return clarify('A quem ou a qual elemento presente você se refere?');
    target = matches[0] ?? memorySubject;
  }
  if (tool.type === 'DIALOGUE') {
    if (
      !['TALK', 'SOCIAL', 'REFUSE', 'NEGOTIATE', 'LIE', 'HELP'].includes(
        action.intent,
      )
    )
      return adjudicate();
    if (!target || !target.kind || target.kind === 'PROTAGONIST')
      return clarify('Com quem deseja conversar?');
    if (
      (tool.topic || tool.act) &&
      (!tool.topic ||
        !tool.act ||
        !snapshot.dialogue?.some(
          (d) =>
            d.characterId === target!.id &&
            d.choices.some((c) => c.topic === tool.topic && c.act === tool.act),
        ))
    )
      return {
        ...clarify(
          'Não há uma resposta autorizada para esse assunto e interlocutor. Pode esclarecer o que deseja conversar?',
        ),
        reason: 'UNAUTHORIZED_DIALOGUE_SELECTION',
      };
    return {
      category: 'DIALOGUE',
      targetId: target.id,
      ...(target.kind === 'STORY_NPC'
        ? { dialogueOrigin: 'STORY_CARD' as const }
        : {}),
      text: `${target.name} ouviu sua fala e pode responder. Nenhuma confiança, acordo ou informação foi confirmada apenas pela tentativa.`,
    };
  }
  if (tool.type === 'ADJUDICATE') return adjudicate();
  if (tool.type === 'OBSERVE' || tool.type === 'QUERY') {
    if (
      action.intent === 'INVESTIGATE' &&
      tool.type === 'QUERY' &&
      !action.evidence?.length
    )
      return {
        ...clarify(
          'Deseja recuperar algo que já sabe ou tentar descobrir algo nesta cena?',
        ),
        reason: 'INVESTIGATION_QUERY_MISMATCH',
      };
    if (snapshot.selection) {
      const scopes =
        tool.type === 'OBSERVE'
          ? ['PUBLIC', 'INVENTORY']
          : tool.subject === 'RULES'
            ? ['RULES']
            : tool.subject === 'INVENTORY'
              ? ['INVENTORY']
              : tool.subject === 'MEMORY'
                ? ['KNOWN']
                : tool.subject === 'OBJECTIVES'
                  ? ['OBJECTIVES']
                  : ['PUBLIC', 'KNOWN'];
      const sources = (action.evidence ?? []).map((key) =>
        snapshot.selection!.information.find((source) => source.key === key)!,
      );
      if (
        sources.some(
          (source) =>
            !scopes.includes(source.scope) ||
            (effectiveTarget &&
              source.target &&
              (source.target.type !== effectiveTarget.type ||
                normalizeName(source.target.name) !==
                  normalizeName(effectiveTarget.name.replace(/^[@#]/, '')))),
        )
      )
        return {
          ...clarify(
            'A fonte não corresponde à informação ou ao alvo solicitado. Pode esclarecer?',
          ),
          reason: 'SOURCE_SCOPE',
        };
      if (!sources.length)
        return {
          category:
            ooc || (tool.type === 'QUERY' && tool.subject === 'RULES')
              ? 'OOC'
              : tool.type === 'QUERY'
                ? 'QUERY'
                : 'OBSERVE',
          text: 'Não há informação autorizada suficiente para responder. O que é desconhecido continua desconhecido.',
          authorizedTool: tool.type,
          reason: 'NO_AUTHORIZED_INFORMATION',
        };
      if (
        ['ATTACK', 'DEFEND', 'REST', 'WAIT', 'MOVE', 'USE_ITEM'].includes(
          action.intent,
        ) ||
        (action.intent === 'ARCANA' && expression === 'DIRECT')
      )
        return { ...adjudicate(), reason: 'INTENT_TOOL_MISMATCH' };
      const text = sources.map((source) => source.text).join('\n\n');
      if (text.length > 12000)
        return {
          ...clarify(
            'Pode restringir a consulta a uma informação de cada vez?',
          ),
          reason: 'INFORMATION_LIMIT',
        };
      return {
        category:
          ooc || (tool.type === 'QUERY' && tool.subject === 'RULES')
            ? 'OOC'
            : tool.type === 'QUERY'
              ? 'QUERY'
              : 'OBSERVE',
        text,
        targetId: target?.id,
        authorizedTool: tool.type,
      };
    }
    if (tool.type === 'QUERY' && tool.subject === 'RULES')
      return {
        category: 'OOC',
        text: 'Um teste básico usa 3d6 + habilidade + foco aplicável. Qual parte da regra deseja esclarecer?',
      };
    if (
      [
        'ARCANA',
        'ATTACK',
        'DEFEND',
        'REST',
        'WAIT',
        'MOVE',
        'USE_ITEM',
      ].includes(action.intent)
    )
      return adjudicate();
    return {
      category: tool.type === 'QUERY' ? 'QUERY' : 'OBSERVE',
      targetId: target?.id,
      text: 'A observação considera apenas o que está visível nesta cena. Nenhuma descoberta oculta ou consequência mecânica foi confirmada.',
    };
  }
  if (mode !== 'ACT' || !pc)
    return clarify(
      'Deseja realizar essa ação? Descreva a tentativa no modo Fazer.',
    );
  if (tool.type === 'PREPARED_CHECK') {
    if (
      snapshot.selection &&
      (action.intent !== 'INVESTIGATE' ||
        (expression && expression !== 'DIRECT'))
    )
      return {
        ...clarify(
          'Deseja tentar uma investigação ou apenas consultar o que já está disponível?',
        ),
        reason: 'CHECK_REQUIRES_DISCOVERY',
      };
    if (
      ![
        'INVESTIGATE',
        'OBSERVE',
        'EXPLORE',
        'INTERACT',
        'SOCIAL',
        'NEGOTIATE',
        'LIE',
        'HELP',
      ].includes(action.intent)
    )
      return adjudicate();
    const matches = snapshot.options.filter(
      (o) =>
        o.mode === mode &&
        o.requiresCheck &&
        normalizeName(o.intent) === normalizeName(tool.capability),
    );
    if (
      matches.length === 1 &&
      matches[0]!.targetEntityId &&
      matches[0]!.targetEntityId !== target?.id
    )
      return {
        ...clarify(
          'A investigação preparada corresponde a outro alvo. Qual deseja examinar?',
        ),
        reason: 'CAPABILITY_TARGET',
      };
    return matches.length === 1
      ? {
          category: 'MECHANIC',
          text: 'A tentativa aguarda o teste oficial.',
          optionId: matches[0]!.id,
        }
      : adjudicate();
  }
  if (tool.type === 'REST') {
    if (action.intent !== 'REST') return adjudicate();
    if (tool.kind === 'LIGHT_REST' && !tool.sustenanceConfirmed)
      return clarify(
        'Para repousar por quatro horas, há comida e água disponíveis?',
      );
    return {
      category: 'MECHANIC',
      text: 'O motor verifica o repouso.',
      command: {
        type: 'REST',
        characterId: pc.id,
        kind: tool.kind,
        ...(tool.sustenanceConfirmed ? { sustenanceConfirmed: true } : {}),
      },
    };
  }
  if (tool.type === 'WAIT')
    return action.intent === 'WAIT'
      ? {
          category: 'MECHANIC',
          text: 'O motor verifica a passagem de tempo.',
          minutes: tool.minutes,
        }
      : adjudicate();
  if (tool.type === 'COMBAT') {
    if (action.intent !== tool.action) return adjudicate();
    if (!snapshot.combat) return adjudicate();
    if (
      tool.action === 'ATTACK' &&
      (!target || !target.kind || target.id === pc.id)
    )
      return clarify('Qual personagem presente é o alvo do ataque?');
    return {
      category: 'MECHANIC',
      text: 'O motor verifica a ação de combate.',
      combat: {
        action: tool.action,
        actorId: pc.id,
        encounterId: snapshot.combat.id,
        ...(target ? { targetId: target.id } : {}),
      },
    };
  }
  if (action.intent !== 'ARCANA') return adjudicate();
  if (
    Object.entries(tool).some(
      ([field, value]) =>
        field !== 'type' &&
        field !== 'arcanum' &&
        value !== null &&
        value !== undefined &&
        !arcanaParameters[tool.arcanum].includes(field),
    )
  )
    return {
      ...clarify(
        'Há parâmetros que não se aplicam ao arcano escolhido. Pode esclarecer a tentativa sem esses parâmetros?',
      ),
      reason: 'ARCANA_PARAMETER_MISMATCH',
    };
  let command: MechanicalAction;
  switch (tool.arcanum) {
    case 'psychic-shield':
      if (tool.raised === undefined)
        return clarify('Deseja erguer ou baixar seu Escudo Psíquico?');
      command = {
        type: 'ARCANA_USE',
        input: {
          arcanum: tool.arcanum,
          characterId: pc.id,
          raised: tool.raised,
        },
      };
      break;
    case 'second-sight':
      command = {
        type: 'ARCANA_USE',
        input: { arcanum: tool.arcanum, characterId: pc.id },
      };
      break;
    case 'cure':
      if (
        !target?.kind ||
        !snapshot.characters.some((c) => c.id === target!.id)
      )
        return clarify('Em qual personagem deseja utilizar Curar?');
      command = { type: 'CURE', characterId: pc.id, targetId: target.id };
      break;
    case 'psychic-contact':
      if (
        !target?.kind ||
        !['PSYCHIC', 'ANIMISM'].includes(tool.tradition ?? '')
      )
        return clarify('Qual é o alvo e a tradição do Contato Psíquico?');
      command = {
        type: 'ARCANA_USE',
        input: {
          arcanum: tool.arcanum,
          characterId: pc.id,
          targetId: target.id,
          tradition: tool.tradition as 'PSYCHIC' | 'ANIMISM',
        },
      };
      break;
    case 'body-control':
      if (
        !target?.kind ||
        !tool.use ||
        !['HEALING', 'MEDITATIVE', 'ANIMISM'].includes(tool.tradition ?? '')
      )
        return clarify(
          'Qual efeito de Controle Corporal, alvo e tradição deseja utilizar?',
        );
      command = {
        type: 'ARCANA_USE',
        input: {
          arcanum: tool.arcanum,
          characterId: pc.id,
          targetId: target.id,
          tradition: tool.tradition as 'HEALING' | 'MEDITATIVE' | 'ANIMISM',
          use: tool.use,
        },
      };
      break;
    // These require a canonical context, resolved in the transaction by the backend.
    case 'move-object':
    case 'wind-shaping':
      return { ...adjudicate(), reason: 'ARCANE_CONTEXT_REQUIRED' };
  }
  return {
    category: 'MECHANIC',
    text: 'O motor verifica o arcano e suas condições.',
    command,
  };
}
