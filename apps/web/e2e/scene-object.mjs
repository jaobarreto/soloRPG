import assert from 'node:assert/strict';
import { test } from 'node:test';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const baseURL = process.env.CAOS_TEST_WEB_URL ?? 'http://127.0.0.1:3300';
const title = 'The Mistress of Gloamhale Manor';
const opening = /As vastas planícies de Zea/;
const examination =
  'A carroça tombada bloqueia a passagem. Os fios mal escondidos atravessam a estrada em frente a ela.';

test(
  'Chromium: examines the road wagon, reloads, and resets the discovery',
  { timeout: 120_000 },
  async () => {
    const browser = await chromium.launch({
      executablePath: process.env.CAOS_TEST_CHROMIUM,
    });
    try {
      const page = await browser.newPage({ baseURL });
      const diary = page.getByRole('region', { name: 'Histórico da sessão' });
      const sidebar = page.getByRole('complementary', {
        name: 'Sessão e companhia',
      });

      async function start() {
        await page
          .getByRole('button', { name: 'Selecionar personagem' })
          .click();
        await page.getByRole('button', { name: 'Confirmar Naelis' }).click();
        await page.getByRole('button', { name: 'Revisar escolhas' }).click();
        await page.getByRole('button', { name: 'Confirmar e iniciar' }).click();
        await diary.getByText(opening).waitFor();
        assert.equal(await diary.locator('ol > li').count(), 1);
        assert.equal(await diary.getByText(/carroça/).count(), 0);
      }

      async function advance() {
        const response = page.waitForResponse(
          (entry) =>
            entry.url().endsWith('/continue') &&
            entry.request().method() === 'POST',
        );
        await page
          .getByRole('button', { name: 'Continuar', exact: true })
          .click();
        assert.equal((await response).status(), 200);
      }

      async function examine(text) {
        await page.getByLabel('Modo de interação').selectOption('ACT');
        await page.getByRole('textbox', { name: 'Mensagem' }).fill(text);
        await page.getByRole('button', { name: 'Enviar', exact: true }).click();
        const entry = diary.locator('li').filter({ hasText: text });
        await entry.getByText(/Aguardando processamento/).waitFor();
        assert.equal(
          await diary.getByText(examination, { exact: true }).count(),
          0,
        );
        await advance();
        await diary.getByText(examination, { exact: true }).waitFor();
      }

      await page.goto('/campaigns');
      await page.getByRole('link', { name: title, exact: true }).click();
      const index = page.getByRole('region', { name: 'Índice de sessões' });
      await index.getByText('Bloqueada — Em preparação').first().waitFor();
      assert.equal(
        await index.getByText('Bloqueada — Em preparação').count(),
        6,
      );
      await page
        .getByRole('button', { name: 'Iniciar sessão', exact: true })
        .click();
      await start();
      await advance();
      await diary
        .getByText(/Na estrada para Lakesheart, uma carroça tombada/)
        .waitFor();
      await examine('Quero examinar essa carroça.');
      await sidebar.getByText('Progresso da sessão: 0%').waitFor();

      await page.reload();
      await diary.getByText(examination, { exact: true }).waitFor();
      assert.equal(
        await diary.getByText(examination, { exact: true }).count(),
        1,
      );
      await page
        .getByRole('button', { name: 'Reiniciar sessão', exact: true })
        .click();
      await page
        .getByRole('dialog', { name: 'Reiniciar esta sessão?' })
        .getByRole('button', { name: 'Apagar progresso e reiniciar' })
        .click();
      await page.waitForURL('**/prepare');
      await start();
      assert.equal(
        await diary.getByText(examination, { exact: true }).count(),
        0,
      );
      await advance();
      await diary
        .getByText(/Na estrada para Lakesheart, uma carroça tombada/)
        .waitFor();
      await examine('Inspeciono a carroça tombada de perto.');
      await sidebar.getByText('Progresso da sessão: 0%').waitFor();
    } finally {
      await browser.close();
    }
  },
);
