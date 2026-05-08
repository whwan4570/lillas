// Cleanup helper: remove Catalog Products that have only Sephora ProductSources
// (created by the legacy auto-bridge). Sephora ProductSource rows are KEPT and
// unlinked from the deleted Products so the Amazon-first pipeline can still
// use them as enrichment candidates.
//
// Cascade rules:
//   - Offer, ProductIngredient, ProductFeatureSnapshot all cascade on Product
//     deletion (see prisma/schema.prisma).
//   - ProductMatchCandidate only references ProductSource rows (not Product),
//     so it is unaffected.
//   - ProductSource.productId is nullable with no cascade, so we explicitly
//     null it out before deleting the parent Product.
//
// Usage:
//   node scripts/cleanupSephoraOnlyProducts.mjs           # dry run
//   node scripts/cleanupSephoraOnlyProducts.mjs --apply   # actually delete

import { prisma } from '../server/dbStore.mjs';

const apply = process.argv.includes('--apply');

const candidates = await prisma.product.findMany({
  include: {
    sources: { select: { id: true, retailer: true } },
    offers: { select: { id: true, retailer: true } },
    ingredients: { select: { id: true } }
  },
  orderBy: { id: 'asc' }
});

const sephoraOnly = candidates.filter((p) => {
  if (p.sources.length === 0) return false;
  return p.sources.every((s) => s.retailer === 'sephora');
});

console.log(`Found ${sephoraOnly.length} Sephora-only Products to clean up.`);
for (const p of sephoraOnly) {
  console.log(
    `  product#${p.id} ${p.canonicalBrand || '?'} - ${p.canonicalName || '?'} ` +
      `[status=${p.status}, sources=${p.sources.length}, offers=${p.offers.length}, ingredients=${p.ingredients.length}]`
  );
}

if (!apply) {
  console.log('\nDry run only. Re-run with `--apply` to actually delete.');
  await prisma.$disconnect();
  process.exit(0);
}

let deleted = 0;
let unlinkedSources = 0;
for (const p of sephoraOnly) {
  await prisma.$transaction(async (tx) => {
    const sourceIds = p.sources.map((s) => s.id);
    if (sourceIds.length) {
      const result = await tx.productSource.updateMany({
        where: { id: { in: sourceIds } },
        data: { productId: null }
      });
      unlinkedSources += result.count;
    }
    await tx.product.delete({ where: { id: p.id } });
  });
  deleted += 1;
  console.log(`  deleted product#${p.id}`);
}

console.log(`\nDone. deleted=${deleted}, unlinkedSources=${unlinkedSources}`);
await prisma.$disconnect();
