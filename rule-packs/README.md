# Rule Packs

Espaço reservado para referências e regras declarativas autorizadas, conforme
[documento-base](../docs/base-projeto.md#8-rule-packs-e-rolagem).
Este diretório não contém implementações executáveis nem livros comerciais.

O primeiro recorte executável está no NestJS (`apps/api/src/blue-rose` e
`game-engine`), exclusivamente Blue Rose AGE 2e (2017). O catálogo relacional é
inserido pelas migrations `0002_game_engine.sql` e `0003_blue_rose_mechanics.sql`; não contém livros nem regras de
outros sistemas. Veja a [matriz de implementação](../docs/rules/blue-rose-implementation.md)
e as [pendências](../docs/rules/blue-rose-pending-rules.md). Referências cadastradas
não concedem efeitos automáticos sem implementação verificada.

Na Fase 5.1, o motor continua concreto no NestJS. Várias aventuras Blue Rose usam
um [registro explícito](../docs/architecture/adventure-engine.md); `rule-packs/`
não se tornou um framework para múltiplos RPGs. Não há migração de código para cá.
