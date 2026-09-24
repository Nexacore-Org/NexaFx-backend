const fs = require('fs');
const lines = fs.readFileSync('src/analytics/analytics.service.ts', 'utf8').split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let code = line.replace(/\/\/.*$/, '').replace(/'.*?'/g, "''").replace(/".*?"/g, '""');
  const open = (code.match(/\{/g) || []).length;
  const close = (code.match(/\}/g) || []).length;
  depth += open - close;
  if (depth === 1 && open === 0 && close > 0) {
    console.log(`Method closed at line ${i + 1}`);
  }
}
