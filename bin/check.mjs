import fs from 'node:fs';
import { check } from '../src/rules.mjs';
const house = JSON.parse(fs.readFileSync(new URL('../data/house.json', import.meta.url)));
const errs = check(house);
if (errs.length) {
  console.log(`Нарушений: ${errs.length}\n`);
  errs.forEach((e, i) => console.log(`${String(i + 1).padStart(2)}. ${e}`));
  process.exit(1);
}
console.log('Правила пройдены без нарушений.');
