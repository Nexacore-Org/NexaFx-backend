const fs = require('fs');

const content = fs.readFileSync('src/modules/simulator/simulator.service.ts', 'utf8');

// Fix the ExchangeRateSnapshot field names: currency->from, toCurrency->to, createdAt->timestamp
let fixed = content
  .replaceAll('where: { currency, toCurrency }', "where: { from: currency, to: toCurrency }")
  .replaceAll("order: { createdAt: 'DESC' }", "order: { timestamp: 'DESC' }")
  .replaceAll("order: { createdAt: 'ASC' }", "order: { timestamp: 'ASC' }");

fs.writeFileSync('src/modules/simulator/simulator.service.ts', fixed);
console.log('Fixed simulator.service.ts field names');
