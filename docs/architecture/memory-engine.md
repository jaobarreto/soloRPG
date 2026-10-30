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

Não há embeddings, pgvector adicional, LLM para extrair fatos de prosa, exclusão de
eventos antigos nem processo de IA com memória própria. Aprendizado por rumores,
interpretações emocionais livres e descoberta de fatos privados ainda exigem novas
políticas de domínio. Não se deduz percepção apenas porque um fato foi narrado.
