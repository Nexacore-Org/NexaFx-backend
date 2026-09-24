const fs = require('fs');
const path = require('path');

function walk(dir, depth) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth + 1);
    } else if (entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes("from '../common/guards/jwt-auth.guard'")) {
        // Compute the correct relative path from this file to src/common/guards/jwt-auth.guard
        const srcDir = path.resolve('src');
        const fileDir = path.dirname(full);
        const rel = path.relative(fileDir, path.join(srcDir, 'common/guards/jwt-auth.guard')).replace(/\\/g, '/');
        const correctImport = `from '${rel}'`;
        const fixed = content.replaceAll("from '../common/guards/jwt-auth.guard'", correctImport);
        if (content !== fixed) {
          fs.writeFileSync(full, fixed);
          console.log(`Fixed: ${full} -> ${rel}`);
        }
      }
    }
  }
}

walk('src', 0);
