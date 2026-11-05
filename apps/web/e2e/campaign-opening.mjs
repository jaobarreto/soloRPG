import assert from 'node:assert/strict';
import { test } from 'node:test';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const baseURL = process.env.CAOS_TEST_WEB_URL ?? 'http://127.0.0.1:3300';
const opening = /As vastas planícies de Zea se estendiam/;
const title = 'The Mistress of Gloamhale Manor';
const companions = ['Aren Valdren', 'Mira Selwyn', 'Lys Varen'];
const count = Number(process.env.CAOS_TEST_COMPANIONS ?? '0');

test(
  `opens and resumes a guided campaign with ${count} companions`,
  { timeout: 120_000 },
  async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CAOS_TEST_CHROMIUM,
    });
    try {
      const page = await browser.newPage({ baseURL });
      await page.goto('/campaigns');
      await page.getByRole('link', { name: title, exact: true }).waitFor();
      assert.equal(
        await page.getByRole('link', { name: /Criar campanha/i }).count(),
        0,
      );
      assert.equal(await page.getByRole('article').count(), 1);
      await page.getByRole('link', { name: title, exact: true }).click();
      for (const text of ['Blue Rose', 'Fantasia e Mistério', '1–4', 'Una'])
        await page.getByText(text, { exact: true }).waitFor();
      const index = page.getByRole('region', { name: 'Índice de sessões' });
      await index
        .getByRole('heading', {
          name: 'Sessão I — Os desaparecimentos de Lakesheart',
          exact: true,
        })
        .waitFor();
      assert.equal(await index.getByRole('article').count(), 1);
      assert.equal(
        await index
          .getByText('Bloqueada — Em preparação', { exact: true })
          .count(),
        6,
      );
      assert.equal(await index.getByRole('button').count(), 1);
      await page
        .getByRole('button', { name: 'Iniciar sessão', exact: true })
        .click();
      const create = page.getByRole('button', { name: 'Criar personagem' });
      await create.waitFor();
      assert.equal(await create.isDisabled(), true);
      await page.getByRole('button', { name: 'Selecionar personagem' }).click();
      await page.getByText('Naelis · Protagonista', { exact: true }).click();
      await page.getByText("Vata'an · Adepta · Nível 1").waitFor();
      await page.getByText('Saúde 23 / 23', { exact: true }).waitFor();
      await page
        .getByText('Cajado artesanal de Ahri · 1 · em uso', { exact: true })
        .waitFor();
      await page.getByText('Arcanos', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Confirmar Naelis' }).click();
      await page
        .getByRole('heading', { name: 'Selecionar companheiros' })
        .waitFor();
      assert.equal(await page.getByRole('checkbox').count(), 3);
      assert.equal(await page.getByText('Arcanos', { exact: true }).count(), 0);
      assert.equal(
        await page.getByText(/incidente da passagem|Edran Varen/i).count(),
        0,
      );
      for (const name of companions.slice(0, count))
        await page.getByRole('checkbox', { name: new RegExp(name) }).check();
      await page.getByRole('button', { name: 'Revisar escolhas' }).click();
      await page.getByRole('heading', { name: 'Confirmar escolhas' }).waitFor();
      if (!count)
        await page.getByText('Naelis viaja sozinha', { exact: true }).waitFor();
      if (count === 2) {
        await page.route(
          '**/sessions/*/start',
          async (route) => {
            assert.equal((await route.fetch()).status(), 200);
            await route.abort('connectionreset');
          },
          { times: 1 },
        );
      }
      await page.getByRole('button', { name: 'Confirmar e iniciar' }).click();

      const history = page.getByRole('region', { name: 'Histórico da sessão' });
      const sidebar = page.getByRole('complementary', {
        name: 'Sessão e companhia',
      });
      await history.getByText(opening).waitFor();
      await sidebar.getByText('Progresso da sessão: 0%').waitFor();
      for (const [position, name] of companions.entries())
        assert.equal(
          await sidebar.getByText(name, { exact: true }).count(),
          position < count ? 1 : 0,
        );
      const playURL = page.url();
      const mentionsPath = '/api/v1' + new URL(playURL).pathname + '/mentions';
      for (const [position, name] of companions.entries()) {
        const response = await page.request.get(mentionsPath, {
          params: { symbol: '@', q: name.split(' ')[0] },
        });
        assert.equal(response.status(), 200);
        const { data } = await response.json();
        assert.equal(
          data.some(
            (item) => item.label === name && item.availability === 'PRESENT',
          ),
          position < count,
        );
        if (position >= count)
          assert.equal(
            data.some((item) => item.label === name),
            false,
          );
      }
      assert.equal(await history.getByText(opening).count(), 1);
      assert.equal(await history.getByText(/^Protagonista/).count(), 0);

      assert.equal(
        await page.getByLabel('Tentativa autorizada nesta cena').count(),
        0,
      );
      assert.equal(
        await page.getByLabel('Modo de interação').locator('option').count(),
        6,
      );
      await sidebar.getByText('Montarias', { exact: true }).click();
      assert.equal(await sidebar.getByText(/Saúde 45\/45/).count(), count + 1);

      async function enqueue(mode, content) {
        await page.getByLabel('Modo de interação').selectOption(mode);
        await page.getByRole('textbox', { name: 'Mensagem' }).fill(content);
        await page.getByRole('button', { name: 'Enviar', exact: true }).click();
        await history.getByText(content, { exact: true }).waitFor();
        await page.getByRole('textbox', { name: 'Mensagem' }).isEnabled();
      }

      async function advance(expectedProgress) {
        const done = page.waitForResponse(
          (response) =>
            response.url().endsWith('/continue') &&
            response.request().method() === 'POST',
        );
        await page
          .getByRole('button', { name: 'Continuar', exact: true })
          .click();
        assert.equal((await done).status(), 200);
        await sidebar
          .getByText(`Progresso da sessão: ${expectedProgress}%`)
          .waitFor();
        await history
          .getByText(/Aguardando processamento/)
          .first()
          .waitFor({ state: 'hidden' });
      }

      async function turn(mode, option, content, expectedProgress) {
        await enqueue(mode, content);
        await advance(expectedProgress);
      }

      await enqueue('THINK', 'Sinto saudade de casa.');
      await enqueue('OUT_OF_CHARACTER', 'Como funciona um teste?');
      await enqueue('SPEAK', 'O que aconteceu?');
      assert.equal(
        await history.getByText(/Aguardando processamento/).count(),
        3,
      );
      assert.equal(
        await history
          .getByText(/Na estrada para Lakesheart, uma carroça/)
          .count(),
        0,
      );
      await page.reload();
      await history
        .getByText('Sinto saudade de casa.', { exact: true })
        .waitFor();
      await advance(45);
      if (count === 0) {
        await turn(
          'ACT',
          'Seguir diretamente ao pântano',
          'Escolho seguir diretamente ao pântano.',
          90,
        );
      } else if (count === 3) {
        await turn(
          'ACT',
          'Seguir para Lakesheart',
          'Sigo para Lakesheart.',
          45,
        );
        await turn(
          'ACT',
          'Decidir investigar os desaparecimentos',
          'Decido investigar os desaparecimentos.',
          90,
        );
      }
      const completes = count === 0 || count === 3;
      if (completes) {
        await page.getByRole('button', { name: 'Concluir sessão' }).click();
        await sidebar.getByText('Progresso da sessão: 100%').waitFor();
      }
      if (!completes) {
        await page.getByRole('button', { name: 'Pausar sessão' }).click();
        await sidebar.getByText('Pausada', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Continuar sessão' }).click();
        await sidebar.getByText('Em andamento', { exact: true }).waitFor();
        await sidebar.getByText('Progresso da sessão: 45%').waitFor();
      }
      await page.reload();
      await sidebar
        .getByText(`Progresso da sessão: ${completes ? 100 : 45}%`)
        .waitFor();
      await history.getByText(opening).first().waitFor();
      await page.goto('/campaigns');
      await page.getByRole('link', { name: title, exact: true }).click();
      await index
        .getByText('Bloqueada — Em preparação', { exact: true })
        .first()
        .waitFor();
      assert.equal(
        await index
          .getByText('Bloqueada — Em preparação', { exact: true })
          .count(),
        6,
      );
      if (completes)
        await page
          .getByText(
            'Sessão I concluída. As próximas sessões estão em preparação.',
          )
          .waitFor();
      const resume = page.getByRole('button', {
        name: completes ? 'Ler histórico' : 'Continuar sessão',
      });
      await resume.click();
      await history.getByText(opening).first().waitFor();
      assert.equal(page.url(), playURL);
      assert.equal(
        await page
          .getByRole('button', { name: 'Selecionar personagem' })
          .count(),
        0,
      );
    } finally {
      await browser.close();
    }
  },
);
