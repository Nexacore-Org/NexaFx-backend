const fs = require('fs');
const path = require('path');

const files = [
  'src/modules/support/support.service.ts',
  'src/programmable-payment-rules/programmable-payment-rules.service.ts',
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const fixed = content.replaceAll('NotificationType.SYSTEM', 'NotificationType.MESSAGING');
  if (content !== fixed) {
    fs.writeFileSync(file, fixed);
    console.log('Fixed: ' + file);
  }
}
