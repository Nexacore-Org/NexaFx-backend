const ts = require('typescript');
const fs = require('fs');
const file = 'src/analytics/analytics.service.ts';
const source = fs.readFileSync(file, 'utf8');
const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

function printSyntaxErrors(node) {
  if (node.kind === ts.SyntaxKind.JsxElement) return; // skip jsx errors if any
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  
  if (node.flags & ts.NodeFlags.ThisNodeHasError) {
    console.log(`Error at line ${start.line + 1}: ${ts.SyntaxKind[node.kind]}`);
    console.log(source.substring(node.getStart(sourceFile), node.getEnd()));
  }
  ts.forEachChild(node, printSyntaxErrors);
}
printSyntaxErrors(sourceFile);
