import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const source = resolve(__dirname, '../src');
const read = (path: string) => readFileSync(join(source, path), 'utf8');

function sourceFiles(directory: string): string[] {
  return readdirSync(join(source, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') ? [path] : [];
    },
  );
}

function relativeDependencies(path: string) {
  const dependencies: string[] = [];
  const ast = ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node) {
    if (
      ts.isStringLiteral(node) &&
      node.text.startsWith('.') &&
      (ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent) ||
        ts.isExternalModuleReference(node.parent) ||
        ts.isLiteralTypeNode(node.parent) ||
        (ts.isCallExpression(node.parent) &&
          (node.parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
            node.parent.expression.getText(ast) === 'require')))
    ) {
      dependencies.push(
        relative(source, resolve(source, dirname(path), node.text)),
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return dependencies;
}

describe('Adventure boundaries', () => {
  it('keeps Blue Rose independent of every adventure', () => {
    const violations = sourceFiles('blue-rose').flatMap((path) =>
      relativeDependencies(path)
        .filter((target) => target.startsWith('adventures/'))
        .map((target) => `${path} -> ${target}`),
    );
    expect(violations).toEqual([]);
  });

  it('keeps all application consumers independent of adventure content', () => {
    const violations = sourceFiles('')
      .filter(
        (path) =>
          !path.startsWith('adventures/gloamhale/') &&
          path !== 'adventures/adventure-registry.module.ts',
      )
      .flatMap((path) =>
        relativeDependencies(path)
          .filter((target) => target.startsWith('adventures/gloamhale/'))
          .map((target) => `${path} -> ${target}`),
      );
    expect(violations).toEqual([]);
  });

  it('keeps named adventure mechanics out of the shared implementation', () => {
    for (const directory of [
      'blue-rose',
      'adventures/core',
      'game-engine',
      'narrative',
      'sessions',
      'campaigns',
    ])
      for (const file of sourceFiles(directory))
        expect(read(file)).not.toMatch(/Gloamhale|Naelis|Lakesheart|Jaymes/i);

    for (const file of ['graph.py', 'prompts.py'])
      expect(
        readFileSync(
          resolve(source, `../../ai-service/app/narrative/${file}`),
          'utf8',
        ),
      ).not.toMatch(/Gloamhale|Naelis|Lakesheart|Jaymes/);
  });
});
