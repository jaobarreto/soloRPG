# Entrega e validação — Fase 5.1

31/10/2026. Reutilização de aventuras Blue Rose implementada; autonomia ampliada em capacidades preparadas. **A Fase 5.1 integral permanece parcial: o fluxo completo de Gloamhale ainda exige operador em cenas especiais.** Não se certifica autonomia total nem qualidade narrativa real por testes simulados.

## Resultado e comparação com o diagnóstico

O schema deixou de limitar metadados a Gloamhale; o importador seleciona ID/versão em um registro explícito. Game Engine e sessões consultam políticas do módulo. Blue Rose não consulta aventuras; validação mecânica de fichas reside em `blue-rose/sheet-validation.ts`. Conteúdo conserva os arquivos legítimos anteriores, com novo módulo de políticas e definição v2. A preparação de cenas foi extraída para execução reutilizável. O Director usa dados e evidências, sem objetivos fixos no prompt.

O namespace antigo e o JSONB da mansão são preservados. A migration 0007 adiciona namespace e minutos, sem apagar tabelas ou reescrever migrations anteriores. A definição v1 continua imutável; v2 não migra campanhas existentes. O único código removido foi o detector por prefixo de comando sem referências após a adoção dos schemas do registro. `rule-packs/` continua documental, sem motor universal. Nenhuma dependência nova ou serviço pago foi introduzido.

Os arquivos afetados e riscos previstos estão na [auditoria](../architecture/architecture-audit-5.1.md). O diff final segue esse escopo: registro/composição, políticas, cenas/tempo/objetivos/Curar, validação/hash, migration aditiva, testes e documentação. Não houve reescrita do Game Engine, do Python ou da interface. Alterações locais anteriores foram preservadas; não foram revertidas para estabelecer a linha de base.

## Matriz de autonomia

| Ação                       | Evidência / comportamento                                                                                         | Limite                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Importar campanha          | Registro seleciona versão, digest, referência e instância independentes; retry não reinicializa                   | CLI local de preparação                                                          |
| Validar ficha              | Habilidades, Saúde, pré-requisitos selecionados, recursos, focos e equipamento; digest inclui idiomas/objetivos   | Certificação geral de criação/benefícios continua humana antes do início         |
| Iniciar sessão             | Primeira cena dos dados é preparada automaticamente quando não existe outra preparação                            | Não escolhe ações da protagonista nem resolve encontro bloqueado                 |
| Conversar / decidir        | Gloamhale v2 registra pedido dos moradores e escolha explícita de investigar                                      | Opções preparadas; sem diálogo livre certificado                                 |
| Explorar / alterar mundo   | Fixture muda estado do local e cena dentro da transação                                                           | Precondições/lugares definidos no conteúdo                                       |
| Executar teste             | Fixture aguarda dado público, resolve no motor e só então confirma resultado/tempo                                | Nada de dados/TN vindos do LLM                                                   |
| Usar arcano                | Curar em si via opção ACT usa regras existentes, com teste e fadiga                                               | Demais arcanos identificados continuam bloqueados em seus usos não implementados |
| Avançar tempo              | Duração preparada/idempotente; comando genérico alimenta relógio da mansão; comando local também registra minutos | Minutos inteiros; duração de toda ação/efeito/ritual ainda não modelada          |
| OOC / pensamento / pausa   | Não avançam tempo narrativo ou propagam conhecimento                                                              | Cronômetro de atividade real continua independente                               |
| Concluir objetivo          | Backend comprova pares cena/opção por recibos e eventos da própria sessão                                         | Gloamhale v2 automatiza apenas o primeiro capítulo para o percurso documentado   |
| Encerrar / continuar       | Resumo factual, próxima sessão disponível, início explícito e histórico/memória intactos                          | Critérios subjetivos ainda requerem revisão local                                |
| Combater / ritual especial | Guardas e comandos locais anteriores preservados; falhas de auditoria revertem                                    | Autonomia do combate especial e ritual completo não foi certificada              |

## Mecânicas e fontes consultadas

Fichas locais confirmam Naelis com Escudo Psíquico, Segunda Visão, Contato Psíquico, Curar, Controle Corporal, Mover Objeto e Moldar Vento. Aren possui os três arcanos de Meditativo; Mira os três de Animismo; Lys não possui arcanos nesta revisão. Livro brasileiro pp.99–102 e 111–113 foi consultado para distinguir requisitos/limites; o suplemento pp.23–26 foi consultado para perigos/ritual e a distinção entre dano psíquico e ataque arcano resistível.

Não se aplicou Escudo Psíquico automaticamente ao dano do ritual: o perigo publicado não define um ataque arcano com teste de resistência de Vontade. Acrescentar essa proteção sem regra teria alterado a aventura. Os requisitos que faltam aos demais arcanos estão em [pendências](../rules/blue-rose-pending-rules.md). Convicção, Bonds, condições mentais, voo/etéreo, venenos, surpresa, benefícios e finalizações subjetivas continuam pendentes no recorte anterior. A política excepcional mantém fonte, justificativa, parâmetros limitados e auditoria; não existe ferramenta genérica de alteração do banco.

