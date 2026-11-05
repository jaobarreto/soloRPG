# Validação da Fase 5 — Gloamhale

Registro de 31/10/2026. **Entrega assistida e delimitada; não é certificação de toda a Fase 5 nem de uma campanha solo autônoma por IA.** O banco real e campanhas existentes não foram migrados, importados ou modificados nesta execução. Verificação usa PostgreSQL descartável, sem chamadas pagas ou credenciais de provedores reais.

## Resultado funcional

A auditoria do código e das fontes distinguiu transcrição de ficha, regras executáveis e registros sem efeito automático. Foram corrigidos/ampliados perfis fixos de cajado, arco e funda, repouso leve de quatro horas com sustento, recuperação vata e estabilização por Curar. Cura de zero não estabiliza e não consome a oportunidade de receber cura efetiva. Sessões não podem terminar com alguém morrendo. Criação e progressão gerais continuam parciais; o relatório de validação não as certifica automaticamente.

O suplemento contém Gloamhale, The Sixth Beast, The Night Market, A Harvest of Masks, Storm over Kamala e A Wanton Curse. A responsável escolheu **The Mistress of Gloamhale Manor**, adequada a Naelis nível 1 e à equipe de quatro. Há seis capítulos propostos de aproximadamente 120 minutos, fundamentados nas partes vila/pântano/mansão e em suas cenas, sem encerramento por contador ou roteiro obrigatório. [Análise e alcance efetivo da leitura](../adventures/six-of-swords/source-analysis.md).

A definição possui **16 cards (nove identidades nomeadas e sete arquétipos), 21 locais e 28 encontros**. Arquétipos não possuem memória pessoal coletiva. Chant na gruta está separada das crianças no sótão. Os bandos de ratos e strix têm referências próprias e continuam condicionais. O importador é privado, validado, transacional e idempotente; preserva referências, mundo jogado e histórico em registros separados. Não cria protagonista automaticamente nem sobrescreve campanha iniciada.

As fichas fornecidas estão transcritas separadamente da revisão autorizada dos companheiros: Aren vata’sha, Mira vata’an, Lys noturna. Naelis foi preservada. Ajustes de benefícios, focos e talento incompatível de Aren são rastreáveis em [validação da equipe](../adventures/six-of-swords/party-validation.md). A revisão inicial humana é obrigatória e uma alteração anterior ao primeiro início invalida o digest revisado.

Na mansão há comandos específicos para entrada infantil com memória aprovada, relógio narrativo de 1d3 horas, quatro estágios cumulativos, atributos adultos preservados, deslocamento individual, dano que transporta à gruta e restauração por causas válidas. O ritual compartilha limiar 12 + equipe, três tarefas, Drama Dice bem-sucedidos, benefícios limitados, perigo por tentativa e interrupção irreversível. O caminho automático exige decisão explícita de dispensar façanhas; não é suporte integral aos Stunts. [Regras e decisões locais](../adventures/six-of-swords/gloamhale-rules.md).

O contexto fornece à proposta do Mestre somente a cena e referências pertinentes, plano do capítulo, local, segredos relevantes, estado mecânico e lembranças individuais. Narração recebe o recibo público. O Director exige evidências persistidas e revisão humana para os critérios narrativos desta adaptação. As mudanças do ritual entram no estado dos adversários e no resumo; não concedem orbes ou libertação automática de Erila.

## Evidência executável

| Grupo                    | Evidência principal                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regras                   | `blue-rose-recovery.spec.ts`, `blue-rose-combat.spec.ts`, `gloamhale-mechanics.spec.ts`: recuperação, perfis, quatro estágios, negativos, limiar coletivo, tarefas distintas, falha e arredondamento de perigo. |
| Fonte e equipe           | `gloamhale.spec.ts`: referências/cross-references, identidades e arquétipos, separação de Chant, opções bloqueadas, preservação das fontes e reconstrução autorizada.                                           |
| Importação e privacidade | `integration/gloamhale.spec.ts`: importação repetida e concorrente, referência imutável, local privado, nenhuma rota administrativa, fichas existentes preservadas, CLI real sem listener.                      |
| Continuidade             | Duas sessões através de HTTP: decisões/eventos, conhecimento individual, relações, mundo alterado, releitura do histórico, preparação futura oculta, ordem alternativa e início explícito.                      |
| Mecânicas persistentes   | Entrada repetida não rerrola; tempo repetido não duplica; atributos restaurados; 0 de Saúde transporta sem morte; modificações genéricas conflitantes são bloqueadas.                                           |
| Ritual                   | Rolagem e resolução idempotentes, sucesso com 10 por ovo, ajuda compartilhada dos haints, tarefas obrigatórias, último perigo, transporte à gruta, estado de Jaymes e resumo após encerramento.                 |
| Recuperação transacional | Falha forçada de auditoria reverte toda a transcrição. Outra falha reverte dano/posição/eventos/recibo da mansão; repetir depois da correção executa uma única vez.                                             |
| Limites seguros          | Combate especial, exaustão fatal e operações com rolagem pendente são recusados explicitamente. Python usa OBSERVE para cenas sob adjudicação. Sem estado/fala voluntária inventada para a protagonista.        |

