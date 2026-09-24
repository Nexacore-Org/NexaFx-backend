const fs = require('fs');
const path = require('path');

const srcDir = path.resolve('src');

const WRONG_IMPORTS = [
  { pattern: /from ['"](?:\.\.\/)+users\/user\.entity['"]/g, target: 'users/user.entity' },
  { pattern: /from ['"](?:\.\.\/)+wallets\/entities\/wallet\.entity['"]/g, target: 'wallets/entities/wallet.entity' },
  { pattern: /from ['"](?:\.\.\/)+kyc\/entities\/kyc\.entity['"]/g, target: 'kyc/entities/kyc.entity' },
  { pattern: /from ['"](?:\.\.\/)+notifications\/notifications\.service['"]/g, target: 'notifications/notifications.service' },
  { pattern: /from ['"](?:\.\.\/)+notifications\/entities\/notification\.entity['"]/g, target: 'notifications/entities/notification.entity' },
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

      for (const { pattern, target } of WRONG_IMPORTS) {
        const correctRel = path.relative(fileDir, path.join(srcDir, target)).replace(/\\/g, '/');
        const replacement = `from '${correctRel}'`;
        const newContent = content.replace(pattern, (match) => {
          // Check if the resolved path actually exists to avoid false fixes
          const currentPath = match.match(/from ['"](.+)['"]/)[1];
          const resolved = path.resolve(fileDir, currentPath);
          if (!fs.existsSync(resolved + '.ts') && !fs.existsSync(resolved + '/index.ts')) {
            return replacement;
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
        console.log('Fixed: ' + full);
      }
    }
  }
}

walk('src');
