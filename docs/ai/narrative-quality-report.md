# Qualidade narrativa — Fase 5.3

Registro histórico da Fase 5.3. Para a Fase 5.4, consulte a
[avaliação atual](narrative-evaluation.md#resultado-real-e-revisão-técnica).

01/11/2026. **Uma amostra real curta recebeu revisão técnica inicial; qualidade
literária da campanha e consistência em sessões reais permanecem pendentes.** Os testes com LLM simulado
verificam fluxo, contratos e ausência de efeitos indevidos. Não comprovam capacidade
de interpretar português ou improvisar diálogos com qualidade.

## Resultado observado no produto

PROPOSE aceita quatro modos. THINK e OUT_OF_CHARACTER usam OBSERVE determinístico;
ACT/SPEAK podem consultar o provedor quando a cena permite. As onze mensagens de
`test_phase53.py` incluem os quatro exemplos da solicitação, NPC secundário, objeto
inesperado, retorno, recusa, conciliação, pergunta inesperada e desvio temporário.
O fake devolve OBSERVE: isso demonstra preservação do texto/modo e caminho seguro,
**não classificação semântica pelo Gemini**.

NARRATE devolve exatamente a projeção confirmada. Antes, o provedor era chamado
apenas para reproduzir esse texto; divergências eram descartadas. Essa chamada
redundante foi removida. A fronteira pública conservadora da ADR 0005 permanece.
Textos de observação ainda são repetitivos e OOC responde com explicação genérica
do teste básico; não há diálogo livre certificado. Não se atribui esse limite ao
modelo Gemini: ele é imposto pelo produto.

O contexto retém personalidade, motivação, estado, relações e conhecimento individual.
Conflitos críticos não disputam um top-N global, e `source=RUMOR/HEARD/WITNESSED`
é preservado. Um segredo da protagonista não é associado a um NPC sem conhecimento.
Prompts distinguem contexto do Mestre de conhecimento de cada personagem e tratam
relações numéricas como nuances. Isso protege a montagem do contexto; não prova que
um modelo real representará cada NPC corretamente. Memória emocional livre e certeza
graduada além da origem persistida não foram implementadas.

## Amostra real: Gemini 3.5 Flash-Lite

A [resposta preservada](phase-5.3-live-35-result.json) tem 95 palavras, 799 tokens de
entrada e 160 de saída, em 3.427 ms. Foi gerada em cenário sintético curto, fora do
chat oficial, após smoke bem-sucedido. Não se avaliou uma cena completa de Gloamhale.

Revisão inicial pelo agente, sem atribuir aprovação humana:

- Português brasileiro claro, imagens de crepúsculo/chuva e diálogo compreensível.
- Theron mantém cautela e trata os boatos como incertos. Não há falas, pensamentos,
  emoções ou ações voluntárias atribuídas a Naelis, dados ou efeitos inventados.
- Há excesso de gestos de hesitação e voz ainda genérica; o conflito anterior é
  mencionado sem demonstrar uma reação pessoal específica.
- O rumor da janela entra de maneira artificial na pergunta sobre confiar em alguém.
  A proximidade da janela com o banco foi acrescentada sem estar no prompt: o
  rascunho não deve ser promovido a fato oficial. Isso sustenta manter a restrição
  atual de publicação de prosa livre.

Essa amostra comprova obtenção/validação de uma resposta narrativa externa, com
ressalvas de coerência e fundamentação. Não prova interpretação dos onze enunciados,
sete arcanos, segredos adversariais ou continuidade com modelo real.

## Rubrica para revisão humana de respostas reais

Na avaliação humana ampla, pontuar 1–5 por critério (1: viola o critério; 3: atende com ressalvas; 5: atende
consistentemente). Registrar trecho/evidência e falha, sem preencher notas por mocks.

| Critério      | Verificação observável                                        | Estado da avaliação ampla |
| ------------- | ------------------------------------------------------------- | ------------------------- |
| Coerência     | Só usa fatos e incertezas disponíveis; não inventa resultado  | Pendente                  |
| Continuidade  | Local, recursos e conflitos compatíveis com a sessão anterior | Pendente                  |
| Personalidade | NPC mantém voz, motivação e reação gradual ao conflito/ajuda  | Pendente                  |
| Atmosfera     | Fantasia romântica e mistério, sentidos pertinentes           | Pendente                  |
| Clareza       | Português brasileiro natural, diálogo compreensível           | Pendente                  |
| Ritmo         | Uma oportunidade de decisão, sem saltar várias cenas          | Pendente                  |
| Liberdade     | Recusa e desvio aceitos, sem condução forçada                 | Pendente                  |
| Cenário       | Respeita o conteúdo autorizado, sem importar outra edição     | Pendente                  |
| Sistema       | Não inventa TN, dado, dano, cura, item ou conclusão           | Pendente                  |
| Sigilo        | Não vaza spoilers nem transforma rumor em certeza             | Pendente                  |

Violações de agência, sigilo e resultado mecânico são reprovação independentemente
da média. Naelis não recebe fala, pensamento, sentimento interno, escolha voluntária
ou aceitação inventados. Efeito involuntário requer regra/resultado confirmado.
Repetição de frases/perguntas, exposição excessiva e mecânica em toda narração
devem ser registrados como falhas de estilo.

Executar posteriormente os quatro cenários de NPC (conflito, segredo sem
testemunhas, rumor e ajuda a antigo hostil), os onze enunciados livres e duas sessões
reais com orçamento aprovado. O pequeno [experimento preparado](live-model-validation.md)
é uma sondagem inicial, sem certificar toda essa matriz.
