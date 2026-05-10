import { Star, ExternalLink, ShoppingBag, TrendingDown, Check, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import type { CatalogProduct } from '../../../lib/backendApi';

interface ComparisonPageProps {
  onNavigate: (page: string) => void;
  selectedProductId: number;
  catalogProducts: CatalogProduct[];
}

export function ComparisonPage({ onNavigate, selectedProductId, catalogProducts }: ComparisonPageProps) {
  const selected = catalogProducts.find((product) => product.id === selectedProductId);
  const product = {
    name: selected?.name ?? 'Hydrating Essence',
    brand: selected?.brand ?? 'Glow Lab'
  };

  const emojiByRetailer: Record<string, string> = {
    amazon: '📦',
    sephora: '🛍️',
    ulta: '💄',
    'brand official': '🏷️'
  };
  const sites =
    selected?.sites?.map((site) => {
      const lower = site.name.toLowerCase();
      const logo =
        Object.entries(emojiByRetailer).find(([key]) => lower.includes(key))?.[1] ?? '🛒';
      return {
        name: site.name,
        logo,
        price: site.price,
        originalPrice: site.price,
        rating: site.rating,
        reviews: selected.reviews ?? 0,
        stock: true,
        shipping: 'See retailer checkout',
        delivery: 'Varies by retailer',
        returns: 'See retailer policy',
        benefits: [],
        lastUpdated: 'Recently synced',
        url: site.url ?? null
      };
    }) ?? [];

  const lowestPrice = sites.length > 0 ? Math.min(...sites.map((s) => s.price)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-card to-muted/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1
            className="text-4xl lg:text-5xl mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
          >
            Compare Prices & Reviews
          </h1>
          <div className="flex items-center gap-3">
            <div className="text-lg text-muted-foreground">
              {product.brand} · {product.name}
            </div>
            <button
              onClick={() => onNavigate('product-detail')}
              className="text-primary hover:underline text-sm"
            >
              View Product Details
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-12">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-sage/10 border border-primary/20">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-medium">Best Price</h3>
            </div>
            <div
              className="text-4xl text-primary mb-1"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              ${lowestPrice}
            </div>
            <p className="text-sm text-muted-foreground">
              Save up to $
              {(sites.length > 0 ? Math.max(...sites.map((s) => s.price)) - lowestPrice : 0).toFixed(2)} compared to highest
              price
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-card border border-border">
            <div className="flex items-center gap-3 mb-2">
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              <h3 className="text-lg font-medium">Average Rating</h3>
            </div>
            <div
              className="text-4xl text-foreground mb-1"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              4.8
            </div>
            <p className="text-sm text-muted-foreground">
              Based on {sites.reduce((acc, s) => acc + s.reviews, 0).toLocaleString()} total reviews
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {sites.length === 0 && (
            <div className="bg-card rounded-2xl p-6 border border-border text-sm text-muted-foreground">
              No retailer offers available yet for this product.
            </div>
          )}
          {sites.map((site, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`bg-card rounded-2xl p-6 border-2 transition-all ${
                site.price === lowestPrice && site.stock
                  ? 'border-primary shadow-lg shadow-primary/10'
                  : 'border-border hover:border-border/60'
              } ${!site.stock ? 'opacity-60' : ''}`}
            >
              {site.price === lowestPrice && site.stock && (
                <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm">
                  <TrendingDown className="w-4 h-4" />
                  Best Price
                </div>
              )}

              <div className="grid lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-4xl">{site.logo}</div>
                    <div>
                      <h3 className="text-xl font-medium">{site.name}</h3>
                      <div className="flex items-center gap-2 text-sm">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{site.rating}</span>
                        <span className="text-muted-foreground">({site.reviews})</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="text-sm text-muted-foreground mb-1">Price</div>
                  <div className="flex items-baseline gap-2">
                    <div
                      className="text-3xl text-primary"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      ${site.price}
                    </div>
                    {site.discount && (
                      <>
                        <div className="text-sm text-muted-foreground line-through">
                          ${site.originalPrice}
                        </div>
                        <div className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded">
                          -{site.discount}%
                        </div>
                      </>
                    )}
                  </div>
                  <div
                    className={`text-xs mt-1 ${site.stock ? 'text-green-600' : 'text-destructive'}`}
                  >
                    {site.stock ? '✓ In Stock' : '✗ Out of Stock'}
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-2">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Shipping:</span> {site.shipping}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Delivery:</span> {site.delivery}
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Returns:</span> {site.returns}
                  </div>
                </div>

                <div className="lg:col-span-3 flex flex-col gap-3">
                  <a
                    href={site.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!site.stock || !site.url}
                    onClick={(event) => {
                      if (!site.stock || !site.url) event.preventDefault();
                    }}
                    className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-full hover:bg-forest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 aria-[disabled=true]:opacity-50 aria-[disabled=true]:cursor-not-allowed"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Buy Now
                  </a>
                  <a
                    href={site.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!site.url}
                    onClick={(event) => {
                      if (!site.url) event.preventDefault();
                    }}
                    className="w-full px-6 py-3 border-2 border-primary text-primary rounded-full hover:bg-primary/5 transition-all flex items-center justify-center gap-2 aria-[disabled=true]:opacity-50 aria-[disabled=true]:cursor-not-allowed"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Visit Site
                  </a>
                </div>
              </div>

              {site.benefits.length > 0 && (
                <div className="mt-6 pt-6 border-t border-border">
                  <div className="text-sm text-muted-foreground mb-3">Benefits & Perks</div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {site.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Last updated {site.lastUpdated}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 p-8 bg-gradient-to-br from-muted/50 to-card rounded-2xl border border-border">
          <h3
            className="text-2xl mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
          >
            Shopping Tips
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                💡
              </div>
              <div>
                <div className="font-medium mb-1">Check for promo codes</div>
                <p className="text-sm text-muted-foreground">
                  Many sites offer first-time customer discounts or seasonal promotions
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                🎁
              </div>
              <div>
                <div className="font-medium mb-1">Consider shipping minimums</div>
                <p className="text-sm text-muted-foreground">
                  Bundle products to qualify for free shipping and maximize value
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                ⭐
              </div>
              <div>
                <div className="font-medium mb-1">Join loyalty programs</div>
                <p className="text-sm text-muted-foreground">
                  Earn points and rewards for future purchases on your favorite sites
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                📱
              </div>
              <div>
                <div className="font-medium mb-1">Download retailer apps</div>
                <p className="text-sm text-muted-foreground">
                  Many retailers offer app-exclusive deals and early access to sales
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