Comandos principais (pnpm no PATH):

```sh
node scripts/test-integration.mjs --coverage
node scripts/uv.mjs run pytest --cov=app --cov-report=term-missing
pnpm typecheck
pnpm lint
pnpm --filter @solo-rpg/shared-contracts test
pnpm --filter @solo-rpg/web test
pnpm --filter @solo-rpg/web build
pnpm contracts:api
```

O script de integração aplica migrations, usa container/volume exclusivos e os remove ao terminar. A suíte legada verifica reaplicação e persistência após reinício do PostgreSQL. A CLI real recebe o URL desse mesmo banco descartável, explicitamente passado ao subprocesso.

Resultados finais:

| Verificação                               | Resultado                                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| API: unitários + integração em PostgreSQL | **111 testes, 16 suítes, todos passaram**; inclui 16 testes de integração de Gloamhale.                               |
| Cobertura da API                          | Linhas **93,77%**, branches **82,11%**, statements **92,04%**, funções **96,48%**; limiares globais de 80% atendidos. |
| Regras puras da mansão/ritual             | 100% de cobertura em `gloamhale-mechanics.ts`. Isso não certifica regras não implementadas.                           |
| Serviço Python                            | **31 testes passaram**, cobertura **91%**; testes narrativos repetidos após ajuste do prompt.                         |
| Contratos compartilhados                  | **3 arquivos de testes passaram**.                                                                                    |
| Frontend                                  | **2 arquivos de testes passaram**; build de produção webpack passou.                                                  |
| Tipos e lint                              | Monorepo validado com TypeScript/mypy e ESLint/Ruff.                                                                  |
| OpenAPI                                   | API exportada sem listener; nenhuma nova rota administrativa.                                                         |

O build inicial do frontend falhou ao interpretar a saída de um subprocesso TypeScript no sandbox; a configuração foi validada e o mesmo build passou fora do sandbox, sem alteração de produto para contornar o ambiente. Uma asserção nova de teste também precisou de correção de tipagem antes da execução final; a suíte completa foi repetida e passou.

Não há teste de interface no navegador ou avaliação com LLM real nesta entrega; os testes narrativos usam cliente simulado e o fluxo determinístico de validação. Não se infere qualidade de narração de um provedor a partir deles.

## Pendências e critérios que permanecem abertos

- Leitura detalhada integral das outras cinco aventuras não está certificada. Elas foram identificadas e comparadas, mas somente Gloamhale recebeu esta adaptação.
- Criação/progressão gerais, benefícios completos de povos/talentos, Convicção/Destino/Sina, corrupção/redenção e Bonds ainda não possuem automação integral.
- Maioria dos arcanos, condições mentais, surpresa, voo/etéreo, venenos e combate especial exigem o operador e o livro. O combate genérico fica bloqueado na instância.
- Ritual automático abrange dispensa de façanhas. Proteções, talentos e demais modificadores são decisões locais explícitas; não existem gasto de PF ou efeitos de Escudo Psíquico automatizados nesse caminho.
- Relógio da casa é alimentado pelo operador com tempo narrativo confirmado; não mede automaticamente duração de repouso, deslocamentos ou conversas.
- Exaustão mortal em interação com a mansão exige adjudicação antes de Curar. Entradas separadas de integrantes em momentos diferentes estão fora do recorte.
- Há divergência do livro brasileiro entre escudos por tamanho e o texto de Estilo de Arma e Escudo. Ela não foi resolvida por um bônus inventado.
- Objetivos são atestados localmente a partir de evidências; não há verificação semântica geral, conversa livre com efeitos arbitrários, embeddings ou autenticação nova.

Para continuar, priorizar os bloqueios mecânicos efetivamente escolhidos na mesa e ampliar validação de fichas e efeitos, com referências e testes. Não iniciar fase seguinte, importação das outras aventuras ou serviços pagos automaticamente. [Matriz completa e procedimento de operação](../adventures/six-of-swords/adaptation-plan.md).

## Atualização de prontidão 5.6.3C.2

Gloamhale v4 é a referência para campanhas novas. A prontidão para
exploração livre permanece parcial. Presença, identificação e revelações
agora têm controle persistido no backend para os casos cobertos pela
revisão. Consulte o [relatório da revisão 4](../adventures/six-of-swords/gloamhale-narrative-integrity.md)
e a [auditoria original de localidades](../adventures/six-of-swords/gloamhale-location-audit.md).

## Atualização de prontidão 5.6.3C.3

Gloamhale v5 é a referência para campanhas novas. O backend valida e
persiste a exploração no recorte conectado da mansão, incluindo cômodos
sem encontro, revisitas e passagens condicionais. A rota sintética e as
regressões passaram com PostgreSQL descartável e IA simulada. Campanhas
anteriores continuam vinculadas às versões de origem.

A prontidão para exploração livre da aventura inteira permanece parcial.
As transições externas imprecisas e certas passagens dependem de
adjudicação. O catálogo integral de objetos e a investigação graduada
continuam pendentes. [Relatório da exploração espacial](../adventures/six-of-swords/gloamhale-spatial-exploration.md).