## Evidências executáveis

- `adventure-registry.spec.ts`: duas definições, versões, duplicidade, mutação do chamador, namespace, pares schema/executor, referências e codec de estado local.
- `architecture-boundaries.spec.ts`: separação das regras oficiais e ausência de referências concretas em registro, infraestrutura e prompts.
- `integration/adventure-registry.spec.ts`: fixture original só de teste, importação isolada/repetida, versão desconhecida, estado do mundo, tempo, Curar, teste público, objetivos, duas sessões encerradas e memória/histórico preservados. Sem comandos administrativos durante o jogo; preparação/revisão ocorre antes do início.
- Mesmo arquivo: recibo sem evento não conclui objetivo; falha na auditoria reverte mundo/tempo/cena; retry executa uma vez. Simulação da migration 0007 usa tabela temporária na conexão, preserva JSONB antigo e namespace/UUIDs históricos.
- `integration/gloamhale.spec.ts`: regressões de importação, transformação, relógio, ritual, restauração, gruta, transações, segredo, testemunhas e duas sessões; acrescenta percurso inicial v2 sem SCENE/REVIEW_SESSION durante jogo e avanço do relógio por comando genérico.
- Demais suítes anteriores: concorrência, auditoria, reinício de API/PostgreSQL, contratos e funcionalidades das fases anteriores.

Linha de base: **111 testes / 16 suítes da API**, todos aprovados antes da alteração.

| Verificação final          | Resultado                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| API, unidades e PostgreSQL | **125 testes / 19 suítes aprovados**, incluindo todos os anteriores                                                   |
| Cobertura API              | Linhas **93,80%**, branches **82,83%**, statements **92,11%**, funções **96,56%**; limiares globais de 80% atendidos  |
| Python                     | **31 testes aprovados**, cobertura **91%**                                                                            |
| Contratos compartilhados   | **3 arquivos de testes aprovados**                                                                                    |
| Web                        | **2 arquivos de testes aprovados**, build de produção webpack aprovado                                                |
| Tipos e lint               | TypeScript, mypy, ESLint e Ruff aprovados no monorepo                                                                 |
| OpenAPI                    | Exportado sem listener; nenhuma mudança incompatível ou rota administrativa nova                                      |
| Migrations                 | Aplicadas/reaplicadas no banco descartável; simulação de upgrade aprovada; Drizzle sem divergência de schema/snapshot |
| Integridade da entrega     | `git diff --check` e links dos novos documentos sem problemas                                                         |

Na revisão adversarial, a evidência automática foi reforçada para exigir o evento da própria etapa de resolução da opção, além de campanha/sessão. Um evento confirmado de outra ação não basta. IDs de evidências privadas usadas em atestação humana também são excluídos da projeção pública. Os testes incluem ambos os casos.

A última regressão identificou uma comparação legada de atributos sem ordenação SQL: os valores restaurados eram idênticos, mas a ordem física das linhas variava. As duas consultas comparadas agora usam `ORDER BY ability`; a suíte completa foi repetida e passou. Não houve ajuste de regra de jogo para contornar o teste. Os erros de auditoria intencionalmente injetados continuam sendo verificados por rollback.

Não foi executada inspeção nova no navegador: não há mudança de interface nesta entrega. O percurso usa HTTP/NestJS/PostgreSQL reais com o provedor simulado. Isso não demonstra qualidade narrativa com Gemini.

Comandos reproduzíveis, com `.tools/node_modules/.bin` no PATH quando necessário:

```sh
node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
pnpm typecheck
pnpm lint
pnpm --filter @solo-rpg/shared-contracts test
pnpm --filter @solo-rpg/web test
pnpm contracts:api
pnpm --filter @solo-rpg/api exec drizzle-kit generate
git diff --check
```

## Operação, recuperação e limites

Migrations e testes foram executados exclusivamente em PostgreSQL descartável, com container/volume próprios. **Banco real, campanhas, fichas, chats, sessões e referências reais não foram modificados.** Atualização local: backup verificável → migrations até 0007 → contratos/API/Python → web. Preservar tabelas/volumes para rollback; usar binários compatíveis e pausar campanhas antes de manutenção. Reimportação nunca é reset nem mecanismo de upgrade de instância.

O contador novo rastreia minutos desde sua introdução; não inventa histórico anterior de instâncias v1. O relógio particular conserva integralmente seus minutos anteriores. Revisões de fichas ainda não iniciadas precisam ser refeitas se o novo snapshot divergir da revisão anterior. Essa invalidação é intencional para evitar certificação obsoleta.

Gemini está configurado, mas `AI_FREE_TIER_CONFIRMED` permanece desativado. Não foi feita chamada real, não foi alterada essa configuração e não se pressupôs ausência de faturamento a partir da chave. Os 31 testes Python usam provedores simulados; qualidade de prosa real continua sem evidência.

Próximo trabalho dentro da Fase 5.1: automatizar os arcanos e estados especiais realmente usados, decompor bloqueios por ação, modelar adversários/encontros da mansão e critérios estruturados dos capítulos restantes. Não iniciar a Fase 6 nem outra aventura publicada automaticamente.
