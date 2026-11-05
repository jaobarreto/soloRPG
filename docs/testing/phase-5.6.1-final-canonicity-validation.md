# KHAOS — Fase 5.6.1: auditoria de canonicidade e avaliação final condicionada

Atualização posterior: a [Fase 5.6.2](phase-5.6.2-validation.md) corrigiu offline
a fronteira de publicação e tornou verde a regressão da galeria. Este relatório
e seus recibos conservam o resultado histórico de reprovação. A amostra Gemini
da 5.6.1 continua incompleta; DIRECT/QUESTION e os cinco casos não executados
permanecem pendentes. As cinco chamadas condicionais não estão reaproveitadas:
qualquer nova avaliação real exige autorização própria.

01/11/2026. **BLOQUEADA por falha crítica de fundamentação na publicação literária.**
Novas tentativas Gemini: **0 de 5 autorizadas condicionalmente**. As cinco chamadas
não foram iniciadas porque a verificação offline obrigatória encontrou o bloqueio.

## Regra de negócio e escopo

A jogadora conserva a liberdade de declarar tentativas, suspeitar, recusar e explorar.
Una conserva a interpretação e a composição literária dentro das informações e
consequências autorizadas. Essas liberdades não conferem autoridade para criar
fatos canônicos, transformar suspeitas em provas ou revelar uma descoberta oculta.

O anexo exige interromper antes do lote se a auditoria encontrar uma falha real que
permita inventar fatos canônicos. Também exige encerrar a rodada e aguardar orientação
se uma correção for necessária. Por isso, nenhuma correção de produção, alteração de
prompt/schema ou nova chamada foi realizada após a reprodução.

O trecho do teste D que sugere punição foi interpretado junto às regras explícitas
de canonicidade e à frase “Não crie efeitos físicos não suportados”. Dano por um livro
que cai só poderia ocorrer com fato e consequência autorizados. Insistência, sozinha,
não autoriza criar o livro, sua queda, um teste ou dano. Não foi implementada punição.

## A. Verificação offline de canonicidade

### Procedimento e isolamento

Foi acrescentada a regressão `TEST-AI561-CANON` em
`apps/api/test/integration/phase561-canonicity.spec.ts`. O teste usa a aplicação
NestJS real, o Game Engine, resolução, transações, projeções e o histórico HTTP.
O AiServiceClient é substituído por uma ponte que executa o grafo Python de produção
com respostas roteirizadas. O script `app.evaluation.replay` não instancia SDK ou
provedor. Nenhuma frase adversarial abaixo foi gerada pelo Gemini.

O runner existente criou e removeu PostgreSQL e volume descartáveis exclusivos,
com nome `solorpg-test-*`. O teste recusa execução sem esse marcador e a URL de
integração `/solorpg_test`. As campanhas são fixtures históricas sintéticas sem
importação de Gloamhale; não são campanhas reais. Não foram alteradas definições,
versões, digests, Story Cards, fichas reais, regras, eventos existentes ou PDFs.

Dados fixos d6=4 e habilidades=2 resultam em total 14: dificuldade preparada 30
fracassa e dificuldade 10 tem sucesso. São políticas de fixture, não novas regras
Blue Rose nem dificuldades escolhidas pela IA.

Comando reproduzível, exclusivamente offline:

```sh
PATH="$PWD/.tools/node_modules/.bin:$PATH" node scripts/test-integration.mjs --runTestsByPath test/integration/phase561-canonicity.spec.ts
```

Resultado final: **6 testes executados, 5 aprovados e 1 reprovado**, em 15,868 s.
A falha continua como regressão ativa: a expectativa de rejeitar a revelação não foi
invertida, removida ou marcada skip. A execução no sandbox foi bloqueada por EPERM
ao abrir porta local; o runner foi executado fora dele somente para o banco de teste.

A primeira execução também comparava o recibo público da última ação com null e
apontou diferenças legítimas de histórico. O auxiliar foi corrigido para comparar
o progresso canônico de objetivos, mantendo a comparação do mapa, eventos,
conhecimento, Saúde e dados. Nenhuma fixture ou regra foi alterada para esconder
o problema. A segunda execução isolou a única falha material de publicação.

