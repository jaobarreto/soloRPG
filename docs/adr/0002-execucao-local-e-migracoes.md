# Compose de desenvolvimento e migrações versionadas pelo Drizzle

Mantemos os quatro serviços em Docker Compose, com volume nomeado para PostgreSQL, imagens de versões fixadas e código montado para hot reload. Migrações SQL geradas/versionadas pelo Drizzle Kit são aplicadas antes da inicialização do NestJS; o banco não depende de scripts de inicialização que só executam em volumes novos.

O Compose principal publica o frontend na LAN e a API em loopback. Um override explícito publica PostgreSQL e FastAPI exclusivamente em `127.0.0.1`, permitindo desenvolvimento no host e diagnóstico em `localhost:8000`; URLs internas usam nomes DNS de serviços e nunca são enviadas ao navegador. O volume sobrevive a `docker compose down`; a opção `-v` remove dados e não é usada pelos scripts normais.
