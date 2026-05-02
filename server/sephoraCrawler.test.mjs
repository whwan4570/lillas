import { describe, expect, it } from 'vitest';
import {
  buildProductUrl,
  crawlSephoraProduct,
  extractJsonLd,
  extractNextData,
  mapSephoraPageToProduct,
  SephoraCrawlError
} from './sephoraCrawler.mjs';

const productNode = {
  productId: 'P467091',
  displayName: 'Mineral Unseen Sunscreen SPF 40',
  brand: { displayName: 'Supergoop!' },
  rating: 4.3,
  reviews: 378,
  lovesCount: 21400,
  recommendedPercent: 82,
  longDescription:
    '<p>A sheer, weightless, scentless mineral sunscreen with expert SPF protection.</p>',
  quickLookDescription: 'Sheer, scentless mineral SPF 40 for daily use.',
  skinTypeNames: ['Normal', 'Dry', 'Combination'],
  skinConcerns: ['Sun Protection', 'Oiliness'],
  onlyAtSephora: false,
  productBadges: [{ label: 'Clean at Sephora' }, { label: 'Best Seller' }],
  attributes: [{ label: 'Fragrance Free' }],
  heroImages: [
    { image1500: 'https://www.sephora.com/productimages/sku/2773299-main-hero.jpg' }
  ],
  currentSku: {
    skuId: '2773299',
    listPrice: '$40.00',
    salePrice: null,
    autoReplenishPrice: 38,
    size: '1.7 oz / 50 ml',
    formulation: 'Cream',
    onlyAtSephora: false,
    biIngredients:
      'Avobenzone, Homosalate, Octisalate, Octocrylene, Isododecane, Dimethicone, Meadowfoam Estolide',
    skuBadges: [{ label: 'Sun Protection' }],
    imageUrl: '/productimages/sku/2773299-main.jpg',
    skuImages: { image450: 'https://www.sephora.com/productimages/sku/2773299-450.jpg' },
    alternateImages: [
      { imageUrl: 'https://www.sephora.com/productimages/sku/2773299-alt-2.jpg' }
    ],
    highlights: [
      {
        name: 'Broad-Spectrum SPF 40',
        description: 'Helps protect against UVA and UVB rays.'
      },
      { name: 'Meadowfoam Seed', description: 'Helps condition skin.' }
    ],
    ingredientCallouts: 'Reef-friendly: passes Hawaii reef compliance. Non-nano: better skin feel.',
    clinicalResults:
      '97% agreed it leaves skin dewy.\n90% agreed skin feels hydrated all day.',
    cleanAtSephoraDescription: 'Formulated without parabens, sulfates SLS and SLES, and phthalates.'
  }
};

const sampleHtml = `<!doctype html>
<html>
  <head>
    <title>Mineral Unseen Sunscreen SPF 40 - Supergoop!</title>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Mineral Unseen Sunscreen SPF 40',
      brand: { '@type': 'Brand', name: 'Supergoop!' },
      image: ['https://www.sephora.com/productimages/sku/2773299-jsonld.jpg'],
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.3',
        reviewCount: '378'
      },
      offers: {
        '@type': 'Offer',
        price: '40.00',
        priceCurrency: 'USD'
      }
    })}</script>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { product: productNode } }
    })}</script>
  </head>
  <body>
    <h1>Sephora product</h1>
  </body>
</html>`;

describe('sephoraCrawler URL helpers', () => {
  it('builds default product URL from item id', () => {
    expect(buildProductUrl('467091')).toBe('https://www.sephora.com/product/P467091');
  });

  it('returns provided url verbatim', () => {
    const url = 'https://www.sephora.com/product/glazing-milk-P467091';
    expect(buildProductUrl('467091', url)).toBe(url);
  });

  it('throws when no item id is provided', () => {
    expect(() => buildProductUrl('')).toThrow(SephoraCrawlError);
  });
});

describe('extractNextData / extractJsonLd', () => {
  it('extracts __NEXT_DATA__ JSON', () => {
    const data = extractNextData(sampleHtml);
    expect(data?.props?.pageProps?.product?.productId).toBe('P467091');
  });

  it('extracts JSON-LD blocks', () => {
    const blocks = extractJsonLd(sampleHtml);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]['@type']).toBe('Product');
  });
});

describe('mapSephoraPageToProduct', () => {
  it('maps Sephora HTML payload into the ImportedProduct shape', () => {
    const product = mapSephoraPageToProduct({
      html: sampleHtml,
      url: 'https://www.sephora.com/product/P467091',
      sourceItemId: '467091'
    });

    expect(product.source).toBe('sephora');
    expect(product.sourceItemId).toBe('467091');
    expect(product.name).toBe('Mineral Unseen Sunscreen SPF 40');
    expect(product.brand).toBe('Supergoop!');
    expect(product.priceAmount).toBe(40);
    expect(product.priceCurrency).toBe('USD');
    expect(product.autoReplenishPriceAmount).toBe(38);
    expect(product.ratingValue).toBe(4.3);
    expect(product.reviewCount).toBe(378);
    expect(product.lovesCount).toBe(21400);
    expect(product.recommendedPercent).toBe(82);
    expect(product.size).toBe('1.7 oz / 50 ml');
    expect(product.formulation).toBe('Cream');
    expect(product.skinTypes).toEqual(['Normal', 'Dry', 'Combination']);
    expect(product.skincareConcerns).toEqual(['Sun Protection', 'Oiliness']);
    expect(product.highlightedIngredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Broad-Spectrum SPF 40' }),
        expect.objectContaining({ name: 'Meadowfoam Seed' })
      ])
    );
    expect(product.highlights).toEqual(
      expect.arrayContaining(['Sun Protection', 'Clean at Sephora', 'Best Seller', 'Fragrance Free'])
    );
    expect(product.ingredientsText).toContain('Avobenzone');
    expect(product.inciIngredients).toEqual(
      expect.arrayContaining(['Avobenzone', 'Homosalate', 'Octisalate'])
    );
    expect(product.imageUrls).toEqual(
      expect.arrayContaining([
        'https://www.sephora.com/productimages/sku/2773299-main.jpg',
        'https://www.sephora.com/productimages/sku/2773299-450.jpg',
        'https://www.sephora.com/productimages/sku/2773299-alt-2.jpg',
        'https://www.sephora.com/productimages/sku/2773299-main-hero.jpg',
        'https://www.sephora.com/productimages/sku/2773299-jsonld.jpg'
      ])
    );
    expect(product.cleanAtSephora).toContain('Formulated without parabens');
    expect(typeof product.crawledAt).toBe('string');
    expect(product.rawText.length).toBeGreaterThan(50);
  });

  it('throws SephoraCrawlError on parse failure when no fields could be extracted', async () => {
    const fetchPage = async () => ({
      url: 'https://www.sephora.com/product/P000000',
      html: '<html><head></head><body>nothing here</body></html>'
    });
    await expect(
      crawlSephoraProduct({ sourceItemId: '000000' }, { fetchPage })
    ).rejects.toBeInstanceOf(SephoraCrawlError);
  });
});

describe('crawlSephoraProduct', () => {
  it('uses an injected fetcher and returns the mapped product', async () => {
    const fetchPage = async (id) => ({
      url: `https://www.sephora.com/product/P${id}`,
      html: sampleHtml
    });
    const product = await crawlSephoraProduct(
      { sourceItemId: '467091', sourceUrl: null, label: null },
      { fetchPage }
    );
    expect(product.sourceUrl).toBe('https://www.sephora.com/product/P467091');
    expect(product.name).toBe('Mineral Unseen Sunscreen SPF 40');
  });
});
