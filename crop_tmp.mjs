import fs from 'node:fs';
const { Resvg } = await import('@resvg/resvg-js');
const [file, x, y, w, h, out] = process.argv.slice(2);
let svg = fs.readFileSync(`/home/user/planner/out/${file}.svg`, 'utf8');
svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, background: '#E4E3DC' }).render().asPng();
fs.writeFileSync(out, png);
console.log(out);
