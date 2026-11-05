import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? 'playwright'
);
const requireApi = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { Pool } = requireApi('pg');
const baseURL = process.env.CAOS_TEST_WEB_URL ?? 'http://127.0.0.1:3300';
const opening = /As vastas planícies de Zea se estendiam/;
const title = 'The Mistress of Gloamhale Manor';

async function pinPreviousEditorialRevision(campaignId) {
  const connectionString = process.env.CAOS_TEST_E2E_DATABASE_URL;
  const url = new URL(connectionString);
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/caos_reset_e2e_[a-z0-9]+$/);
  assert.equal(url.username, 'test');
  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query(
      "SELECT id, result FROM game_commands WHERE campaign_id = $1 AND result->>'revision' = 'gloamhale-editorial-2'",
      [campaignId],
    );
    assert.equal(rows.length, 1);
    const result = { ...rows[0].result, revision: 'gloamhale-editorial-1' };
    const digest = createHash('sha256')
      .update(JSON.stringify(result))
      .digest('hex');
    await pool.query(
      'UPDATE game_commands SET result = $1, digest = $2 WHERE id = $3',
      [result, digest, rows[0].id],
    );
  } finally {
    await pool.end();
  }
}

test(
  'Chromium: two complete reset paths in the guided library',
  { timeout: 150_000 },
  async (t) => {
    const browser = await chromium.launch({
      executablePath: process.env.CAOS_TEST_CHROMIUM,
    });
    try {
      const page = await browser.newPage({ baseURL });
      const diary = page.getByRole('region', { name: 'Histórico da sessão' });
      const sidebar = page.getByRole('complementary', {
        name: 'Sessão e companhia',
      });
      const dialog = page.getByRole('dialog', {
        name: 'Reiniciar esta sessão?',
      });
      const restart = page.getByRole('button', {
        name: 'Reiniciar sessão',
        exact: true,
      });
      let resetRequests = 0;
      page.on('request', (req) => {
        if (req.method() === 'POST' && req.url().endsWith('/reset'))
          resetRequests++;
      });

      async function chooseParty(companions = []) {
        await page
          .getByRole('button', { name: 'Selecionar personagem' })
          .click();
        await page.getByText('Naelis · Protagonista', { exact: true }).click();
        await page.getByRole('button', { name: 'Confirmar Naelis' }).click();
        for (const name of companions)
          await page.getByRole('checkbox', { name: new RegExp(name) }).check();
        await page.getByRole('button', { name: 'Revisar escolhas' }).click();
        await page.getByRole('button', { name: 'Confirmar e iniciar' }).click();
      }
      async function entries() {
        const path = new URL(page.url()).pathname;
        const response = await page.request.get('/api/v1' + path + '/messages');
        assert.equal(response.status(), 200);
        return (await response.json()).data;
      }
      async function enqueue(mode, content) {
        await page.getByLabel('Modo de interação').selectOption(mode);
        await page.getByRole('textbox', { name: 'Mensagem' }).fill(content);
        await page.getByRole('button', { name: 'Enviar', exact: true }).click();
        await diary.getByText(content, { exact: true }).waitFor();
      }
      async function continuePlay() {
        const result = page.waitForResponse(
          (response) =>
            response.url().endsWith('/continue') &&
            response.request().method() === 'POST',
        );
        await page
          .getByRole('button', { name: 'Continuar', exact: true })
          .click();
        assert.equal((await result).status(), 200);
      }
      async function assertOnlyOpening() {
        await diary.getByText(opening).waitFor();
        await sidebar.getByText('Progresso da sessão: 0%').waitFor();
        assert.equal(await diary.locator('ol > li').count(), 1);
        assert.equal((await entries()).length, 1);
      }
      async function openLibrary() {
        await page.goto('/campaigns');
        await page.getByRole('link', { name: title, exact: true }).click();
        const index = page.getByRole('region', { name: 'Índice de sessões' });
        await index.getByText('Bloqueada — Em preparação').first().waitFor();
        assert.equal(
          await index.getByText('Bloqueada — Em preparação').count(),
          6,
        );
        assert.equal(await index.getByRole('button').count(), 1);
      }

      await t.test(
        'historical opening, cancel, lost response, and authored restart',
        async () => {
          const created = await page.request.post('/api/v1/campaigns/library');
          assert.equal(created.status(), 200);
          const { campaignId, session } = await created.json();
          assert.equal(session.status, 'AVAILABLE');
          await pinPreviousEditorialRevision(campaignId);
          await openLibrary();
          await page
            .getByRole('button', { name: 'Iniciar sessão', exact: true })
            .click();
          await chooseParty();
          await diary.locator('ol > li').first().waitFor();
          const historical = await entries();
          assert.equal(historical.length, 1);
          assert.equal(
            historical[0].metadata.openingRevision,
            'canonical-scene-v1',
          );
          assert.equal(await diary.getByText(opening).count(), 0);

          for (const close of [
            () => dialog.getByRole('button', { name: 'Cancelar' }).click(),
            () => page.keyboard.press('Escape'),
            () => page.keyboard.press('Enter'),
          ]) {
            await restart.click();
            await dialog.waitFor();
            assert.equal(
              await dialog
                .getByRole('button', { name: 'Cancelar' })
                .evaluate(
                  (element) => element.ownerDocument.activeElement === element,
                ),
              true,
            );
            assert.equal(resetRequests, 0);
            await close();
            await dialog.waitFor({ state: 'hidden' });
            assert.deepEqual(await entries(), historical);
          }
          await page.route(
            '**/sessions/*/reset',
            async (route) => {
              assert.equal((await route.fetch()).status(), 200);
              await route.abort('connectionreset');
            },
            { times: 1 },
          );
          await restart.click();
          await dialog
            .getByText('Esta ação não poderá ser desfeita.')
            .waitFor();
          await dialog
            .getByRole('button', { name: 'Apagar progresso e reiniciar' })
            .click();
          await page.waitForURL('**/prepare');
          assert.ok(!page.url().includes(campaignId));
          await chooseParty(['Aren Valdren']);
          await assertOnlyOpening();
          await page.reload();
          await assertOnlyOpening();
          assert.equal(resetRequests, 1);
        },
      );

      await t.test(
        'ordered thought, speech and action, then reset after completion',
        async () => {
          const thought =
            'Naelis sente saudade de sua mãe e teme não estar preparada para esta missão.';
          const speech = 'O que aconteceu?';
          const action = 'Desço do cavalo.';
          await enqueue('THINK', thought);
          await enqueue('SPEAK', speech);
          await enqueue('ACT', action);
          assert.equal(
            await diary.getByText(/Aguardando processamento/).count(),
            3,
          );
          assert.deepEqual(
            (await entries()).map((row) => row.interactionMode),
            [null, 'THINK', 'SPEAK', 'ACT'],
          );
          await page.getByRole('button', { name: 'Pausar sessão' }).click();
          await page.reload();
          await page.getByRole('button', { name: 'Continuar sessão' }).click();
          await diary.getByText(thought, { exact: true }).waitFor();
          assert.equal(
            await diary.getByText(/Aguardando processamento/).count(),
            3,
          );
          await continuePlay();
          await sidebar.getByText('Progresso da sessão: 45%').waitFor();
          assert.equal(await diary.locator('ol > li').count(), 5);
          const grouped = await entries();
          assert.equal(
            grouped.filter((row) => row.role === 'GAME_MASTER').length,
            2,
          );
          assert.equal(grouped.at(-1).metadata.batchContinuation, true);
          assert.match(grouped.at(-1).content, /carroça/i);
          assert.match(grouped.at(-1).content, /desmont/i);
          assert.ok(!grouped.at(-1).content.includes(thought));

          await enqueue('ACT', 'Escolho seguir diretamente ao pântano.');
          await continuePlay();
          await sidebar.getByText('Progresso da sessão: 90%').waitFor();
          await page.getByRole('button', { name: 'Concluir sessão' }).click();
          await sidebar.getByText('Progresso da sessão: 100%').waitFor();
          let finishReset;
          const resetCommitted = new Promise((resolve) => {
            finishReset = resolve;
          });
          let releaseResponse;
          const holdResponse = new Promise((resolve) => {
            releaseResponse = resolve;
          });
          await page.route(
            '**/sessions/*/reset',
            async (route) => {
              assert.equal((await route.fetch()).status(), 200);
              finishReset();
              await holdResponse;
              await route.abort('connectionreset').catch(() => {});
            },
            { times: 1 },
          );
          await restart.click();
          await dialog
            .getByRole('button', { name: 'Apagar progresso e reiniciar' })
            .click();
          await resetCommitted;
          try {
            await page.reload();
            await page.waitForURL('**/prepare');
          } finally {
            releaseResponse();
          }
          await chooseParty();
          await assertOnlyOpening();
          assert.equal(
            await diary.getByText(thought, { exact: true }).count(),
            0,
          );
          await sidebar.getByText('Montarias', { exact: true }).click();
          await sidebar.getByText(/Cavalo de Naelis/).waitFor();
          assert.equal(await sidebar.getByText(/Saúde 45\/45/).count(), 1);
          assert.equal(resetRequests, 2);
          await openLibrary();
        },
      );
    } finally {
      await browser.close();
    }
  },
);
