# Fronteiras entre infraestrutura e conteúdo

| Responsabilidade                                                  | Dono                       | Limite                                                                  |
| ----------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| Comandos, locks, transações, recibos e auditoria                  | Game Engine                | Não contém nomes, IDs de cenas ou regras da mansão                      |
| Dados AGE, combate, testes, Curar e validação mecânica das fichas | Blue Rose Engine           | Não importa aventuras; nunca assume regras de outro RPG                 |
| Registro, importação, instâncias, cenas e referências             | Adventure Engine           | Usa contrato e módulos registrados, sem importar a definição histórica  |
| NPCs, locais, encontros, relógio da casa, transformação e ritual  | Conteúdo Gloamhale         | Consulta regras oficiais; não as duplica no conteúdo                    |
| Contexto, propostas, resolução e narração                         | Narrative Engine           | Admite capacidades preparadas; o LLM não administra o banco             |
| Objetivos e término                                               | Director e sessões         | Critérios/evidências da instância; sem objetivos fixos no prompt        |
| Conhecimento e continuidade                                       | Memory Engine / PostgreSQL | Eventos confirmados e testemunhas individuais; chat preservado          |
| Esquemas e migrations                                             | Persistência NestJS        | Instâncias separadas de referências; JSONB local opaco; FKs restritivas |

Não houve reorganização estética de pastas: os arquivos específicos existentes continuam legítimos. Foram extraídos o registro/composição, preparação reutilizável de cenas e validação oficial de fichas. `gloamhale-module.ts` encapsula guardas antes dispersas no Game Engine, sessões, combate e Curar; `gloamhale-v2.ts` introduz conteúdo automatizado versionado sem modificar a referência v1. O antigo detector de comandos por prefixo foi removido após não restarem chamadores; schemas estritos do módulo agora fazem essa validação.

## Ferramentas e permissões

| Classe              | Exemplos                                                            | Quem pode usar                                                                    |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Consultas públicas  | histórico, ficha visível, objetivos, resumo                         | Jogadora; projeções sem segredos                                                  |
| Consultas do Mestre | contexto seletivo e `adventure.gm`                                  | NestJS → FastAPI interno; nunca cliente/narração                                  |
| Rolagens            | CHECK_RESOLVE, Curar preparado                                      | Backend; valores do servidor, confirmação da jogadora quando pendente             |
| Comandos mecânicos  | ataques/combate e Curar                                             | Game Engine após regras e precondições                                            |
| Comandos narrativos | opção selecionada, duração, estado do local, próxima cena           | Adaptador restrito a conteúdo preparado e autorizado                              |
| Mecânicas locais    | transformação, relógio, ritual e exceção de Saúde                   | Adaptador local da aventura → Game Engine; tempo preparado pode acionar o relógio |
| Administração       | importar, transcrever, revisar fichas, corrigir recursos, adjudicar | CLI local sem listener HTTP; fora do schema Python                                |

## Adjudicação excepcional

O contexto identifica o encontro, suas fontes e `blockers`. O operador consulta o livro indicado e fornece apenas parâmetros dos comandos locais existentes. ADJUDICATE limita atualizações às identidades da cena e exige evidências da campanha/sessão, testemunhas presentes, justificativa privada e resumo público revisado; arquétipos não recebem memória coletiva. O evento privado guarda páginas e motivo. Efeitos oficiais usam comandos específicos e recibos, sem patches arbitrários do LLM.

Se não há regra/política executável, a ação afetada permanece sem efeito. A jogadora conserva mensagem, intenção e opções de pausa/outro caminho. Cenas especiais ainda não têm decomposição suficiente para todas as ações independentes: atualmente o grafo responde OBSERVE quando o encontro exige adjudicação. Esta é uma limitação explícita da autonomia, não certificação de que a IA pode resolver a cena sozinha.

Gloamhale mantém bloqueio de combate comum até que seus adversários, estados especiais e benefícios estejam modelados. O bloqueio pertence ao módulo, portanto outra aventura pode usar combate comum suportado por Blue Rose. Não remover a guarda para aparentar completude.
