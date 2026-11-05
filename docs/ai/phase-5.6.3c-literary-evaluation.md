# Una — protocolo de avaliação literária 5.6.3C

02/11/2026. Preparação offline C.0. Não aprova qualidade do Gemini. Nenhum
G3/G4/G5/G6, texto de biblioteca ou comportamento de produção foi implementado.
O [relatório de validação](../testing/phase-5.6.3c-0-validation.md) registra execução,
limites e preservação. O [plano C.1](phase-5.6.3c-1-live-plan.json) é uma proposta
sem autorização e sem executor externo nesta entrega.

## O que está sendo avaliado

São três eixos independentes: integridade estrutural/publicação; adequação da
seleção ao pedido; e experiência literária. Uma substituição segura comprova
recuperação, mas reprova a seleção que precisou dela. Texto autorizado pode ser
irrelevante, artificial ou repetitivo. Texto agradável que inventa acontecimentos
reprova o gate canônico, independentemente de qualquer nota de estilo.

Não chamar todo problema de qualidade de falha da Una/Gemini:

| Responsável                 | Pode determinar                                                                              | Limite observado                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Python/Una                  | Interpretar mensagem inteira, selecionar assunto/ato e escolher/ordenar beats disponíveis    | Não escreve paráfrases, motivos, gestos ou respostas novas; seleção real ainda não medida |
| Biblioteca G1/G2            | Vocabulário, voz, atos e conteúdo conversacional revisado                                    | Duas vozes, quatro assuntos, 34 fragmentos no total; só 1–2 variantes por par elegível    |
| Preparação da aventura/cena | Fontes públicas, identidade, estado, presença, assunto/fonte e autorização opt-in            | Ter speech/goals no card não os transforma em texto ou conhecimento público               |
| NestJS/contexto/memória     | Elegibilidade, origem individual, modalidades, catálogo atual e texto efetivamente publicado | Recuperar memória corretamente não produz uma boa forma literária de a expor              |
| Renderer                    | Catálogo de strings integrais, montagem e validação transacional                             | Concatenação com parágrafos; sem histórico recente de fragmentos no NARRATE               |
| Director/motor              | Resultado, efeitos e progressão oficiais                                                     | Ritmo literário não autoriza descoberta, reconciliação, obediência ou fim de cena         |

O modelo pode omitir atmosfera e QUESTION opcionais hoje. Repetir esses beats nos
seletores do laboratório é escolha experimental explícita, não obrigação da
fronteira. A regra de uma réplica contextual completa impede somar alternativas
para fabricar uma declaração não revisada; deve permanecer.

## Material e fronteiras de evidência

| Material                                                   | Origem efetiva                                                                       | O que permite concluir                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A: 58 turnos / 12 sequências                               | HTTP/NestJS + grafo de produção + FIRST/VARIED roteirizados + PostgreSQL descartável | Comportamentos permitidos pelo catálogo anterior; não escolhas Gemini                         |
| B: mesmos 58 pedidos                                       | Mesmo caminho, preparação G1/G2 e seleção roteirizada novas                          | Comparação descritiva pareada; preparação e seleção mudaram juntas                            |
| B.1: dois exemplos positivos distintos                     | HTTP/FastAPI/grafo simulado + NestJS/PG descartável, falas persistidas               | Acesso opt-in de Story Cards, atribuição e HEARD; não conversa longa comparável a A/B         |
| C.0: 12 cenários, 50 mensagens, dois seletores, 100 saídas | Helpers de catálogo/autorização/publicação de produção em memória                    | Capacidade atual elegível e sensibilidade à seleção; sem persistência ou interpretação neural |
| Recibos reais 5.3/5.4/5.6/5.6.1.2                          | Modelos reais históricos, com limitações documentadas em cada fase                   | Contexto histórico apenas; arquitetura/pedidos diferentes, fora das métricas C.0              |

Os três exemplos brutos B.1 contêm duas ocorrências do mesmo Lior. Não tratá-las
como três observações independentes. Os dois exemplos distintos usam nomes
homônimos e fontes próprias; não representam nova geração de personagens.

Na matriz nova, sessões são rótulos de projeções congeladas. O lifecycle e a
persistência são exercitados separadamente pelas regressões B.1. Não há simulação
de escrita de memórias depois de cada resposta. A cadeia recursiva é observada no
transcrito A real do laboratório, não inventada para completar o cenário novo.
Resultados mecânicos NAR-09/10 são entradas sintéticas explicitamente declaradas;
a falha oficial do motor é reexercitada na integração existente.

