# ADR 0005 — Oficialização de ações propostas pela IA

Data: 30/10/2026. Decisão arquitetural aceita; integração do Mestre pendente.

## Contexto

O Game Engine Blue Rose já valida comandos e confirma estado, eventos e recibos
na mesma transação. A integração com FastAPI implementa apenas `/health`; ainda
não há um Mestre gerando respostas de campanha. O fluxo previsto no documento
base permitia gerar narrativa junto com a proposta, antes da resolução mecânica.

Isso permitiria anunciar um ferimento, item ou descoberta que o backend rejeitasse
depois. Pydantic/Zod verificam formato; não demonstram que a ação é permitida nem
que a consequência ocorreu.

## Decisão

**IA propõe → Game Engine valida e resolve → transação confirma estado e eventos
→ IA narra o resultado confirmado.**

Um acontecimento torna-se oficial no commit da transação que registra seus efeitos
e auditoria. O texto da IA não é autoridade para alterar ou reconstruir esse estado.
Criar um pedido de teste confirma apenas o pedido, não seu sucesso. Em um ataque
com Stunts pendentes, a tentativa pode estar registrada enquanto o dano permanece
pendente. O resultado deve distinguir esses estágios.

### Proposta e resolução

- A proposta contém intenções, entidades referenciadas e justificativas. Campanha,
  sessão, identidade da ação e revisão do contexto são vinculadas pelo NestJS.
- Schemas estritos rejeitam campos extras, resultados de dados, dano arbitrário,
  valores finais de recursos e patches genéricos. Validar formato é a primeira etapa.
- Um adaptador no servidor admite somente ações com validadores específicos.
  Nunca encaminhar saída do LLM diretamente a `executeInternal`: essa capacidade
  inclui correções administrativas como `RESOURCE_SET` e `RELATIONSHIP_SET`.
- O motor relê estado e verifica campanha/sessão, participantes, agência da
  protagonista, capacidades, custos, turno, alcance, inventário e regras aplicáveis.
  Dados, modificadores, Defesa e dano vêm do servidor. Contexto narrativo que o
  motor ainda não consegue verificar exige adjudicação; texto plausível não basta.
- Sem suporte de regra ou política de domínio, rejeitar ou aguardar adjudicação
  explícita. Nenhum efeito automático pode depender apenas da confiança do modelo.
- Pedidos de rolagem pública e decisões de Stunts preservam seu estado pendente.
  Não anunciar como resolvidas consequências que ainda dependam dessas escolhas.
- Propostas com efeitos dependentes são validadas e confirmadas juntas, ou divididas
  em etapas explícitas com recibos. Não aplicar silenciosamente parte de um plano
  cuja consequência dependente foi rejeitada.

### Evidências por domínio

| Domínio                   | Validação necessária antes de confirmar                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Vida, condições e combate | Ação legal, teste quando aplicável, custos, proteção e resolução de Stunts; cálculo no motor        |
| Inventário                | Origem autorizada, posse, quantidade, destinatário e capacidade; uma fala não concede item          |
| Relacionamentos           | Métrica configurada, limites e política que vincule a mudança a acontecimentos confirmados          |
| Conhecimento de NPC       | Fato confirmado e evidência de percepção, comunicação ou outra fonte permitida para aquele NPC      |
| Objetivos de sessão       | Critério configurado e evidências em eventos confirmados; sugestão do Director não conclui objetivo |
| Fatos narrativos e mundo  | Referências e precondições válidas, política de criação/alteração e visibilidade autorizada         |

O motor atual não implementa todos esses validadores. Conhecimento individual e
objetivos, por exemplo, continuam requisitos da integração futura. Comandos locais
de administração não substituem políticas para efeitos propostos automaticamente.

### Narração e entrega

Após o commit, o NestJS monta uma projeção autorizada dos eventos e resultados
persistidos. A chamada de narração ocorre fora da transação de banco e não recebe
permissão de escrita. Sua saída contém texto e referências ao resultado, sem ações
ou alterações de estado. Novos fatos com consequências voltam à etapa de proposta.

