// Demonstration runner for the import-and-enrich pipeline.
//
// Two modes:
//   pnpm import:pipeline:demo            -> in-memory repo (default)
//   pnpm import:pipeline:demo -- --db    -> Prisma-backed repo (real DB)
//
// In DB mode the script requires the new pipeline tables to exist. If they
// don't, run:
//   pnpm prisma generate
//   pnpm prisma db push
// before re-running with `--db`.

import {
  amazonItemToProductSource,
  brandOfficialToProductSource,
  sephoraImportedToProductSource,
  ultaItemToProductSource
} from './productSourceAdapters.mjs';
import { createInMemoryProductRepo, runImportAndEnrichPipeline } from './productPipeline.mjs';
import { createPrismaProductRepo } from './productPipelinePrismaRepo.mjs';

const SUPERGOOP_INGREDIENTS =
  'Water, Avobenzone, Homosalate, Octisalate, Octocrylene, Glycerin, Butylene Glycol, Phenoxyethanol, Tocopheryl Acetate, Sodium Hyaluronate, Citric Acid';

const ORDINARY_INGREDIENTS =
  'Aqua (Water), Niacinamide, Pentylene Glycol, Zinc PCA, Dimethyl Isosorbide, Tamarindus Indica Seed Gum, Xanthan Gum, Isoceteth-20, Ethoxydiglycol, Phenoxyethanol, Chlorphenesin';

function fakeAmazonSupergoop() {
  return {
    ASIN: 'B07L3QJZQX',
    DetailPageURL: 'https://www.amazon.com/dp/B07L3QJZQX',
    ItemInfo: {
      Title: { DisplayValue: 'Supergoop! Mineral Unseen Sunscreen SPF 40, 1.7 fl oz' },
      ByLineInfo: { Brand: { DisplayValue: 'Supergoop!' } },
      Classifications: { ProductGroup: { DisplayValue: 'Beauty' } },
      Features: { DisplayValues: ['1.7 fl oz / 50 ml', 'Reef-friendly mineral SPF'] }
    },
    Images: { Primary: { Large: { URL: 'https://images.amazon.com/supergoop.jpg' } } },
    Offers: { Listings: [{ Price: { Amount: 38.0, Currency: 'USD' } }] }
  };
}

function fakeSephoraSupergoop() {
  return {
    sourceItemId: '2773299',
    sourceUrl: 'https://www.sephora.com/product/P467091',
    brand: 'Supergoop!',
    name: 'Mineral Unseen Sunscreen SPF 40',
    size: '1.7 oz / 50 ml',
    formulation: 'Sunscreen',
    priceAmount: 40,
    priceCurrency: 'USD',
    imageUrls: ['https://www.sephora.com/productimages/sku/2773299-main.jpg'],
    ingredientsText: SUPERGOOP_INGREDIENTS,
    inciIngredients: SUPERGOOP_INGREDIENTS.split(',').map((s) => s.trim()),
    skinTypes: ['Normal', 'Dry', 'Combination', 'Oily'],
    skincareConcerns: ['Sun Protection'],
    highlights: ['Fragrance Free', 'Reef-Safe'],
    whatItIs: 'A sheer, weightless mineral sunscreen with broad-spectrum SPF 40.'
  };
}

function fakeUltaSupergoop() {
  return {
    skuId: 'pimprod2009176',
    url: 'https://www.ulta.com/p/pimprod2009176',
    brand: 'Supergoop!',
    name: 'Mineral Unseen Sunscreen SPF 40',
    size: '1.7 oz',
    category: 'Sunscreen',
    ingredients: SUPERGOOP_INGREDIENTS,
    price: 40,
    currency: 'USD'
  };
}

function fakeAmazonOrdinary() {
  return {
    ASIN: 'B07PWGJZQX',
    DetailPageURL: 'https://www.amazon.com/dp/B07PWGJZQX',
    ItemInfo: {
      Title: { DisplayValue: 'The Ordinary Niacinamide 10% + Zinc 1% Oil Control Serum 30 ml' },
      ByLineInfo: { Brand: { DisplayValue: 'The Ordinary' } },
      Classifications: { ProductGroup: { DisplayValue: 'Beauty' } },
      Features: { DisplayValues: ['30 ml / 1 fl oz'] }
    },
    Images: { Primary: { Large: { URL: 'https://images.amazon.com/ordinary.jpg' } } },
    Offers: { Listings: [{ Price: { Amount: 6.5, Currency: 'USD' } }] }
  };
}

function fakeBrandOrdinary() {
  return {
    sourceItemId: 'niacinamide-zinc',
    url: 'https://theordinary.com/product/niacinamide-10-zinc-1',
    brand: 'The Ordinary',
    name: 'Niacinamide 10% + Zinc 1% Serum',
    size: '30 ml',
    category: 'serum',
    ingredientsText: ORDINARY_INGREDIENTS,
    priceAmount: 6.5,
    priceCurrency: 'USD'
  };
}

// Lonely Amazon ASIN with no enrichment match - should still get a comparison-
// only Product with an Amazon Offer attached.
function fakeAmazonGenericVitC() {
  return {
    ASIN: 'B0AAAAAAAA',
    DetailPageURL: 'https://www.amazon.com/dp/B0AAAAAAAA',
    ItemInfo: {
      Title: { DisplayValue: 'Generic Vitamin C Serum 30 ml' },
      ByLineInfo: { Brand: { DisplayValue: 'NoNameBrand' } },
      Features: { DisplayValues: ['30 ml'] }
    },
    Images: { Primary: { Large: { URL: 'https://images.amazon.com/generic.jpg' } } },
    Offers: { Listings: [{ Price: { Amount: 12.99, Currency: 'USD' } }] }
  };
}