## Instrumentos e definição das medidas

Entradas: [fixture de 12 cenários](../../apps/api/test/fixtures/phase563c0-literary.json),
[replay dos catálogos](phase-5.6.3c-0-catalog-results.json), artefatos A/B/B.1 intactos.
Saída: [métricas reproduzíveis](phase-5.6.3c-0-offline-metrics.json).

O [avaliador offline](../../apps/ai-service/app/evaluation/literary_preparation.py)
usa somente biblioteca padrão e o gate de achados explícitos já existente. Não
importa cliente, roteador ou SDK de provedor. Recusa origens misturadas, matriz
incompleta, pedidos/contextos seletivos diferentes da fixture e sobrescrita de
saídas existentes. Não oferece `--authorize-live`.

| Medida                          | Definição / denominador                                                                      | Natureza e limite                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Resposta idêntica adjacente     | Igualdade integral entre respostas vizinhas dentro da mesma execução                         | Objetiva; alternar duas frases pode zerá-la                                               |
| Frequência de respostas         | Ocorrências, distintos e ocorrências além da primeira por execução                           | Objetiva; não somar execuções como uma conversa única                                     |
| Fragmentos publicados           | Strings dos beats efetivamente aceitos; distribuição e repetidos além da primeira            | Objetiva; jamais contar draft rejeitado como publicado                                    |
| Fragmentos consecutivos         | Quantos textos do turno reaparecem no conjunto do turno anterior                             | Objetiva; repetir RESULT obrigatório não constitui erro automático                        |
| Abertura / encerramento         | Primeira sentença da fala sem nome / última linha da mensagem                                | Recorte de abertura aproximado por pontuação; última linha exata, sem julgar adequação    |
| Estrutura sintática             | Sequência dos kinds e faixas de palavras por sentença                                        | Proxy grosseiro, sem parser gramatical nem nota de qualidade                              |
| Citação aninhada                | Maior número de `>` no início de uma linha; turnos com profundidade >1                       | Objetiva para esse formato; não mede conteúdo ou compreensão                              |
| Alternativas elegíveis          | Quantidade e distribuição de réplicas preparadas do par solicitado após autorização          | Objetiva no recorte preparado; total da biblioteca não é disponibilidade do turno         |
| Vozes                           | Igualdade sem nome e Jaccard de conjuntos de palavras em pares da mesma pergunta             | Similaridade textual aproximada; diferença lexical não comprova personalidade perceptível |
| Linguagem de auditoria          | Turnos contendo expressões declaradas, como “resultado confirmado”                           | Sinal para revisão; incerteza ficcional legítima também pode ser marcada                  |
| Referências próprias            | factIds publicados pertencem à projeção própria autorizada daquele turno                     | Propriedade/integridade, não pertinência nem verdade semântica da fonte                   |
| Genericidade apesar de conteúdo | Fala aceita fora das réplicas preparadas quando elas existem                                 | Observação da seleção; relevância ainda exige julgamento contextual                       |
| Falta de conteúdo               | CLARIFY por UNAUTHORIZED_DIALOGUE_SELECTION, quando esse motivo está registrado              | Não é fallback de publicação; histórico sem motivo suficiente fica não classificado       |
| Rejeição/fallback               | Motivo de validateRendering e deterministicFallback preservados                              | Rejeição segura não é sucesso semântico; nenhum draft entra nas medidas de publicação     |
| Continuidade                    | Fontes próprias/selecionadas por turno e sessão, com transcritos/invariantes correspondentes | Disponibilidade observável; integração emocional e recuperação apropriada pedem revisão   |

`semanticSourceRelevance`, notas humanas e notas literárias automáticas permanecem
`null`. Fonte válida mas pouco pertinente deve ser marcada pelo revisor com o
pedido, a resposta e a referência exata. IDs e hashes não substituem essa leitura.

## Diagnóstico dos três problemas prioritários

**Personagens genéricos.** RESERVED/WARM apresentam strings diferentes. Ainda
compartilham grande parte do registro explicativo e não são identidades individuais.
No controle VOICE_PROFILE_COLLAPSE, mudar speech, motivação e personalidade dentro
da categoria reservada não mudou o catálogo. O vínculo escolhe perfil; o modelo
não pode transformar o perfil em uma frase nova. Falta de resposta específica
sobre motivos de viagem é lacuna de conteúdo/preparação, não prova de falha neural.

**Diálogos artificiais.** NAR-07-t1 e o exemplo persistido B.1 publicam:

