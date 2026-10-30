#!/usr/bin/env node
// Create a review list for Anna from the generated catalogue; this is not part of the build.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const dataPath = resolve(root, 'assets/data.js');
const reportPath = resolve(root, 'reports/catalogue-warnings.md');
const sandbox = { window: {} };
vm.runInNewContext(await readFile(dataPath, 'utf8'), sandbox, { filename: dataPath });
const products = sandbox.window.CM?.all || [];
const nameOf = p => String(p.t || p.h || 'Unnamed product');
const imagesOf = p => (Array.isArray(p.img) ? p.img : []).filter(Boolean);

// Shared lead photos are strongest signals; repeated gallery photos also catch a copied gallery.
const photoGroups = new Map();
for (const p of products) {
  for (const photo of new Set(imagesOf(p))) {
    if (!photoGroups.has(photo)) photoGroups.set(photo, []);
    photoGroups.get(photo).push(p);
  }
}
const photoMatches = new Map();
for (const [photo, group] of photoGroups) for (const p of group) for (const other of group) {
  if (p === other || nameOf(p) === nameOf(other)) continue;
  if (!photoMatches.has(p)) photoMatches.set(p, new Map());
  const photos = photoMatches.get(p).get(other) || new Set();
  photos.add(photo);
  photoMatches.get(p).set(other, photos);
}
const shared = [...photoMatches].flatMap(([product, matches]) => {
  const lead = imagesOf(product)[0];
  const others = [...matches].filter(([other, photos]) => photos.has(lead))   // the card and page lead with this photo; shared detail shots are normal
    .map(([other, photos]) => ({ other, count: photos.size, lead: photos.has(lead) }));
  return others.length ? [{ product, others }] : [];
});
const missingComposition = products.filter(p => !String(p.comp || '').trim());
const onePhoto = products.filter(p => imagesOf(p).length === 1);
const list = rows => rows.length ? rows.map(row => `- **${nameOf(row.product || row)}**${row.product ? ` — ${row.others.map(({ other, count, lead }) => `${nameOf(other)} (${lead ? 'same lead photo' : `${count} gallery photos shared`})`).join('; ')}` : ''}`).join('\n') : '- None found.';

const markdown = `# Catalogue warnings\n\nGenerated from \`assets/data.js\` for Anna to review. These are flags for checking the source catalogue, not automatic corrections.\n\n## Main photo shared with another colour (${shared.length})\n\n${list(shared)}\n\n## Composition not supplied (${missingComposition.length})\n\n${list(missingComposition)}\n\n## One photo only (${onePhoto.length})\n\n${list(onePhoto)}\n`;
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, markdown);
console.log(`Wrote ${reportPath}: ${shared.length} shared-photo entries, ${missingComposition.length} missing compositions, ${onePhoto.length} one-photo entries.`);
