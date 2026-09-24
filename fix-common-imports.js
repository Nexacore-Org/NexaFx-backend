const fs = require('fs');
const path = require('path');

const srcDir = path.resolve('src');

// Map of wrong import patterns to correct paths (relative to src/)
const FIXES = [
  // UserRole is in users/user.entity.ts
  { wrong: /from ['"](?:\.\.\/)*common\/enums\/user-role\.enum['"]/g, correctSrcPath: 'users/user.entity' },
  // Roles decorator is in auth/decorators/roles.decorator.ts
  { wrong: /from ['"](?:\.\.\/)*common\/decorators\/roles\.decorator['"]/g, correctSrcPath: 'auth/decorators/roles.decorator' },
  // RolesGuard is in auth/guards/roles.guard.ts
  { wrong: /from ['"](?:\.\.\/)*common\/guards\/roles\.guard['"]/g, correctSrcPath: 'auth/guards/roles.guard' },
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.ts')) {
      const fileDir = path.dirname(full);
      let content = fs.readFileSync(full, 'utf8');
      let changed = false;

      for (const { wrong, correctSrcPath } of FIXES) {
        const correctRel = path.relative(fileDir, path.join(srcDir, correctSrcPath)).replace(/\\/g, '/');
        const newContent = content.replace(wrong, (match) => {
          // Only fix if the current import path doesn't resolve to an existing file
          const currentPath = match.match(/from ['"](.+)['"]/)[1];
          const resolved = path.resolve(fileDir, currentPath);
          if (!fs.existsSync(resolved + '.ts') && !fs.existsSync(resolved + '/index.ts')) {
            return `from '${correctRel}'`;
          }
          return match;
        });
        if (newContent !== content) {
          content = newContent;
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(full, content);
        console.log('Fixed: ' + path.relative(srcDir, full));
      }
    }
  }
}

walk('src');
console.log('Done.');