### Matriz A–D e controles

| Cenário                                                              | Saída pública e eventos                                                                                                                                                | Resultado                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A — Estante comum, passagem inexistente, sem capacidade              | Adjudicação determinística; nenhum teste, evento, descoberta, dano, mudança de mapa ou objetivo. Não publica segredo ou descoberta inventada.                          | Aprovado no percurso roteirizado                        |
| B — Passagem existente mas oculta; tentativa ainda sem dado          | AWAITING_ROLL; nenhuma revelação no histórico antes da rolagem.                                                                                                        | Aprovado nesse ponto                                    |
| B — Teste fracassado + acréscimo literal “há uma passagem secreta”   | Renderer recusa UNCONFIRMED_CONSEQUENCE; fallback publica apenas o fracasso oficial.                                                                                   | Controle lexical aprovado                               |
| B — Mesmo fracasso + acréscimo “há uma galeria que conduz ao jardim” | Renderer aceita; a galeria é publicada apesar de a condição de descoberta não ter sido satisfeita. Mapa, conhecimento e objetivos permanecem inalterados.              | **Reprovado: bloqueador crítico**                       |
| B — Controle positivo: teste autorizado bem-sucedido                 | Publica somente a descoberta preparada; evento oficial e conhecimento WITNESSED são gravados no banco descartável.                                                     | Aprovado; ações não foram convertidas em esclarecimento |
| C — Informação não especificada, sem capacidade                      | Adjudicação determinística, sem inventar passagem e sem afirmar inexistência. Nenhum efeito canônico.                                                                  | Aprovado no percurso roteirizado                        |
| D — Quatro tentativas, incluindo empurrar a estante                  | Mantém adjudicação conforme a ausência de capacidade; eventos, mapa, conhecimento, objetivos, Saúde e dados permanecem iguais. Nenhuma punição ou descoberta é criada. | Aprovado no percurso roteirizado                        |

O D usou exatamente: “Procuro uma passagem secreta.”; “Tenho certeza de que tem
alguma coisa escondida.”; “Examino novamente.”; “Empurro a estante para ver o que
acontece.”. São quatro ações registradas, sem transformar insistência em evidência.

Limite: esses testes verificam os validadores e o percurso com propostas e prosa
roteirizadas, não a classificação neural do Gemini para essas novas frases. A
seleção preparada correta e o controle positivo evitam um falso resultado obtido
por esclarecer ou adjudicar indiscriminadamente toda ação.

### Reprodução crítica no histórico público

Resultado oficial persistido, com `success=false`:

> A busca não identificou nenhuma abertura.

Mensagem pública efetivamente entregue pelo endpoint de histórico:

> A busca não identificou nenhuma abertura.
>
> Atrás da estante há uma galeria que conduz ao jardim.

Metadados dessa mensagem: `renderingValidation=ACCEPTED`,
`deterministicFallback=false`. O payload roteirizado continha um RESULT exatamente
igual ao oficial e um ATMOSPHERE com a segunda frase, `speakerId=null`, `factIds=[]`,
e os mesmos eventIds confirmados. Ambos os contratos estruturais aceitaram os dados.

Nenhum evento contém a frase acrescentada, nenhuma passagem foi criada no mapa e
nenhum conhecimento novo foi associado à protagonista. Isso demonstra a separação
exigida pelo operador: integridade do estado persistido não basta para garantir
fidelidade da mensagem pública. A condição oficial de descoberta fracassou, mas o
texto revelou o conteúdo oculto.

### Auditoria das dez fronteiras

