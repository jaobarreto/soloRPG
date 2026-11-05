export const scenes = [
  {
    key: 'foiled-trap',
    locationKey: 'road',
    encounterKey: 'foiled-trap',
    opening:
      'Na estrada para Lakesheart, uma carroça tombada e fios mal escondidos interrompem a passagem. Moradores assustados aguardam uma reação. O que a protagonista deseja fazer?',
    characterKeys: ['griseld', 'amos'],
    gmSecrets: [],
    options: [
      {
        key: 'ask-villagers',
        intent: 'Perguntar aos moradores o que aconteceu',
        mode: 'SPEAK',
        keywords: ['pergunt', 'aconteceu', 'ajud', 'convers'],
        check: null,
        successText:
          'Griseld e Amos relatam o desaparecimento de crianças de Lakesheart e pedem ajuda. Não há compromisso assumido em nome de Naelis.',
        failureText: 'Os moradores aguardam uma resposta.',
      },
    ],
  },
  {
    key: 'fen-attack',
    locationKey: 'road',
    encounterKey: 'fen-attack',
    opening:
      'Attack by the Fen. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['fen-warrior', 'fen-shaman'],
    gmSecrets: [
      'Surpresa, gritos, magia de adversário e retirada pela metade dos guerreiros requerem adjudicação.',
    ],
    options: [],
  },
  {
    key: 'village',
    locationKey: 'lakesheart',
    encounterKey: 'village',
    opening:
      'Lakesheart. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['amos', 'griseld'],
    gmSecrets: [],
    options: [],
  },
  {
    key: 'chant-talk',
    locationKey: 'lakesheart',
    encounterKey: 'chant-talk',
    opening:
      'Chant se aproxima com sinos no pulso e curiosidade sobre a vida de aventureira. Naelis pode conversar, guardar silêncio ou seguir outro caminho.',
    characterKeys: ['chant'],
    gmSecrets: [],
    options: [],
  },
  {
    key: 'dawning-dark',
    locationKey: 'lakesheart',
    encounterKey: 'dawning-dark',
    opening:
      'The Dawning Dark. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['fen-shaman', 'fen-warrior'],
    gmSecrets: ['Veneno, perseguição e combate especial.'],
    options: [],
  },
  {
    key: 'losing-chant',
    locationKey: 'lakesheart',
    encounterKey: 'losing-chant',
    opening:
      'Losing Chant. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['enit', 'chant'],
    gmSecrets: [
      'Disponibilidade da cena e escolha de foco rhydan exigem preparação.',
    ],
    options: [],
  },
  {
    key: 'fens-beckon',
    locationKey: 'swamp',
    encounterKey: 'fens-beckon',
    opening:
      'The Fens Beckon. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['fen-warrior'],
    gmSecrets: [
      'Surpresa, pedido de paz e eventual combate não podem ser resolvidos como combate comum.',
    ],
    options: [],
  },
  {
    key: 'mud-mother',
    locationKey: 'fen-camp',
    encounterKey: 'mud-mother',
    opening:
      'The Mud Mother. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['mud-mother'],
    gmSecrets: [
      'Troca de objeto pessoal, duração da conserva e informações graduais requerem adjudicação.',
    ],
    options: [],
  },
  {
    key: 'fen-vanish',
    locationKey: 'fen-camp',
    encounterKey: 'fen-vanish',
    opening:
      'The Fen Vanish. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: ['Só ocorre após mortes no pedido de paz.'],
    options: [],
  },
  {
    key: 'murder',
    locationKey: 'lakesheart',
    encounterKey: 'murder',
    opening:
      'Murder. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: [
      'Requer violência anterior contra os Fen e tempo narrativo confirmado.',
    ],
    options: [],
  },
  {
    key: 'harvest',
    locationKey: 'lakesheart',
    encounterKey: 'harvest',
    opening:
      'Preparing for Harvest. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['enit'],
    gmSecrets: ['Resultado graduado e agenda de ataque requerem adjudicação.'],
    options: [],
  },
  {
    key: 'rhyme',
    locationKey: 'swamp',
    encounterKey: 'rhyme',
    opening:
      'A Child’s Rhyme. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['strix-swarm'],
    gmSecrets: ['Bônus condicional e enxame de strix após falha.'],
    options: [],
  },
  {
    key: 'plantation',
    locationKey: 'grounds',
    encounterKey: 'plantation',
    opening:
      'The Barren Plantation. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: ['Visões individuais e medo de infância.'],
    options: [],
  },
  {
    key: 'reborn',
    locationKey: 'manor',
    encounterKey: 'reborn',
    opening:
      'Heroes Reborn. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: [
      'Entrada, relógio e exceção de Saúde usam comandos locais; nunca inventar medo ou idade da protagonista.',
    ],
    options: [],
  },
  {
    key: 'parlor',
    locationKey: 'parlor',
    encounterKey: 'parlor',
    opening:
      'Parlor. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: ['Compulsão e alvo dependem do grupo.'],
    options: [],
  },
  {
    key: 'piano',
    locationKey: 'drawing-room',
    encounterKey: 'piano',
    opening:
      'Drawing Room. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['specter'],
    gmSecrets: ['Espectro, rastreio por 2d6 e fraquezas especiais.'],
    options: [],
  },
  {
    key: 'fruit',
    locationKey: 'conservatory',
    encounterKey: 'fruit',
    opening:
      'Conservatory. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: ['Armadilha e Segunda Visão precisam de adjudicação.'],
    options: [],
  },
  {
    key: 'haints',
    locationKey: 'cellar',
    encounterKey: 'haints',
    opening:
      'Cellar and Wine Cellar. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['haint'],
    gmSecrets: [
      'Toque passivo penetrante, escuridão, medo e libertação individual.',
    ],
    options: [],
  },
  {
    key: 'kitchen',
    locationKey: 'kitchen',
    encounterKey: 'kitchen',
    opening:
      'Kitchen. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['poltergeist', 'rat-swarm'],
    gmSecrets: ['Surpresa, enxame, etéreo e efeitos ambientais.'],
    options: [],
  },
  {
    key: 'study',
    locationKey: 'study',
    encounterKey: 'study',
    opening:
      'Study. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: [
      'Revelações graduais não podem ser publicadas antecipadamente.',
    ],
    options: [],
  },
  {
    key: 'feast',
    locationKey: 'dining-room',
    encounterKey: 'feast',
    opening:
      'Dining Room. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: [],
    gmSecrets: ['Compulsão, ilusão e penalidade de Vontade restrita à mansão.'],
    options: [],
  },
  {
    key: 'erila',
    locationKey: 'mistress-bedroom',
    encounterKey: 'erila',
    opening:
      'Mistress Bedroom. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['erila'],
    gmSecrets: [
      'Consentimento/resistência, penalidades mentais e informações individuais.',
    ],
    options: [],
  },
  {
    key: 'master',
    locationKey: 'master-bedroom',
    encounterKey: 'master',
    opening:
      'Master Bedroom. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['poltergeist'],
    gmSecrets: ['Ataque etéreo e recuperação de objeto em movimento.'],
    options: [],
  },
  {
    key: 'toys',
    locationKey: 'playroom',
    encounterKey: 'toys',
    opening:
      'Playroom. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['haint'],
    gmSecrets: ['Chave, brinquedos, investigação e tempo de estudo.'],
    options: [],
  },
  {
    key: 'attic',
    locationKey: 'attic',
    encounterKey: 'attic',
    opening:
      'No sótão, duas crianças desnutridas se encolhem entre jaulas e brinquedos improvisados. O que a protagonista deseja fazer?',
    characterKeys: ['eric', 'bamala'],
    gmSecrets: ['Resgate, alimentação e exceção da gruta.'],
    options: [],
  },
  {
    key: 'ritual',
    locationKey: 'playroom',
    encounterKey: 'ritual',
    opening:
      'Playroom Ritual. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['jaymes', 'haint'],
    gmSecrets: [
      'Progresso compartilhado, dano psíquico, bônus condicionais e interrupção definitiva requerem adjudicação.',
    ],
    options: [],
  },
  {
    key: 'resolution',
    locationKey: 'grounds',
    encounterKey: 'resolution',
    opening:
      'Resolutions. O grupo pode investigar, conversar, recuar ou escolher outro caminho. O que a protagonista deseja fazer?',
    characterKeys: ['erila', 'haint', 'jaymes'],
    gmSecrets: [
      'Consequências devem considerar separadamente haints, Erila, Jaymes, incêndio e inundação.',
    ],
    options: [],
  },
  {
    key: 'grotto',
    locationKey: 'grotto',
    encounterKey: 'grotto',
    opening:
      'A gruta abriga pequenas lápides e vegetação que contrasta com os terrenos estéreis. Na primeira chegada, Chant está ali, sem ter entrado na mansão. O que a protagonista deseja fazer?',
    characterKeys: ['chant'],
    gmSecrets: [
      'Conferir se é a primeira chegada à gruta e preparar apenas as testemunhas efetivamente presentes.',
    ],
    options: [],
  },
];
