# NestJS como autoridade, FastAPI interno e persistência no PostgreSQL

Conforme o [documento-base](../base-projeto.md), adotamos um monorepo com NestJS como API principal e futuro dono do estado persistente, PostgreSQL local como fonte oficial e FastAPI sem acesso às entidades centrais. O navegador consulta o NestJS por um proxy de mesma origem no Next.js; isso permite acesso doméstico sem publicar o serviço Python ou o banco na LAN e mantém segredos na camada servidora.

Neste bootstrap existem apenas consultas de saúde. A migração inicial habilita `vector`, sem tabelas de domínio, embeddings ou grafos. Não há autenticação nesta etapa, conforme o escopo solicitado; o controle de acesso local previsto no documento-base deverá anteceder endpoints que consultem ou alterem dados de campanha.
