import fs from 'node:fs';
let Resvg;
try { ({ Resvg } = await import('@resvg/resvg-js')); }
catch { console.error('Нужен @resvg/resvg-js: npm i'); process.exit(1); }
for (const f of fs.readdirSync('out').filter(n => n.endsWith('.svg'))) {
  const png = new Resvg(fs.readFileSync(`out/${f}`), { fitTo: { mode: 'width', value: 1500 } }).render().asPng();
  fs.writeFileSync(`out/${f.replace('.svg', '.png')}`, png);
  console.log('out/' + f.replace('.svg', '.png'));
}