O backend valida associação com a ação, referências e visibilidade antes de salvar
a mensagem `GAME_MASTER`. A jogadora recebe somente texto persistido. Não transmitir
por SSE tokens de uma narração ainda sem validação como se fossem resultado oficial.
Prompts e schemas não garantem a correção semântica de prosa livre: afirmações
mecânicas devem usar os resultados estruturados do motor e, se a narração contradizê-los
ou sua validação for inconclusiva, usar um resumo determinístico desses resultados
ou manter a resposta pendente. Nunca interpretar a prosa para aplicar efeitos.

Memória, conhecimento e resumos factuais usam eventos confirmados e suas projeções,
respeitando o acesso de cada NPC. Não extrair fatos canônicos de rascunhos, propostas
rejeitadas ou texto contraditório do narrador. A narração pública também não pode
servir para repassar ao NPC informações secretas que ele não percebeu.

### Repetição, concorrência e falhas

- Persistir a identidade da ação e suas etapas. Uma repetição recupera o mesmo
  resultado; conteúdo diferente com a mesma chave gera conflito.
- Revalidar a proposta contra o estado atual sob locks de campanha → sessão.
  Se o contexto ficou obsoleto, rejeitar ou replanejar antes de produzir efeitos.
- Serializar turnos narrativos por campanha, com controle persistido, e vincular
  cada narração à ação e ao resultado correspondentes. Respostas atrasadas não
  podem aparecer como continuação de outra sessão ou ultrapassar turnos posteriores.
- Não manter locks ou transações de banco durante chamadas ao provedor de IA.
- Falha de validação ou auditoria reverte as escritas da etapa transacional.
  Falha de IA após commit preserva os efeitos e permite repetir apenas a narração.
- Mensagem final e conclusão da etapa de narração são persistidas atomicamente,
  com unicidade por ação, antes da entrega. Falha de SSE recupera a mensagem salva.

## Exemplo: Theron ataca Naelis

A IA propõe que Theron tente atacar. O backend verifica se existe encontro válido,
se é o turno dele, se a arma está disponível e se Naelis está ao alcance. Se faltar
contexto aprovado, a tentativa fica rejeitada ou pendente, sem dano.

Em ação válida, o motor resolve o ataque e, quando necessário, aguarda Stunts. Só
depois calcula e persiste o dano. A narração descreve o erro ou acerto confirmado;
não pode afirmar um ferimento profundo se o ataque errou ou a proteção anulou o dano.
Repetir a chamada depois de uma falha de rede não causa outro ataque.

## Critérios de aceite da integração do Mestre

- Ataque inválido, erro e proteção integral não reduzem Vida por sugestão do LLM.
- Ataque com Stunts pendentes não narra dano como confirmado.
- Saída bem formada com campos proibidos, IDs de outra campanha, efeito não
  suportado ou evidência insuficiente falha sem alterações indevidas.
- Narrativa que afirma ganho de item, confiança, conhecimento ou objetivo concluído
  não produz essas alterações; cada domínio exige seu validador e evidência.
- Ação OOC ou pensamento privado não comunica automaticamente fatos aos NPCs.
- Falha de auditoria reverte efeitos; falha de narração após commit não os repete.
- Repetição e concorrência não duplicam dados, dano, eventos ou mensagens finais.
- Pausa, conclusão ou alteração de estado durante a chamada da IA impedem aplicação
  obsoleta; resposta atrasada não é anexada a outra sessão.
- Mensagens e streams não revelam resultados secretos ou propostas rejeitadas.

Estes são testes exigidos para a entrega futura, não resultados de uma suíte já
executada. Esta ADR não implementa provider, endpoints de narração, armazenamento
de ações ou novos validadores. As garantias existentes do motor permanecem descritas
em [Game Engine](../architecture/game-engine.md) e
[Blue Rose Engine](../architecture/blue-rose-engine.md).