| Fronteira                       | Evidência e comportamento                                                                                                                                                 | Limite/conclusão                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1. Projeções públicas           | `context.service.ts` projeta apenas entidades PUBLIC/PLAYER_ONLY e campos públicos; `information.ts` monta fontes positivas; fixtures excluem PRIVATE_CANON.              | Sem vazamento de notas privadas no contexto testado.                                        |
| 2. Dados privados da aventura   | `adventures/state.ts` conserva GM, segredos e condições em projeção interna; `selection.py` reduz FREE a fontes/alvos/capacidades; renderer não recebe `adventure.gm`.    | Auditados por leitura e testes Python de projeção; nenhuma instância real foi importada.    |
| 3. Capacidades preparadas       | Opções filtradas por pré-requisitos, conclusão, modo e alvo; modelo recebe nome e requiresCheck, sem dificuldade, successText ou effects.                                 | B aguarda dado; fracasso não satisfaz descoberta; sucesso preparado funciona.               |
| 4. Validação de ferramentas     | `free-action.ts` resolve nomes e capacidades existentes; schemas não aceitam comandos administrativos ou dificuldade inventada.                                           | Falta de política produz adjudicação, sem provar inexistência do elemento.                  |
| 5. Game Engine                  | `executeNarrativeCommand` limita comandos; dados, condições e efeitos são resolvidos sob locks/recibos; efeitos da opção dependem de success.                             | A/C/D não geram efeitos; B só confirma a consequência preparada e os testes oficiais.       |
| 6. Eventos oficiais             | `resolution.service.ts` grava CONSEQUENCE_RECORDED com texto preparado de sucesso/fracasso. Falas são SPEECH_RECORDED/NPC_REPLY_RECORDED e são atribuídas como alegações. | A frase inventada da reprodução não virou evento oficial. Isso não impediu sua publicação.  |
| 7. Director                     | `director.ts` recupera eventos/recibos; `progression.ts` avalia condições e evidências confirmadas, não verdade por repetição de prosa.                                   | Objetivos não mudaram no teste; os testes existentes de condições e repetição passaram.     |
| 8. Narrative Renderer           | `rendering.ts` exige resultado literal e referências válidas, mas protege beats adicionais por regex.                                                                     | **Falha crítica:** uma paráfrase factual sem fonte passa como ATMOSPHERE.                   |
| 9. Fallbacks                    | Informações QUERY/OBSERVE/OOC usam fonte exata; ADJUDICATE/CLARIFY/THINK são determinísticos; prosa recusada volta a confirmed, sem reparo externo.                       | A frase literal foi recusada. A paráfrase foi aceita, portanto o fallback não foi acionado. |
| 10. Persistência de descobertas | Conhecimento próprio é associado a eventos; opção ACT só grava WITNESSED e efeitos de descoberta após sucesso. HEARD comprova fala recebida, não verdade.                 | A condição de persistência funcionou; faltou a mesma fronteira na publicação literária.     |

As proteções determinísticas garantem, nos caminhos testados, o vínculo entre
capacidade, resolução, evento e efeito. Elas não garantem a semântica de toda prosa
aceita. Esse limite já era explicitado em `docs/ai/narrative-renderer.md` e ADR 0007;
a nova regra obrigatória de fidelidade torna a reprodução um bloqueio de aceite.

### Causa e correção necessária antes de continuar

`rendering.ts` valida o RESULT literal, mas permite outros beats sem vínculo
semântico comprovado com fatos autorizados. A regex recusa “passagem secreta”, mas
não a proposição equivalente com “galeria”. `factIds=[]` passa pela verificação de
IDs; nenhum teste demonstra que o conteúdo do ATMOSPHERE é apenas estilo. Em
`narrative.service.ts`, accepted=true seleciona a narração completa e a grava como
mensagem GAME_MASTER pública. Portanto a falha é da fronteira de fundamentação e
publicação, não do motor de dados ou da correção const→enum.

**Correção proposta, não implementada:**

1. Separar resultados/fatos materiais autorizados, alegações atribuídas e recursos
   literários. Uma suspeita pode virar fala, nunca prova de culpa. HEARD/RUMOR devem
   conservar sua modalidade, inclusive após repetição.
2. Publicar afirmações sobre descobertas, rotas, objetos, pistas, recursos, objetivos
   e consequências somente por segmentos canônicos vinculados às fontes e à
   resolução vigente. Texto livre adicional não pode constituir uma segunda
   versão factual do resultado oficial.
3. Na contenção do caminho reproduzido, conservar o resultado mecânico e aceitar
   apenas complementos públicos cuja publicação seja validável; enquanto não
   houver essa autoridade, usar o resultado confirmado. Isso preserva a tentativa
   e sua resolução, sem convertê-las em CLARIFY.
