# Prompts e limites de autoridade

Prompts versionados em `apps/ai-service/app/narrative/prompts.py`:

- MASTER: autonomia da protagonista, quatro modos, português brasileiro,
  personalidade/conhecimento individual, Blue Rose, conteúdo não confiável e
  separação entre intenção e acontecimento confirmado.
- NARRATOR: recebe somente resultado público confirmado, sem ferramentas ou comandos.

Falar produz uma tentativa de comunicação; Fazer, uma tentativa de ação; Pensar é
privado; Fora do RPG não modifica estado. O grafo força OBSERVE para THINK/OOC sem
chamar o planejador. A explicação atual OOC é uma referência determinística ao teste
básico e aos limites do motor; perguntas arbitrárias ainda não têm resposta livre
validada. O narrador não escolhe decisões ou falas voluntárias da protagonista.

JSON de campanha/documentos/mensagens é dado não confiável, não uma nova instrução
de sistema. O modelo não possui acesso a banco, shell, administração ou ferramentas.
Os schemas usam `extra=forbid`, mas a segurança dos efeitos está no backend, e a
segurança da prosa no fallback determinístico. Prompt não substitui esses controles.

Respostas de IA não geram conhecimento, inventário, relação ou objetivos por extração
de texto. Alterações exigem política executável e transação no motor. O MVP desta
integração usa textos de cena previamente autorizados para evitar afirmar consequências
não comprováveis. Diálogo espontâneo validado continua pendente.