function parseFlags(argv) {
  return {
    db: argv.includes('--db') || argv.includes('--database')
  };
}

async function buildRepo({ db }) {
  if (!db) return { repo: createInMemoryProductRepo(), mode: 'in-memory', dispose: async () => {} };

  // Lazy-import Prisma so the in-memory mode never spins up a DB connection.
  const { prisma } = await import('./dbStore.mjs');
  const repo = createPrismaProductRepo(prisma);
  // Smoke check: hit the new ProductSource table to confirm migrations are
  // applied. If the table is missing the error is way more useful than the
  // generic "Unknown arg" Prisma throws later in the pipeline.
  try {
    await prisma.productSource.count();
  } catch (error) {
    const message = error?.message ?? String(error);
    if (/does not exist|relation .* does not exist|table.*not found/i.test(message)) {
      throw new Error(
        'ProductSource table is not applied yet. Run:\n' +
          '  pnpm prisma generate\n' +
          '  pnpm prisma db push\n' +
          'and then re-run `pnpm import:pipeline:demo -- --db`.\n' +
          `Underlying error: ${message}`
      );
    }
    throw error;
  }
  return { repo, mode: 'database', dispose: async () => { await prisma.$disconnect(); } };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const { repo, mode, dispose } = await buildRepo(flags);
  console.log(`>> repo mode: ${mode}\n`);

  try {
    console.log('--- Run 1: Supergoop sunscreen with Sephora + Ulta enrichment ---');
    const supergoop = await runImportAndEnrichPipeline({
      amazonSource: amazonItemToProductSource(fakeAmazonSupergoop()),
      candidateSources: [
        sephoraImportedToProductSource(fakeSephoraSupergoop()),
        ultaItemToProductSource(fakeUltaSupergoop())
      ],
      repo
    });
    printPipelineResult('Supergoop! Mineral Unseen Sunscreen SPF 40', supergoop);

    console.log('\n--- Run 2: The Ordinary niacinamide via brand site ---');
    const ordinary = await runImportAndEnrichPipeline({
      amazonSource: amazonItemToProductSource(fakeAmazonOrdinary()),
      candidateSources: [brandOfficialToProductSource(fakeBrandOrdinary())],
      repo
    });
    printPipelineResult('The Ordinary Niacinamide 10% + Zinc 1% Serum', ordinary);

    console.log('\n--- Run 3: Generic vitamin C serum, no enrichment match ---');
    const generic = await runImportAndEnrichPipeline({
      amazonSource: amazonItemToProductSource(fakeAmazonGenericVitC()),
      candidateSources: [
        sephoraImportedToProductSource({
          sourceItemId: '2898419',
          brand: 'rhode',
          name: 'Glazing Milk',
          size: '50 ml',
          ingredientsText: 'Water, Glycerin, Phenoxyethanol'
        })
      ],
      repo
    });
    printPipelineResult('Generic vitamin C serum', generic);

    if (mode === 'in-memory') {
      console.log('\n--- Final repo state (in-memory) ---');
      const state = repo._state();
      console.log(
        JSON.stringify(
          {
            products: state.products.map((p) => ({
              id: p.id,
              slug: p.slug,
              brand: p.canonicalBrand,
              name: p.canonicalName,
              status: p.status,
              recommendationEligible: p.recommendationEligible
            })),
            productSources: state.productSources.length,
            matchCandidates: state.matchCandidates.length,
            offers: state.offers.length,
            ingredients: state.ingredients.length,
            productIngredients: state.productIngredients.length,
            featureSnapshots: state.featureSnapshots.length
          },
          null,
          2
        )
      );
    }
  } finally {
    await dispose();
  }
}

function printPipelineResult(label, result) {
  console.log(`Product: ${label}`);
  console.log(`  product.id              = ${result.product.id}`);
  console.log(`  product.slug            = ${result.product.slug}`);
  console.log(`  status                  = ${result.product.status}`);
  console.log(`  recommendationEligible  = ${result.product.recommendationEligible}`);
  console.log(`  amazonSource.id         = ${result.amazonSource.id}`);
  console.log(
    `  candidate sources       = [${result.candidates
      .map((c) => `${c.candidate.retailer}:#${c.candidate.id}=${c.confidence.toFixed(3)}/${c.decision}`)
      .join(', ')}]`
  );
  console.log(`  topCandidate.decision   = ${result.topCandidate?.decision ?? '-'}`);
  console.log(`  topCandidate.confidence = ${result.topCandidate?.confidence ?? '-'}`);
  console.log(
    `  ingredients             = ${result.ingredients?.persisted ?? 0} (confidence ${
      result.ingredients?.confidence?.toFixed?.(2) ?? '-'
    }, source ${result.ingredients?.chosen ?? '-'})`
  );
  console.log(`  offer.id                = ${result.offer?.id ?? '-'}`);
  console.log(`  offer.url               = ${result.offer?.url ?? '-'}`);
  console.log(`  promotion.warnings      = ${JSON.stringify(result.promotion.warnings)}`);
}

main().catch((err) => {
  console.error('seedProductPipeline failed:', err);
  process.exitCode = 1;
});
