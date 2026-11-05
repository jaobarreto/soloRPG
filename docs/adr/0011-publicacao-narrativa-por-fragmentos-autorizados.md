# ADR 0011 — Publicação narrativa por fragmentos autorizados

Status: aceita e implementada offline na Fase 5.6.2, novembro de 2026.
Substitui a permissão experimental de prosa irrestrita com referências/regex da
[ADR 0007](0007-intencoes-livres-e-falas-atribuidas.md); preserva intenção livre,
resolução oficial e falas atribuídas.

## Problema e decisão

O renderer publicou “Atrás da estante há uma galeria que conduz ao jardim” após
fracasso oficial. Banco, eventos e conhecimento estavam corretos. Os filtros de
palavras e IDs válidos não provavam a fidelidade da frase adicional.

Mantemos os contratos Pydantic/Zod existentes. Beats funcionam como seleção por
correspondência integral com um catálogo de fragmentos autorizado pelo NestJS,
reconstruído antes de persistir. O servidor monta a resposta dos fragmentos
selecionados; texto fora do catálogo é recusado. Não usamos um agente juiz.

Resultados provêm do recibo; descrições provêm da projeção pública; memórias de NPC
só podem ser citadas em fala atribuída com modalidade preservada. Personalidade
seleciona variantes revistas de voz e dúvida. Nenhum rótulo ATMOSPHERE, referência
ou alegação da jogadora autoriza um novo fato material. Não há extração de fatos da
prosa nem mudança do motor, do banco ou das regras Blue Rose.

Falha literária em MECHANIC conserva o resultado. Falha em DIALOGUE escolhe uma
réplica segura, cuja atribuição e memória confirmam junto da mensagem. Metadados
mantêm a recusa: uma substituição segura não demonstra acerto do modelo.

## Consequências e alternativas

A composição conserva descoberta legítima, atmosfera preparada, falas e memória.
Reduzimos expressamente a variedade de prosa e de diálogo. Não há garantia
semântica absoluta de coesão, relevância ou verdade dos dados preparados. Fonte
incorreta ou desatualizada deve ser corrigida na autoria, não por improvisação.

Adicionar sinônimos à regex, exigir factIds ou reforçar apenas o prompt não resolve
a reprodução. Prosa irrestrita só poderá retornar com outra política que demonstre
a fundamentação antes de publicar, com avaliação e autorização próprias.

## Compatibilidade, instalação e recuperação

Sem migration e sem mudança de beats, recibos, IDs ou API pública. `publication`
é informação aditiva dentro de `context.rendering`, que já admite objeto extensível.
Instalar primeiro NestJS corrigido, depois Python com o prompt que seleciona o
catálogo. Python antigo contra API nova continua seguro: prosa fora do catálogo
recebe fallback; a qualidade pode diminuir durante a janela. API antiga com Python
novo ainda possui a vulnerabilidade antiga e não é implantação suficiente.

Rollback seguro de Python mantém o NestJS corrigido e seus fallbacks. Não reverter
esta fronteira da API para o renderer vulnerável; para rollback geral, manter a
correção no artefato anterior ou suspender geração até preparar um artefato seguro.
Não há comando de deploy/rollback do ambiente operacional verificado nesta tarefa;
nenhum foi inventado ou executado. Drenar leases antes de trocar binários, preservar
tabelas/volumes e retomar COMMITTED sem repetir o motor. Não restaurar banco para
regenerar literatura. Históricos existentes permanecem íntegros e não são
certificados retroativamente. [Verificação](../testing/phase-5.6.2-validation.md).