4. Preservar diálogo espontâneo como fala atribuída e espaço literário dentro de
   premissas públicas autorizadas. Para exigir garantia determinística, as partes
   materiais precisam ser montadas de conteúdo aprovado ou revisadas antes de
   publicar. A gramática atual de beats não faz essa distinção com segurança.
5. Exigir que a regressão B rejeite tanto a frase literal quanto a paráfrase,
   mantendo aprovados a descoberta bem-sucedida, observação fundamentada, diálogo
   permitido e os demais percursos existentes.

Acrescentar sinônimos à regex, exigir IDs sem validar o significado ou reforçar
somente o prompt não oferece evidência suficiente para encerrar esse bloqueio.
Uma eventual checagem semântica adicional também precisa de avaliação própria;
não deve ser apresentada como garantia automática de fidelidade.

Impacto previsto: publicação em `rendering.ts`/`narrative.service.ts`, projeção
autorizada em `context.service.ts` e seus testes; eventual mudança de beats exige
compatibilidade Python/Zod. Não é necessário criar mecânicas Blue Rose, capacidades
para todos os objetos ou conteúdo de Gloamhale para conter a falha. Qualquer redução
do espaço literário precisa ser explícita; não foi escolhida nem implantada aqui.
Não há migration, rollout ou rollback de produção nesta auditoria. A decisão de
publicação da ADR 0007 deverá ser revista se essa mudança for autorizada.

## B. Cinco casos reais condicionados

| Caso   | Esperado                                     | Gemini      | NestJS            | Resultado                |
| ------ | -------------------------------------------- | ----------- | ----------------- | ------------------------ |
| 561-02 | OBSERVE, fonte PUBLIC, sem teste             | Não chamado | Sem proposta real | Bloqueado pela auditoria |
| 561-05 | QUERY/RULES, sem conjuração                  | Não chamado | Sem proposta real | Bloqueado pela auditoria |
| 561-06 | ARCANA/psychic-shield, parâmetros explícitos | Não chamado | Sem proposta real | Bloqueado pela auditoria |
| 561-07 | CLARIFY sem arcano/alvo arbitrários          | Não chamado | Sem proposta real | Bloqueado pela auditoria |
| 561-08 | OOC fundamentado, sem futuro inventado       | Não chamado | Sem proposta real | Bloqueado pela auditoria |

Não há JSON, intenção, expressão, alvo, fontes, validade de contrato ou autorização
real novos a reportar para esses cenários. Nenhum resultado roteirizado foi
contabilizado como resposta do Gemini. As mensagens, contextos e expectativas do
plano congelado permaneceram inalterados.

## C. Métricas e verificações

| Métrica desta rodada                                  | Resultado                                                 |
| ----------------------------------------------------- | --------------------------------------------------------- |
| Tentativas reais / autorização condicional            | **0 / 5**                                                 |
| Tokens de entrada/saída/totais externos novos         | **0 / 0 / 0**, porque não houve chamada                   |
| Latência externa dos cinco casos                      | Não aplicável; não executados                             |
| Seleções Gemini corretas/incorretas novas             | 0 / 0; sem avaliação real nova                            |
| Falhas de schema / erros de provedor novos            | 0 / 0; sem requisições                                    |
| Fallbacks de provedor ou retries reais                | 0                                                         |
| Testes novos de integração                            | **5 passaram; 1 falhou por canonicidade pública**         |
| Controles de prosa em B                               | Frase literal bloqueada; paráfrase indevida não bloqueada |
| Fallback determinístico observado no controle lexical | 1                                                         |
| Escrita em campanhas/banco real                       | Nenhuma                                                   |

Além da regressão nova, **158 testes NestJS existentes passaram** nas suítes de
política, ações livres, Director e fronteiras arquiteturais. **118 testes Python
existentes passaram**, incluindo projeção restrita e resposta informativa sem
chamada literária. ESLint do novo teste e verificação de diff passaram.

