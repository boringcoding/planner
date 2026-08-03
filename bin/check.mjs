import fs from 'node:fs';
import { check } from '../src/rules.mjs';
import { checkSystems } from '../src/sysrules.mjs';
const read = n => JSON.parse(fs.readFileSync(new URL(`../data/${n}`, import.meta.url)));
const house = read('house.json');
const errs = [
  ...check(house, read('brief.json')),
  ...checkSystems(house, read('systems.json'))
];
if (errs.length) {
  console.log(`Нарушений: ${errs.length}\n`);
  errs.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}
console.log('Правила пройдены без нарушений.');