> Lior — Da promessa, posso retomar o que ouvi; não um resultado confirmado:
>
> > A protagonista disse: pretendo ajudar quando puder.

A origem HEARD e a diferença entre promessa e cumprimento estão corretas. O
preâmbulo transporta linguagem de comprovação para a boca do NPC. Isso vem do
texto v1, não de improvisação do provedor simulado. A modalidade precisa ser
preservada; sua exposição burocrática não é uma exigência inevitável de segurança.
Qualquer alternativa editorial futura deve ser revista/versionada, sem liberar
paráfrases e sem eliminar a incerteza.

**Repetição.** NAR-12 oferece duas variantes ANSWER de desacordo em todos os 12
turnos. FIRST_PREPARED produz uma resposta distinta, 11 repetições adjacentes e
33 fragmentos repetidos em 36 ocorrências. ROTATE_PREPARED produz duas respostas
distintas, zero adjacentes idênticas e 31 fragmentos repetidos nas mesmas 36
ocorrências. A alternância não cria desenvolvimento. Ambos acrescentam atmosfera
e QUESTION deliberadamente; sua omissão já é possível. G4 poderia reduzir os
acessórios repetidos, mas não criar razões ou réplicas que não existem.

NAR-02-t3 ilustra outro limite: “Discordo. Quero entender suas razões” recebe
“Não concordo em tomar uma acusação como prova”. A frase é autorizada, mas o
pedido não formulou uma acusação. O seletor é roteirizado: demonstra um encaixe
ruim possível, não um erro observado do Gemini. Testar pertinência apenas pela
aceitação da fonte/ato ocultaria esse problema.

## Rubrica humana 1–5

Pontuar a sequência completa e citar turnos específicos. Notas de turnos isolados
servem como evidência; não substituem o julgamento da sequência. Usar N/A com
motivo quando não houver objeto, por exemplo memória anterior não fornecida.
Nenhum texto futuro recebe nota antecipada. Não calcular média compensatória.

| Dimensão             | 1                                           | 2                                         | 3                                         | 4                                             | 5                                                                             |
| -------------------- | ------------------------------------------- | ----------------------------------------- | ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Naturalidade         | Predomina resposta de sistema               | Conversa travada por explicações técnicas | Compreensível, com fórmulas perceptíveis  | Conversa fluida, raras passagens artificiais  | Responde organicamente às nuances, sem mecanismo aparente                     |
| Personalidade        | Voz intercambiável ou incompatível          | Só etiqueta de perfil/abertura            | Perfil reconhecível em parte              | Voz consistente e reações próprias            | Identidade perceptível sem depender do nome, sustentada nos turnos            |
| Contextualização     | Não responde ao pedido                      | Fonte válida, pouco pertinente            | Responde ao núcleo, perde detalhes        | Integra assunto e intenção com precisão       | Cada réplica desenvolve exatamente a situação autorizada                      |
| Continuidade         | Contradiz/ignora passado disponível         | Recita sem integrar ou reinicia conversa  | Retoma acontecimento corretamente         | Integra memória e estado com clareza          | Passado influencia a cena de modo sutil e consistente entre sessões           |
| Variedade            | Mesmas frases dominam                       | Alterna fórmulas sem desenvolvimento      | Alguma variação pertinente                | Varia forma e desenvolvimento sem redundância | Sustenta diversidade contextual sem invenção ou enchimento                    |
| Qualidade literária  | Prosa confusa/técnica domina                | Legível, rígida e expositiva              | Clara e funcional, expressão limitada     | Expressiva, precisa e agradável               | Escrita expressiva e coerente com aventura, voz e situação                    |
| Ritmo                | Estagna ou força avanço                     | Filler e fechos interrompem               | Extensão aceitável com oscilações         | Cada beat tem função; decisão bem posicionada | Cadência acompanha tensão e pausas sem condução forçada                       |
| Agência              | Inventa decisão/fala/emoção da protagonista | Pressiona escolha ou presume aceitação    | Controle preservado, sugestões dirigidas  | Alternativas abertas e autonomia clara        | Sustenta oportunidades expressivas sem tomar a protagonista                   |
| Fidelidade ao cânone | Inventa/contradiz resultado/fato            | Insinua conclusão sem base suficiente     | Afirmações sustentadas, exposição ambígua | Fatos/resultados claros e precisos            | Toda afirmação material tem origem correta, escopo e incerteza preservados    |
| Segurança narrativa  | Expõe segredo ou transfere memória          | Confunde quem ouviu/sabe ou origem        | Acesso protegido, atribuição pouco clara  | Fontes, identidades e modalidade claras       | Proteção e legibilidade consistentes, sem vazamento nem consequência inferida |

