# ADR 0006 — Registro de aventuras Blue Rose e políticas locais

31/10/2026. Blue Rose AGE permanece uma implementação concreta NestJS. Um registro explícito seleciona módulos de aventura por identificador e versão; cada módulo fornece definição, namespace estável, validação da equipe, comandos locais e políticas mecânicas. Game Engine mantém locks, permissões e recibos; as regras oficiais não consultam aventuras. Não haverá carregamento de código externo ou abstração multi-RPG.

Definições imutáveis/versionadas são diferentes de instâncias de campanha. Gloamhale conserva seu ID, versão numérica, namespace de UUIDs e formato de estado anterior; o registro valida estado local antes de executar. IMPORT sem seletor mantém compatibilidade com a CLI anterior. Novas aventuras precisam apenas de conteúdo/políticas, registro na composição e testes, sem alterar Gloamhale, Director ou endpoints.

Autonomia usa capacidades preparadas no conteúdo e evidências persistidas: duração, transições de cena e critérios objetivos não são valores livres do modelo. Critérios subjetivos e regras não implementadas mantêm adjudicação local com fonte, motivo e recibo. Nenhum booleano/confiança do LLM conclui objetivo. Atualizações são aditivas, preservam dados e não iniciam a próxima sessão sem a jogadora.
