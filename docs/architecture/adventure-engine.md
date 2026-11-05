# Adventure Engine

Blue Rose AGE permanece o único motor de regras, concreto no NestJS. O registro permite várias aventuras sobre a mesma infraestrutura de campanhas, sessões, eventos, memória e narrativa. [Decisão](../adr/0006-aventuras-blue-rose-e-politicas-locais.md), [auditoria](architecture-audit-5.1.md).

## Registro e responsabilidades

`registry.ts` valida módulos explícitos por `definition.id` + versão inteira positiva. Não há descoberta de arquivos, importação de código externo ou framework de plugins. O módulo Nest `adventure-registry.module.ts` é o ponto de composição. Registra Gloamhale v1 e v2; a segunda aventura original existe apenas em `test/fixtures/adventure.ts`.

Cada módulo fornece definição validada, namespace de entidades e, quando necessário, schema/executor de comandos locais, guardas mecânicas, eventos públicos, metadados de finais e duração dos comandos locais. Só são necessários os hooks usados pela aventura. A definição é copiada na entrada do registro para evitar mutação pelo chamador. Um módulo com comandos exige schema e executor juntos.

`AdventureService` seleciona a versão, importa a definição imutável/digest, instancia campanhas em rascunho, conserva recibos e faz operações locais de preparação/revisão. `execution.ts` prepara planos a partir do conteúdo e respeita as testemunhas presentes. `state.ts` recupera contexto, memória e objetivos da instância, sem importar conteúdo de Gloamhale. O importador não depende de suas fichas ou definição.

Game Engine mantém a autoridade: comandos específicos passam por `executeAdventureLocalInTransaction`, com campanha/sessão ativas, validação da implementação, bloqueio de ações pendentes e combate. Efeitos, eventos, mensagem e recibo compartilham a transação do adaptador local. O caminho narrativo não recebe essa capacidade. Escolhas explícitas conservam a validação de opções; intenções FREE da Fase 5.4 passam pelo resolvedor de nomes/capacidades antes de construir comandos da allowlist. Dificuldades, transições e efeitos de aventura continuam vindo de políticas preparadas.

## Definição, instância e versão

`adventure_definitions` guarda `${id}:v${version}`, digest e referência. A mesma versão com outro conteúdo é rejeitada; uma nova versão cria outra referência. `adventure_instances` guarda campanha, referência, protagonista, revisão, namespace, tempo e estado mecânico opaco. Cast, cenas, memória e histórico pertencem à campanha. O codec do módulo valida seu JSONB antes da execução.

IMPORT sem seletor continua apontando para `six-of-swords-gloamhale:v1`, por compatibilidade. Um novo rascunho pode selecionar v2:

```json
{
  "operation": "IMPORT",
  "campaignId": "<UUID do rascunho novo>",
  "commandId": "<UUID estável para repetição>",
  "adventureId": "six-of-swords-gloamhale",
  "version": 2
}
```

Importações repetidas não reinicializam uma campanha iniciada. Trocar a versão de uma instância existente é recusado; não há upgrade automático de campanha. Migrations anteriores não foram alteradas. A migration 0007 adiciona namespace e minutos narrativos; preenche somente o namespace histórico das instâncias v1, conservando seus UUIDs e o JSONB mecânico.

## Capacidades narrativas preparadas

Uma opção pode definir duração em minutos inteiros, próxima cena, transição de estado do local e `CURE_SELF`. Esses dados vêm da definição/local de preparação, nunca do payload da jogadora ou do LLM. A proposta continua sendo OBSERVE, SCENE ou ATTACK. OOC/THINK não executam opções nem avançam tempo.

O motor resolve teste e efeitos, registra duração uma vez e prepara a próxima cena na mesma transação do recibo narrativo. Falha em qualquer etapa reverte o conjunto. Curar usa conhecimento, talento, teste, recuperação e fadiga oficiais; sua narração reflete o sucesso registrado. Não é uma ferramenta para inventar arcanos.

`completionEvidence` associa o objetivo do capítulo a opções por cena/chave. Conclusão exige recibos bem-sucedidos COMMITTED/COMPLETED e eventos públicos confirmados da mesma campanha e sessão. Confiança, texto do modelo, tempo e quantidade de mensagens não servem como evidência. Critérios subjetivos continuam usando REVIEW_SESSION humano. Finalizar nunca inicia o próximo chat.

## Adicionar outra aventura

1. Estruturar referência, Story Cards, locais, encontros, cenas, objetivos e fontes no schema existente.
2. Identificar o que já usa Blue Rose e o que exige mecânica local. Bloquear explicitamente regras não suportadas.
3. Criar um módulo com namespace estável e apenas os hooks necessários.
4. Registrar o módulo na composição. Não editar Gloamhale, Director, Blue Rose ou criar outra API.
5. Testar referências inválidas, importação repetida, versões, isolamento, comandos/evidências, segredos e continuidade em PostgreSQL descartável.

Nenhum serviço pago ou dependência nova foi adicionado. `rule-packs/` permanece para referências declarativas autorizadas; o código de regras continua em `blue-rose/`.

## Fase 5.5

Novas definições podem declarar progression (fatos, objetivos, marcos e condições). O avaliador genérico não conhece Gloamhale. Importação transacional foi extraída para adventures/import.ts e reutilizada pela criação pública, sem ciclo de injeção com o motor. O padrão público é v3; o alias histórico de IMPORT conserva v1. [Director](campaign-director.md), [compatibilidade](../adr/0008-sessoes-narrativas-e-progresso-confirmado.md).
