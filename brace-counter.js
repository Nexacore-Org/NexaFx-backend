const fs = require('fs');
const lines = fs.readFileSync('src/analytics/analytics.service.ts', 'utf8').split('\n');

let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Ignore braces in comments or strings for simplicity (assuming simple code)
  let code = line.replace(/\/\/.*$/, '').replace(/'.*?'/g, '').replace(/".*?"/g, '').replace(/`.*?`/g, '');
  
  const open = (code.match(/\{/g) || []).length;
  const close = (code.match(/\}/g) || []).length;
  
  if (open > 0 || close > 0) {
    depth += open - close;
    if (depth < 0) {
      console.log(`Depth dropped below 0 at line ${i + 1}: ${line}`);
      break;
    }
    if (depth === 0 && i > 100) {
      console.log(`Class closed at line ${i + 1}`);
    }
  }
}
