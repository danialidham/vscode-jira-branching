const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node16',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  minify: true,
}).catch(() => process.exit(1));
