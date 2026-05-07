import {
  finishPipelineRun,
  listImportedProducts,
  prisma,
  startPipelineRun
} from './dbStore.mjs';
import { runImportAndEnrichPipeline } from './productPipeline.mjs';
import { createPrismaProductRepo } from './productPipelinePrismaRepo.mjs';
import { sephoraImportedToProductSource } from './productSourceAdapters.mjs';

const pipelineRepo = createPrismaProductRepo(prisma);

function normalizeLooseText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function safeParseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function materializeProductSourceFromDbRow(row) {
  return {
    id: row.id,
    retailer: row.retailer,
    sourceItemId: row.sourceItemId,
    sourceUrl: row.sourceUrl,
    productId: row.productId,
    brand: row.brand,
    name: row.name,
    category: row.category,
    sizeRaw: row.sizeRaw,
    sizeMl: row.sizeMl,
    sizeOz: row.sizeOz,
    imageUrl: row.imageUrl,
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency,
    ingredientsText: row.ingredientsText,
    inciIngredients: safeParseJson(row.inciIngredientsJson, []),
    rawJson: safeParseJson(row.rawJson, {}),
    fetchedAt: row.fetchedAt,
    schemaVersion: row.schemaVersion
  };
}

export async function discoverCandidateSources(amazonSource, limit = 60) {
  const maxCandidates = Math.max(1, Math.min(300, Number(limit) || 60));
  const out = [];
  const seen = new Set();
  const addCandidate = (candidate) => {
    const key = `${candidate.retailer}:${candidate.sourceItemId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  const retailerRows = await prisma.productSource.findMany({
    where: {
      retailer: { in: ['sephora', 'ulta', 'brand_official'] },
      ...(amazonSource.brand
        ? { brand: { contains: amazonSource.brand, mode: 'insensitive' } }
        : {})
    },
    orderBy: { updatedAt: 'desc' },
    take: maxCandidates
  });
  for (const row of retailerRows) {
    addCandidate(materializeProductSourceFromDbRow(row));
  }

  const imported = await listImportedProducts(maxCandidates * 2);
  const amazonBrand = normalizeLooseText(amazonSource.brand);
  const amazonName = normalizeLooseText(amazonSource.name);
  for (const row of imported) {
    if (row.source !== 'sephora') continue;
    if (out.length >= maxCandidates) break;
    const brand = normalizeLooseText(row.brand);
    const name = normalizeLooseText(row.name);
    if (amazonBrand && brand && !brand.includes(amazonBrand) && !amazonBrand.includes(brand)) continue;
    if (amazonName && name && !amazonName.split(' ').some((token) => token.length >= 4 && name.includes(token))) {
      continue;
    }
    addCandidate(sephoraImportedToProductSource(row));
  }

  return out.slice(0, maxCandidates);
}

export function toPipelineResultDto(result) {
  return {
    product: {
      id: result.product?.id ?? null,
      slug: result.product?.slug ?? null,
      status: result.product?.status ?? null,
      recommendationEligible: Boolean(result.product?.recommendationEligible)
    },
    amazonSourceId: result.amazonSource?.id ?? null,
    topCandidate: result.topCandidate
      ? {
          retailer: result.topCandidate.candidate?.retailer ?? null,
          sourceItemId: result.topCandidate.candidate?.sourceItemId ?? null,
          confidence: result.topCandidate.confidence,
          decision: result.topCandidate.decision,
          reasons: result.topCandidate.reasons,
          warnings: result.topCandidate.warnings
        }
      : null,
    candidateCount: result.candidates.length,
    ingredients: result.ingredients
      ? {
          persisted: result.ingredients.persisted,
          confidence: result.ingredients.confidence,
          source: result.ingredients.chosen
        }
      : null,
    offer: result.offer
      ? {
          id: result.offer.id,
          retailer: result.offer.retailer,
          sourceItemId: result.offer.sourceItemId,
          url: result.offer.url,
          priceAmount: result.offer.priceAmount,
          priceCurrency: result.offer.priceCurrency
        }
      : null,
    promotion: result.promotion
  };
}

export async function reprocessAmazonSources({
  limit = 25,
  statuses = ['comparison_only'],
  autoDiscoverCandidates = true,
  candidateLimit = 60,
  trigger = 'manual',
  logger = console
} = {}) {
  const pipelineRun = await startPipelineRun({ trigger, statuses });
  try {
    const amazonRows = await prisma.productSource.findMany({
      where: {
        retailer: 'amazon',
        product: { is: { status: { in: statuses } } }
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(200, Number(limit) || 25))
    });

    const items = [];
    for (const row of amazonRows) {
      const amazonSource = materializeProductSourceFromDbRow(row);
      try {
        const discovered = autoDiscoverCandidates
          ? await discoverCandidateSources(amazonSource, candidateLimit)
          : [];
        const result = await runImportAndEnrichPipeline({
          amazonSource,
          candidateSources: discovered,
          repo: pipelineRepo
        });
        items.push({
          amazonSourceId: amazonSource.id,
          amazonSourceItemId: amazonSource.sourceItemId,
          ok: true,
          result: toPipelineResultDto(result)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn?.(
          `[pipeline-reprocess] failed amazonSourceId=${amazonSource.id} sourceItemId=${amazonSource.sourceItemId}: ${message}`
        );
        items.push({
          amazonSourceId: amazonSource.id,
          amazonSourceItemId: amazonSource.sourceItemId,
          ok: false,
          error: message
        });
      }
    }

    const summary = {
      runId: pipelineRun.id,
      attempted: amazonRows.length,
      succeeded: items.filter((item) => item.ok).length,
      failed: items.filter((item) => !item.ok).length,
      items
    };

    await finishPipelineRun(pipelineRun.id, {
      status: summary.failed === 0 ? 'completed' : summary.succeeded === 0 ? 'failed' : 'partial',
      processed: summary.attempted,
      succeeded: summary.succeeded,
      failed: summary.failed,
      statuses
    });

    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishPipelineRun(pipelineRun.id, {
      status: 'failed',
      processed: 0,
      succeeded: 0,
      failed: 0,
      statuses,
      errorMessage: message
    }).catch(() => {});
    throw error;
  }
}

