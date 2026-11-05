# Intenções livres e falas atribuídas

Atualização 5.6.2: a permissão experimental de prosa livre abaixo foi substituída
pela [ADR 0011](0011-publicacao-narrativa-por-fragmentos-autorizados.md).
Intenções livres e memória atribuída permanecem; publicação nova exige fragmentos
autorizados pelo servidor. O texto abaixo registra a decisão histórica da 5.4.

01/11/2026. A cópia integral de projeções da Fase 5.3 impedia diálogo espontâneo. A Fase 5.4 mantém a oficialização da ADR 0005 e acrescenta propostas `FREE`, com nomes resolvidos pelo NestJS, e um renderer posterior ao commit com contexto público limitado a um interlocutor. Regras, dificuldades, custos, consentimento e resultados continuam pertencendo ao motor.

Uma **fala atribuída** comprova que alguém disse algo; não comprova a veracidade da alegação. Eventos `SPEECH_RECORDED`/`NPC_REPLY_RECORDED` e conhecimento `HEARD` preservam essa distinção. A réplica aceita e suas associações de memória confirmam na transação da mensagem final; falha de persistência reverte ambas. Não extraímos inventário, relações, descobertas ou objetivos da prosa.

A alternativa de proibir toda variação continua disponível como fallback. Para os turnos livres, aceitamos prosa segmentada com referências, interlocutor autorizado, resultado mecânico literal e guardas lexicais determinísticas. Isso permite linguagem expressiva, mas **não prova toda a semântica do português**: paráfrases podem escapar e frases legítimas podem ser recusadas. A nova política de publicação é um recorte experimental; avaliação real e revisão humana continuam necessárias antes de certificar autonomia. Não se executa um segundo juiz LLM em todo turno.

Sem migration ou alteração de definições de aventuras. Instalar contratos/NestJS antes de Python; para reverter, drenar turnos pendentes e voltar Python antes de NestJS, conservando eventos, chats e tabelas. Não reexecutar mecânicas ao regenerar texto. [Fluxo e limites](../ai/autonomous-master.md).
