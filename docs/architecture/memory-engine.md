# Memória persistente

O PostgreSQL local conserva três fontes distintas:

- Estado relacional do motor: personagens, recursos, inventários, mundo e relações.
- Eventos imutáveis confirmados com participantes e visibilidade.
- `character_knowledge`: personagem + evento confirmado + origem + importância.

O chat integral permanece em `session_messages`. Resumos não removem nem substituem
mensagens. O contexto usa só 12 mensagens recentes e até dois resumos anteriores,
com tamanho limitado; a jogadora continua podendo paginar todo o histórico.

Conhecimento de NPC não equivale a memória global. Uma opção de cena bem-sucedida
registra o acontecimento para a protagonista e suas testemunhas preparadas, que
precisam estar presentes e vivas. Falas têm origem HEARD; ações visíveis, WITNESSED.
Ataques confirmados geram memórias para os participantes. THINK e OOC não escrevem
conhecimento. A chave personagem/evento impede duplicidade.

A recuperação traz eventos recentes públicos, memórias pessoais por importância
(90 para conflitos/relações; 50 para outros acontecimentos) e relacionamentos
persistentes. Cada NPC recebe apenas suas próprias associações de conhecimento.
Notas privadas e eventos GM_ONLY são excluídos antes de enviar ao modelo.

Na Fase 5.3, a origem (`source`) acompanha o conhecimento recuperado, preservando
rumores e relatos como tais. Toda memória crítica (importância >= 90) dos personagens
recuperados é mantida; até oito das demais são selecionadas por personagem. Isso
substitui o antigo top-60 global. Story Cards presentes recuperam suas próprias
associações sem top-40 global. Contexto excessivo é recusado, sem apagar fatos.
A mensagem atual não é duplicada no histórico enviado na proposta. Essa montagem não
prova atuação literária de NPCs por um modelo externo.

Não há embeddings, pgvector adicional, LLM para extrair fatos de prosa, exclusão de
eventos antigos nem processo de IA com memória própria. Aprendizado por rumores,
interpretações emocionais livres e descoberta de fatos privados ainda exigem novas
políticas de domínio. Não se deduz percepção apenas porque um fato foi narrado.

## Memória de Gloamhale

`adventure_definitions` conserva o Story Card de referência. `adventure_cast.current_state` guarda mudanças da instância e `adventure_memories` vincula eventos confirmados às identidades nomeadas que os testemunharam. Revisar estado ou memória não sobrescreve o card. Arquétipos não recebem memória pessoal compartilhada.

A adjudicação local exige testemunhas da cena e valida campanha/sessão dos eventos. Companheiros recebem `character_knowledge` somente quando explicitamente presentes ou informados; THINK não cria conhecimento audível. Consequências globais confirmadas por regras, como o banimento de Jaymes e desaparecimento de adversários ao concluir o ritual, atualizam estado sem inventar lembranças individuais.

O contexto recupera apenas cards relevantes e suas próprias lembranças. Chant na gruta é uma cena distinta de Eric e Bamala no sótão; não pode testemunhar o resgate por estar listada no mesmo encontro.

## Fase 5.4 — diálogo livre

Falas da jogadora e réplicas aceitas são eventos `SPEECH_RECORDED` e
`NPC_REPLY_RECORDED`, explicitamente atribuídos. HEARD significa que a fala foi
ouvida, sem certificar a verdade de uma suspeita ou mentira. Usam as associações
existentes, com importância crítica, sem extrair fatos canônicos da prosa.
Mensagem final, evento da réplica e memória são atômicos; retry de NARRATE não
repete a fala da jogadora. OOC/THINK não passam por esse caminho.

O renderer recebe só conhecimento próprio do interlocutor e métricas originadas
nele, sem motivos privados, histórico global ou cartas secretas. O índice de nomes
do planner não duplica as memórias já recuperadas. [Política e limites](../ai/narrative-renderer.md).

## Fase 5.5

Pausar/retomar preserva o mesmo chat; fechamento narrativo abre somente a disponibilidade da próxima unidade. NARRATIVE_FACT_CONFIRMED e NARRATIVE_UNIT_COMPLETED são auditoria privada do Director, sem criar memória pessoal ou descoberta por prosa. As associações oficiais de fala, testemunho e Story Cards permanecem entre unidades. Menções guardam referências públicas na mensagem, sem conceder conhecimento ao NPC mencionado. [Evidências](../testing/phase-5.5-validation.md).

## Fase 5.6.2 — memória da mensagem efetivamente publicada

O servidor registra somente falas recompostas de fragmentos autorizados. Uma fala
crua rejeitada nunca entra no evento ou no conhecimento. A alternativa segura
publicada é uma fala real do NPC no chat e também recebe NPC_REPLY_RECORDED/HEARD.
Citações de RUMOR/HEARD mantêm incerteza e atribuição; repetição não as transforma
em WITNESSED. Mensagem, réplica e conhecimento continuam atômicos e idempotentes.
Nenhuma tabela ou memória anterior foi reescrita. [Publicação](../ai/narrative-renderer.md).
