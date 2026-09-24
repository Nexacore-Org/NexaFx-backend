/* eslint-disable */
// Throwaway diagnostics helper: prints all TS errors in the import graphs of
// the loans + messaging modules so they can be triaged in one pass.
import * as ts from 'typescript';
import * as path from 'path';

const roots = [
  'src/loans/loans.service.ts',
  'src/loans/loans.controller.ts',
  'src/loans/credit-scoring.service.ts',
  'src/messaging/messaging.service.ts',
  'src/messaging/messaging.controller.ts',
  'src/messaging/processors/broadcast.processor.ts',
].map((p) => path.resolve(process.cwd(), p));

const configPath = ts.findConfigFile(
  process.cwd(),
  ts.sys.fileExists,
  'tsconfig.json',
)!;
const parsedConfig = ts.parseJsonConfigFileContent(
  ts.readConfigFile(configPath, ts.sys.readFile).config,
  ts.sys,
  process.cwd(),
);

const program = ts.createProgram(roots, {
  ...parsedConfig.options,
  noEmit: true,
});

const byFile = new Map<string, ts.Diagnostic[]>();
for (const sf of program.getSourceFiles()) {
  if (sf.fileName.includes('node_modules')) continue;
  const diags = [
    ...program.getSyntacticDiagnostics(sf),
    ...program.getSemanticDiagnostics(sf),
  ];
  if (diags.length)
    byFile.set(path.relative(process.cwd(), sf.fileName), diags);
}

for (const [file, diags] of [...byFile.entries()].sort()) {
  console.log(`\n=== ${file} (${diags.length}) ===`);
  for (const d of diags.slice(0, 6)) {
    const pos =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start)
        : undefined;
    console.log(
      `  ${pos ? pos.line + 1 : '?'}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
    );
  }
}
console.log(`\nfiles with errors: ${byFile.size}`);
