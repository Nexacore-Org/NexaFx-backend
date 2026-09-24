const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.includes("from '../auth/guards/jwt-auth.guard'")) {
        const fixed = content.replaceAll("from '../auth/guards/jwt-auth.guard'", "from '../common/guards/jwt-auth.guard'");
        fs.writeFileSync(full, fixed);
        console.log('Fixed: ' + full);
      }
    }
  }
}

walk('src');
