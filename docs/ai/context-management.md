# Contexto do Mestre

NestJS é responsável pela seleção e autorização de contexto. FastAPI não consulta
o banco. `NarrativeContextService.build` recebe campanha/sessão vinculadas à ação.

Inclui premissa, estilo, cena preparada, protagonista e personagens presentes,
recursos, condições e inventários públicos, relações, últimos 20 eventos públicos,
até 60 memórias pessoais ordenadas por importância, 12 mensagens, dois resumos
anteriores (até 4.000 caracteres cada), 20 entidades públicas e 15 regras implementadas.
O histórico recente limita cada texto a 2.000 caracteres apenas no contexto enviado;
a versão integral permanece no banco. Nenhum cache cobrado é usado.

Os rótulos de intenção das opções disponíveis também aparecem na UI para a escolha
explícita da jogadora. São texto público aprovado na preparação local.

Opções de cena são filtradas por pré-requisitos e não revelam efeitos, dificuldade
secreta ou textos futuros ao modelo. Dados privados, NPCs desconhecidos e notas do
operador não entram nesse contexto. O narrador recebe somente o recibo autorizado
do resultado; não recebe sequer o contexto completo do planejador.

O envio é limitado a 65.000 caracteres; excesso causa erro recuperável, sem perder
a mensagem. Seleção semântica ampla e ajuste dinâmico de orçamento são pendências.
Textos enviados a Gemini/Groq deixam a instalação local; usar apenas contas
gratuitas, observando as políticas de dados dos provedores.