Agência, sigilo, fidelidade ao resultado, descoberta não autorizada, alteração
indevida de estado/relação e contradição canônica são **eliminatórios**. Um achado
comprovado basta para reprovar, mesmo com notas 5 nas outras dimensões. As notas
de agência/cânone/segurança não substituem o gate nem transformam incerteza em
aprovação. Achado não verificável fica pendente, não é descartado por média.

Contrastes para orientar a revisão, sem atribuir notas nesta entrega:

- Correta e artificial: o exemplo Lior acima conserva HEARD, mas usa “resultado
  confirmado” como vocabulário de auditoria. Rever naturalidade separadamente.
- Agradável e pouco pertinente: a descrição de luz/verniz dos transcritos A/B
  pode ser legível, mas repetida após pedido de razões não fornece essas razões.
- Natural e incompatível: uma réplica fluente que apague a reserva ou o conflito
  do perfil deve perder em personalidade/continuidade; fluência não a salva.
- Excelente e autorizada: exige responder ao pedido, sustentar voz e continuidade,
  evitar fórmulas e passar todos os gates. Nenhuma amostra é declarada excelente
  apenas por estar no catálogo ou ter baixa similaridade.

Ficha de revisão proposta: reviewerId/data; origem; cenário/seletor/turnos; pedido;
trecho literal publicado; draft original, se existir; fonte/estado/resultado
oficial; nota ou N/A por dimensão; justificativa por nota; pertinência da fonte
(pertinente / válida mas insuficiente / inválida / não avaliável); eliminatórios;
distinção entre falha de conteúdo, seleção e publicação; decisão fundamentada.
Começar com texto visível e nomes de interlocutores mascarados na comparação de
vozes; depois conferir os perfis e todas as fontes autorizadas. Solicitar segunda
leitura humana quando houver discordância, sem inventar concordância entre revisores.

Suficiência literária proposta para revisão do operador: gates íntegros e pelo
menos 3 por sequência em naturalidade, personalidade, contextualização,
continuidade aplicável, variedade, qualidade literária e ritmo. Resultado inferior
é diagnóstico de insuficiência, não permissão para mudar o gabarito. Sem revisão
humana, o estado continua pendente, mesmo com todos os testes técnicos aprovados.

## Alternativas técnicas para decisão futura

O primeiro trabalho editorial candidato é uma **nova versão** de conteúdo G1/G2,
com motivos públicos realmente preparados e vozes individualizadas. Mais sinônimos
não resolvem o NAR-12. Não alterar a v1 em uso ou os digests de Gloamhale para
melhorar uma comparação. Todas as propostas abaixo mantêm texto integral,
speakerId/factIds, RESULT literal, fontes e revalidação transacional da 5.6.2.

### G5 — proveniência e exposição editorial de memória (prioridade 1)

- Problema/evidência: citação da réplica que cita outra réplica no A VARIED,
  profundidade máxima 4; preâmbulo técnico persiste em B.1/NAR-07.
- Mudança: projetar referências ao evento-base e sua natureza de fala, separar
  registro de réplica de fonte relevante e preparar formulações públicas revistas.
  Guardar toda memória original; não preencher WITNESSED/papel por inferência.
- Impacto esperado: evitar eco recursivo e reduzir linguagem de auditoria, mantendo
  autoria e diferença entre dizer/fazer. Ganho é hipótese até revisão comparável.
- Riscos/dependências: filtrar a única prova de uma fala legítima; perder modalidade;
  atribuir promessa ao NPC. Exige contrato de proveniência e revisão editorial;
  prova nova de participação de cast é recorte separado, sem backfill histórico.
- Testar: fala original/recontada, rumor, memória exclusiva, relato recém-ouvido,
  duas sessões, fonte removida, rollback e citação integral acessível.
- Isolamento: possível começar por projeção editorial aditiva sem apagar banco;
  autoria de conteúdo deve ser versionada. Não exige liberar geração livre.

### G4 — repetição com histórico recente (prioridade 2, após repertório)

- Problema/evidência: NAR-12 reduz adjacentes a zero mas mantém 31/36 fragmentos
  repetidos; histórico recente não integra o RenderingContext atual.
- Mudança: IDs de fragmentos efetivamente publicados, janela editorial limitada e
  escopo por conversa/origem; preferência por alternativas e omissão de opcionais.
