import type { AdventureModuleDefinition } from '../../core/registry/registry';

// Single preset for the campaign. Companion identity follows the approved
// authorial cards and the approved AGE creation choices.
const initialState = 'Recém-designados para a missão; não presumir amizade.';

export const suppliedParty: NonNullable<
  AdventureModuleDefinition['suppliedParty']
> = [
  {
    key: 'naelis',
    kind: 'PROTAGONIST',
    initialState,
    weaponName: 'Cajado artesanal de Ahri',
    source: 'Naelis - Ficha .pdf pp.1–2',
    sheet: {
      name: 'Naelis',
      people: "Vata'an",
      characterClass: 'ADEPT',
      background: 'Povo da Floresta',
      level: 1,
      maxHealth: 23,
      abilities: {
        FIGHTING: 0,
        COMMUNICATION: 3,
        CONSTITUTION: 1,
        DEXTERITY: 1,
        STRENGTH: 0,
        INTELLIGENCE: 3,
        PERCEPTION: 4,
        ACCURACY: 0,
        WILLPOWER: 2,
      },
      features: [
        { ruleId: 'intelligence-natural-lore' },
        { ruleId: 'animism-talent', degree: 'NOVICE' },
        { ruleId: 'healing-talent', degree: 'NOVICE' },
        { ruleId: 'shaping-talent', degree: 'NOVICE' },
        { ruleId: 'medicine', degree: 'NOVICE' },
        ...[
          'psychic-shield',
          'second-sight',
          'psychic-contact',
          'cure',
          'body-control',
          'move-object',
          'wind-shaping',
        ].map((ruleId) => ({ ruleId })),
      ],
      description:
        'Vata’an de 25 anos, emissária e curandeira; cajado artesanal de Ahri, sem propriedades arcanas.',
      calling: 'O Mundo — Exploração e descoberta',
      destiny: 'Compassivo',
      fate: 'Desanimado',
      languages: ['Aldino', 'Vatazino Antigo'],
      goals: ['Provar sua independência.', 'Encontrar seu próprio caminho.'],
    },
    personality:
      'Gentil, curiosa, alegre, distraída e dedicada. Sentimentos e decisões pertencem à jogadora.',
    motivations: 'Explorar e ajudar, preservando autonomia.',
    weapon: 'staff',
    armor: 'NONE',
    shield: 'NONE',
  },
  {
    key: 'aren',
    kind: 'COMPANION',
    initialState,
    source: 'docs/narrative/party/aren_valdren_story_card.txt v2.1',
    sheet: {
      name: 'Aren Valdren',
      people: 'Humano',
      characterClass: 'WARRIOR',
      background: 'Aldino — formação de patrulha',
      languages: ['Aldino', 'Vatazino Antigo'],
      level: 1,
      maxHealth: 36,
      abilities: {
        FIGHTING: 4,
        COMMUNICATION: 0,
        CONSTITUTION: 2,
        DEXTERITY: 1,
        STRENGTH: 2,
        INTELLIGENCE: 0,
        PERCEPTION: 2,
        ACCURACY: 0,
        WILLPOWER: 2,
      },
      features: [
        { ruleId: 'dexterity-riding' },
        { ruleId: 'communication-deception' },
        { ruleId: 'constitution-stamina' },
        { ruleId: 'fighting-heavy-blades' },
        { ruleId: 'armor-training', degree: 'NOVICE' },
        { ruleId: 'weapon-shield-style', degree: 'NOVICE' },
        { ruleId: 'single-weapon-style', degree: 'NOVICE' },
      ],
      description:
        'Humano de 28 anos, emissário dos Melhores do Soberano e veterano de patrulha da Guarda Aldina. Corpo forte, cabelos castanhos curtos, olhos castanho-acinzentados e cicatriz discreta junto à sobrancelha direita. Uniforme discreto e escudo marcado pelo uso.',
    },
    personality:
      'Paciente, prudente e cooperativo. Escuta antes de falar, usa frases claras, perguntas concretas e humor seco. Expressa preocupação com ajuda prática; discorda com motivo e alternativa. Não assume liderança nem decide por Naelis.',
    motivations:
      'Servir aos Melhores do Soberano e proteger inocentes. Respeita as competências de Naelis, Mira e Lys; a relação inicial é profissional.',
    privateNotes:
      'O incidente da passagem marcou sua relação com disciplina e consciência; não sabe se outra decisão teria salvado o condutor. Desconforto em espaços estreitos sem saída visível e intimidades da família Valdren são privados. Família, lembranças, reações e possíveis arcos seguem o Story Card; não são eventos da campanha nem efeitos mecânicos. Grupos de armas: Briga, Lâminas Pesadas, Lâminas Leves e Arcos.',
    // AGE groups: Briga, Lâminas Pesadas, Lâminas Leves e Arcos.
    // The combat catalog has no unarmed weapon entry.
    weaponTraining: [
      'heavy-blade',
      'light-blade',
      'shortbow',
      'longbow',
      'sling',
    ],
    weapon: 'heavy-blade',
    armor: 'LIGHT',
    shield: 'LIGHT',
  },
  {
    key: 'mira',
    kind: 'COMPANION',
    initialState,
    source: 'docs/narrative/party/mira_selwyn_story_card.txt v2.1',
    sheet: {
      name: 'Mira Selwyn',
      people: 'Marina',
      characterClass: 'EXPERT',
      background: 'Aldina — comunidade insular das águas meridionais',
      languages: ['Aldino', 'Vatazino Antigo'],
      level: 1,
      maxHealth: 31,
      abilities: {
        FIGHTING: 0,
        COMMUNICATION: 1,
        CONSTITUTION: 2,
        DEXTERITY: 2,
        STRENGTH: 0,
        INTELLIGENCE: 1,
        PERCEPTION: 3,
        ACCURACY: 4,
        WILLPOWER: 1,
      },
      features: [
        { ruleId: 'dexterity-acrobatics' },
        { ruleId: 'constitution-swimming' },
        { ruleId: 'perception-tracking' },
        { ruleId: 'scouting', degree: 'NOVICE' },
      ],
      description:
        'Marina de 24 anos, batedora dos Melhores do Soberano. Pele azul-esverdeada suave, olhos verdes, cabelos azul-escuros presos de modo prático e roupas leves de viagem. Usa arco curto e adaga; o cordão de nós coloridos é um auxílio pessoal comum.',
    },
    personality:
      'Calorosa, curiosa, expressiva e moderadamente impulsiva. Faz perguntas espontâneas, oferece ajuda e pode corrigir a própria pressa; em perigo fala com precisão. Mantém concentração no rastreio e respeita recusas.',
    motivations:
      'Explorar caminhos e ajudar comunidades como batedora. Respeita a formação de Naelis, a proteção de Aren e a mediação de Lys; sem intimidade inicial.',
    privateNotes:
      'Insegurança de não ser levada a sério, medo de decepcionar pela pressa, lembranças da família Selwyn e medo infantil de tempestades não são públicos. Nada disso dá bônus nem determina uma reação. Sem memórias iniciais de Gloamhale.',
    weapon: 'shortbow',
    armor: 'NONE',
    shield: 'NONE',
  },
  {
    key: 'lys',
    kind: 'COMPANION',
    initialState,
    source: 'docs/narrative/party/lys_varen_story_card.txt v2.1',
    sheet: {
      name: 'Lys Varen',
      people: 'Humana',
      characterClass: 'EXPERT',
      background: 'Aldina — Vales Centrais, mediação e registros',
      languages: ['Aldino', 'Vatazino Antigo'],
      level: 1,
      maxHealth: 30,
      abilities: {
        FIGHTING: 0,
        COMMUNICATION: 4,
        CONSTITUTION: 1,
        DEXTERITY: 2,
        STRENGTH: 0,
        INTELLIGENCE: 2,
        PERCEPTION: 1,
        ACCURACY: 2,
        WILLPOWER: 1,
      },
      features: [
        { ruleId: 'dexterity-riding' },
        { ruleId: 'accuracy-brawling' },
        { ruleId: 'intelligence-cultural-lore' },
        { ruleId: 'communication-persuasion' },
        { ruleId: 'oratory', degree: 'NOVICE' },
      ],
      description:
        'Humana de 29 anos, escriba e mediadora dos Vales Centrais de Aldis. Cabelos castanho-escuros geralmente presos, olhos cinzentos, roupas sóbrias e caderneta à mão. Postura precisa; a expressão composta não indica necessariamente tristeza.',
    },
    personality:
      'Extremamente reservada, séria, disciplinada e profissional. Fala baixo e com precisão; distingue fato, depoimento e hipótese. Escuta e coopera sem oferecer intimidade. Pode discordar com fundamento ou recusar questões pessoais com cortesia.',
    motivations:
      'Reduzir danos, preservar acordos e agir com justiça. Reconhece a competência de Naelis, Aren e Mira como colegas; cordialidade e confiança profissional não são amizade.',
    privateNotes:
      'Perdeu os pais biológicos para uma enfermidade; foi adotada por Edran Varen, vivo e aposentado. A vida familiar e o medo de dependência e perda são privados. Não usar Edran como gancho obrigatório nem converter confiança de trabalho em abertura íntima.',
    weapon: 'light-blade',
    armor: 'NONE',
    shield: 'NONE',
  },
];
