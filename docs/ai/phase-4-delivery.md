# Entrega da integração do Mestre — 30/10/2026

Foi implementado um recorte seguro da Fase 4. **A fase completa ainda não está
certificada:** diálogo livre, improvisação aberta, marcos globais e avaliação com
provedores reais continuam pendentes. A fronteira de oficialização está implementada
e possui evidência automatizada e verificação de interface.

## Componentes e workflow

NestJS ganhou contexto seletivo, resolução de propostas, ações persistentes,
leases/revisões, retomada de rolagens, memória por personagem, progresso por
evidências, finalização transacional, resumos factuais e métricas.

Python ganhou schemas estritos, prompts permanentes e LangGraph com dois caminhos:
`PROPOSE → interpret_and_propose → END` e
`NARRATE → narrate_confirmed → END`. Os checkpoints de campanha ficam no NestJS;
FastAPI permanece sem acesso de escrita ao PostgreSQL. Não existem processos de IA
independentes, filas ou banco vetorial adicional.

Gemini usa o SDK oficial google-genai. Groq usa httpx compatível com sua API de chat.
Allowlist de modelos com modalidade gratuita, configuração por ambiente, chamadas
limitadas, autenticação interna e fallback opcional apenas para falhas transitórias.
O sistema não configura billing e exige confirmação de conta sem faturamento.
Fontes e limitações financeiras estão em [provedores](providers.md).

## Contexto, memória e Director

São enviados protagonista, personagens presentes, ficha/recursos, condições,
inventário, combate público, mundo público, relações, mensagens recentes, eventos,
memórias pessoais e resumos anteriores. Notas privadas, eventos secretos e
dificuldades ocultas são excluídos antes da chamada. O narrador recebe apenas a
projeção confirmada. O chat completo permanece no banco.

Memória é associada a eventos confirmados. NPCs testemunhas recebem conhecimento
HEARD/WITNESSED, com unicidade personagem/evento. THINK/OOC não propagam conhecimento.
Relações, mundo e memórias atravessam sessões; resumos não substituem eventos.

O Director comprova objetivos por recibos e eventos confirmados. A progressão é
ponderada por objetivos, e a duração não encerra sessões. `finalize` persiste resumo,
conclusão e liberação da próxima sessão em uma transação idempotente. Como não há
LLM na geração de resumo, falhas revertem a finalização sem exigir FINALIZING.

## Blue Rose e endpoints

Não foram alteradas as fórmulas mecânicas ou ampliado o catálogo da Fase 3. A IA
pode selecionar uma opção preparada explicitamente escolhida pela jogadora, observar
sem efeitos ou propor ataque de NPC em encontro aprovado. O motor resolve teste,
acerto, armadura, Vida e dados. Stunts pendentes impedem confirmar ferimento.

Políticas de cena permitem transferir itens existentes, alterar relações já
configuradas e fazer transições de estado com pré-condições. Efeitos dependentes
confirmam juntos. Sem validador, o efeito é recusado. Nunca se encaminham comandos
administrativos brutos do modelo ao motor.

A [lista de endpoints](../architecture/ai-orchestration.md#api-pública) inclui
criação/consulta/retomada de ação, rolagem, adjudicação de Stunts, cancelamento sem
efeitos, SSE de snapshots, estado narrativo, resumo, finalização e uso de IA.
Os OpenAPIs da API e do Python foram exportados. A UI mostra carregamento,
pendências, recuperação, dados, histórico e contadores no desenvolvimento.

## Verificação executada

- Backend: última suíte completa com PostgreSQL descartável, 85 testes aprovados;
  cobertura medida de linhas 94,74% e branches 82,31%.
- Python: 30 testes aprovados com provedores/transportes simulados; cobertura 91%.
- Contratos e web: testes existentes e novos aprovados; tipagem, ESLint, Ruff e mypy
  executados. Exemplo de cena validado pelo schema.
- Builds da API, Python e contratos aprovados. O build de produção Next.js passou
  fora do sandbox; dentro dele, o subprocesso TypeScript retornava saída vazia.
- Navegador: frontend real + NestJS real + PostgreSQL descartável + provedor simulado.
  Verificados escolha explícita, carregamento, espera pelo dado, resultado oficial,
  narração, objetivo comprovado, encerramento, próxima sessão disponível e histórico
  integral com formulário somente leitura.

Falhas intencionais nos testes incluem indisponibilidade após commit, saída inválida,
dependência de efeito inválida, pausa durante geração, repetição e retomada concorrente.
Testes anteriores de auditoria/rollback e persistência continuam na suíte completa.

Não há chaves Gemini/Groq nem confirmação de tier gratuito no ambiente. **Não houve
chamada real a modelos nem consumo externo observado de requisições/tokens.** Os
contadores usados em testes são simulados e não representam uma sessão real.

## Execução, recuperação e próximos passos

As instruções estão no [README](../../README.md#fase-4--mestre-com-oficialização-transacional),
incluindo configuração de token interno, conta gratuita, migrations, `pnpm dev` e
preparação de uma cena pelo exemplo local. Alterações documentais preexistentes
foram preservadas; a migration 0004 é aditiva e não modifica migrations anteriores.
Rollback de binários deve preservar tabelas, mensagens e volumes; não há down
destrutivo automático. Não usar versão antiga para escrever durante turno pendente.

Próximos passos necessários antes de certificar a fase inteira: validar provedores
com conta gratuita; definir validação/revisão de prosa livre para permitir diálogos
naturais; ampliar políticas narrativas sem conceder administração à IA; implementar
marcos globais e planejamento de ritmo mais completo; adicionar acesso local simples
antes de oferecer a instalação a terceiros. Não foram antecipadas ferramentas visuais
de importação/autoria de campanhas ou Story Cards da fase seguinte.