- Impacto esperado: menos atmosfera/fechos reciclados. Não cria conteúdo ausente.
- Riscos/dependências: esgotamento, ocultar RESULT/consulta pedida, trocar voz,
  impedir único fallback seguro, misturar históricos privados. Requer proveniência
  de publicação confiável e repertório pertinente suficiente.
- Testar: 12+ turnos, pedido explícito de repetição, só uma alternativa, mecânica,
  duas sessões/reabertura, retry e histórico de outro interlocutor inacessível.
- Isolamento: contexto editorial aditivo e seleção sob o catálogo atual; nenhuma
  alteração de memória canônica. Contadores não passam a controlar o Director.

### G3 — composição contextual (prioridade 3)

- Problema/evidência: atmosfera e QUESTION escolhidos em 22/29 turnos por seletor
  nos laboratórios A/B; concatenação pode sobrecarregar uma boa resposta curta.
- Mudança: padrões revisados de função/ordem/omissão dos beats já autorizados,
  antes de qualquer expansão do contrato. Preservar uma réplica contextual completa.
- Impacto esperado: melhor ritmo e menos fecho duplo; alternativas de composição
  não substituem uma resposta substantiva ausente.
- Riscos/dependências: ordem insinua causalidade, gesto/resultado extra ou acordo;
  transformar várias alternativas em uma alegação nova. Exige revisão de combinações.
- Testar: mesma resposta com/sem atmosfera/QUESTION, resultado obrigatório literal,
  combinação adversarial, interlocutor, factIds, estado revogado e agência.
- Isolamento: possível começar só por orientação/planejamento de seleção; toda
  string ainda precisa coincidir com o catálogo recomposto. Não implementado aqui.

### G6 — apresentação literária do resultado (prioridade 4)

- Problema/evidência: NAR-09/10 e histórico preservam resultado literal; observação,
  consulta e adjudicação têm saída técnica determinística, sem gerador literário.
- Mudança: projeções públicas revisadas no servidor antes da narração, separadas
  do cálculo e rastreáveis ao recibo. Depois disso RESULT continua literal.
- Impacto esperado: leitura mais agradável sem alterar escopo do sucesso/fracasso.
- Riscos/dependências: “não encontrou” virar “não existe”; somar descoberta,
  mudar consentimento/custo ou sugerir outro teste. É o recorte mais sensível ao
  motor; exige matriz oficial delimitada e revisão de regra quando aplicável.
- Testar: ABSENT, UNSPECIFIED, fracasso, sucesso, teste pendente, repetição,
  consultas sem rolagem e galeria rejeitada em todos os canais/memórias.
- Isolamento: possível em projeções futuras/versionadas; não reescrever recibos,
  PDFs, regras ou históricos. Não é autorização para começar 5.7.

## Próximo experimento real proposto

Seis turnos, no máximo **12 requisições**: três de conflito REGULAR, duas de
promessa Story Card e uma contraparte WARM com a mesma pergunta do primeiro turno.
Há 6 PROPOSE de até 700 e 6 NARRATE de até 1.200 tokens: teto configurado de
**11.400 tokens de saída**, sem estimar custo ou tokens de entrada por caracteres.
Registrar entrada, saída, total, usageReported, modelo/versão, latência e erros
por tentativa. Confirmar modelo local e política antes de pedir nova autorização.

Os JSONs exatos, campos comparados, fontes/estados, gabaritos separados, limites e
paradas estão no plano congelado. PROPOSE errado não recebe correção nem consome
NARRATE para esconder a falha. Erro crítico, autenticação, 429, cobrança, modelo
inesperado, vazamento ou risco de efeito real interrompem a rodada. Sobra de
orçamento não pode financiar outras tentativas. Fallback seguro continua registrado
como seleção reprovada; nota literária é avaliada separadamente.

São sequências curtas sobre projeções congeladas; não há histórico dinâmico de
respostas reais reinjetado. Assim se mede a seleção atual sem adicionar G4 ao teste.
Persistência, conversa adaptativa longa, resultados mecânicos e toda a campanha
ficam fora dessa amostra. O executor futuro ainda precisa capturar JSON bruto
antes da montagem do grafo e impor orçamento global, além do limite por instância
do roteador; implementar/testar isso em C.1 antes de solicitar autorização.

Nenhuma autorização anterior vale para esse plano. Nenhuma confirmação financeira
permanente, chave, fallback ou modelo foi alterado. Esta fase termina em revisão;
não inicia C.1, G3/G4/G5/G6, 5.7 ou 5.8.
