// Use the already-installed TypeScript compiler, with no native canvas dependency.
const fs = require('node:fs');
const ts = require('../apps/web/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  module._compile(result.outputText, filename);
};
require('../apps/web/lib/project-storage.test.ts');