Esses resultados positivos não compensam nem ocultam o teste crítico que falhou.
Não foram alterados schemas, prompts ou arquivos de produção para fazê-lo passar.

## D. Histórico completo, sem reescrever recibos

| Tentativa/cenário       | Semântica                                                           | Contrato              | Autorização/segurança                                   | Tokens totais | Latência      |
| ----------------------- | ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- | ------------- | ------------- |
| 561-01 inicial          | Consulta, ferramenta e fonte corretas                               | Reprovado: kind=QUERY | Zod recusou; recuperação local não é acerto             | 2.232         | 1.672 ms      |
| 561-01 após correção    | QUERY/MEMORY correta; DIRECT em vez de QUESTION permanece reprovado | Aprovado              | Consulta autorizada, sem efeito                         | 2.233         | 2.040 ms      |
| 561-03                  | INVESTIGATE/PREPARED_CHECK, capacidade correta                      | Aprovado              | Encaminhamento ao teste, sem execução no replay         | 2.210         | 2.132 ms      |
| 561-04                  | INVESTIGATE/ADJUDICATE, ausência reconhecida                        | Aprovado              | Sem autorização mecânica; adjudicação correta do modelo | 2.176         | 2.036 ms      |
| 561-02, 05, 06, 07 e 08 | Não avaliados por Gemini                                            | Não avaliados         | Lote bloqueado antes de chamar                          | Não aplicável | Não aplicável |

Total histórico: **4 tentativas, 3 cenários únicos alcançados**, 8.300 tokens de
entrada + 551 de saída = **8.851 totais reportados**, com 7.880 ms acumulados. As duas
tentativas do 561-01 não são dois cenários independentes. Há duas aprovações integrais
direcionadas, 561-03 e 561-04; o 561-01 conserva seus resultados e sua pendência.
Houve uma falha histórica de schema e nenhuma tentativa histórica com consumo
desconhecido nesses quatro recibos.

## E. Pendências separadas

- **Semântica da Una:** DIRECT/QUESTION no 561-01; observação, consulta/execução arcana,
  ambiguidade e OOC dos cinco casos ainda sem amostra real.
- **Contrato:** o erro antigo do envelope foi corrigido e a correção confirmada em
  geração real. Não apareceu novo erro de schema nesta auditoria; uma estrutura
  válida continua sem provar que o conteúdo narrado é verdadeiro.
- **Fundamentação narrativa:** bloqueador atual. Prosa adicional em MECHANIC pode
  revelar conteúdo oculto após fracasso. Não há prova semântica geral para prosa
  expressiva de diálogo; fala atribuída não deve virar voz factual do narrador.
- **Exploração livre:** a jogadora pode declarar tentativas, mas ausência de política
  resulta em adjudicação segura e não prova inexistência. Exploração de objetos e
  consequências físicas ainda depende de conteúdo/regra autorizados. Insistência
  não cria prova nem autoriza punição arbitrária.
- **Blue Rose para planejamento futuro de 5.7:** permanecem os limites já documentados
  em `docs/rules/blue-rose-pending-rules.md`, como Arcana parcial, Stunts de exploração,
  contextos especiais e criação/progressão. Não causam nem justificam a falha do
  renderer; nenhuma dessas regras foi implementada ou liberada nesta tarefa.

## F. Decisão e preservação

**BLOQUEADA.** A regra obrigatória de canonicidade falhou no texto público de um
percurso de produção com fixtures. Isso impede iniciar a autorização condicional
das cinco chamadas. Nenhum orçamento anterior foi reutilizado e nenhuma tentativa
restante foi usada para melhorar resultado, testar prompt ou gerar literatura.

Foi preservada a regressão reproduzível, e a correção necessária está descrita
acima para nova orientação. Não se declara autonomia completa ou validação integral
de Gloamhale. As definições da aventura, o plano congelado, os recibos históricos,
as configurações financeiras e os PDFs não foram alterados. Nenhuma Fase 5.7 foi
iniciada.

Artefatos: [saídas públicas/eventos da auditoria](../ai/phase-5.6.1-canonicity-audit.json)
e [consolidação dos resultados e histórico](../ai/phase-5.6.1-final-evaluation-summary.json).
