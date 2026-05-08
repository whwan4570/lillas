import { useMemo, useState } from 'react';
import {
  Star,
  Heart,
  ShoppingCart,
  ChevronDown,
  TrendingUp,
  Sparkles,
  Filter,
  AlertTriangle,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../ImageWithFallback';
import type { SkinTestAnswers } from '../../types';
import {
  explainProduct,
  ingredientMap,
  scoreProduct,
  type Product,
  type UserProfile
} from '../../../lib/recommendationEngine';
import type { CatalogProduct } from '../../../lib/backendApi';

interface RecommendationsPageProps {
  onNavigate: (page: string) => void;
  skinTestAnswers: SkinTestAnswers;
  userProfile: UserProfile;
  onSelectProduct: (productId: number, targetPage?: string) => void;
  savedProductIds: number[];
  onToggleSaved: (productId: number) => void;
  catalogProducts: CatalogProduct[];
}

function toEngineProduct(product: CatalogProduct): Product {
  const ingredients = [...product.keyIngredients, ...product.cautionIngredients].map((v) =>
    v.toLowerCase()
  );
  const syntheticPrice = product.price ?? Math.max(18, Math.round(120 - product.matchScore));
  return {
    id: String(product.id),
    name: product.name,
    brand: product.brand,
    category: product.categoryLabel,
    price: syntheticPrice,
    rating: product.rating,
    reviews: product.reviews,
    ingredients,
    benefits: product.benefits,
    tags: [product.category, ...product.benefits]
  };
}

export function RecommendationsPage({
  onNavigate,
  skinTestAnswers,
  userProfile,
  onSelectProduct,
  savedProductIds,
  onToggleSaved,
  catalogProducts
}: RecommendationsPageProps) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('match');
  const [detailProductId, setDetailProductId] = useState<number | null>(null);
  const hasCoreProfile = Boolean(skinTestAnswers.skinType) || skinTestAnswers.concerns.length > 0;

  const products = useMemo(
    () =>
      catalogProducts.map((product) => ({
        ...product,
        recommendation: scoreProduct(toEngineProduct(product), ingredientMap, userProfile),
        explanation: explainProduct(toEngineProduct(product), ingredientMap, userProfile)
      })),
    [catalogProducts, userProfile]
  );

  const categories = useMemo(() => {
    const unique = Array.from(new Set(products.map((p) => p.categoryLabel))).sort((a, b) =>
      a.localeCompare(b)
    );
    return [{ value: 'all', label: 'All Products' }, ...unique.map((c) => ({ value: c, label: c }))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const base =
      selectedCategory === 'all'
        ? products
        : products.filter((p) => p.categoryLabel === selectedCategory);

    const list = [...base];
    switch (sortBy) {
      case 'match':
        list.sort((a, b) => b.recommendation.finalScore - a.recommendation.finalScore);
        break;
      case 'rating':
        list.sort((a, b) => b.rating - a.rating);
        break;
      case 'price-low':
        list.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
        break;
      case 'price-high':
        list.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
        break;
      case 'popular':
        list.sort((a, b) => b.reviews - a.reviews);
        break;
      default:
        break;
    }
    return list;
  }, [products, selectedCategory, sortBy]);
  const detailProduct = detailProductId == null ? null : products.find((p) => p.id === detailProductId) ?? null;
  const topFinalScore = filteredProducts.length
    ? Math.max(...filteredProducts.map((p) => p.recommendation.finalScore))
    : 0;

  const getMatchPercent = (score: number) => {
    if (topFinalScore <= 0) return 0;
    const relative = Math.round((score / topFinalScore) * 100);
    return Math.max(0, Math.min(100, relative));
  };

  const formatFromPrice = (product: CatalogProduct) => {
    if (product.sites.length === 0) {
      return { label: 'See retailers', sub: null as string | null };
    }
    const min = Math.min(...product.sites.map((s) => s.price));
    return { label: `$${min}`, sub: 'From' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-card to-muted/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-sage flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1
                className="text-4xl lg:text-5xl"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Products
              </h1>
              <p className="text-muted-foreground mt-1">
                Browse products and open each item for detailed score breakdown.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="lg:w-72 flex-shrink-0">
            <div className="bg-card rounded-2xl p-6 border border-border/50 sticky top-24">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5" />
                <h3 className="text-lg" style={{ fontFamily: 'var(--font-serif)' }}>
                  Filters
                </h3>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-sm text-muted-foreground mb-3 block">Category</label>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {categories.map((cat) => (
                      <button
                        key={cat.value}
                        onClick={() => setSelectedCategory(cat.value)}
                        className={`w-full text-left px-4 py-2 rounded-lg transition-all ${
                          selectedCategory === cat.value
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-3 block">Sort By</label>
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border border-border bg-background appearance-none cursor-pointer"
                    >
                      <option value="match">Best Match</option>
                      <option value="rating">Highest Rated</option>
                      <option value="price-low">Price: Low to High</option>
                      <option value="price-high">Price: High to Low</option>
                      <option value="popular">Most Popular</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
                  </div>
                </div>

                <div className="pt-6 border-t border-border">
                  <div className="text-sm text-muted-foreground mb-2">Your Profile</div>
                  <div className="space-y-2">
                    {skinTestAnswers.skinType ? (
                      <div className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm">
                        {skinTestAnswers.skinType}
                      </div>
                    ) : null}
                    {skinTestAnswers.sensitivity ? (
                      <div className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm">
                        {skinTestAnswers.sensitivity} sensitivity
                      </div>
                    ) : null}
                    {skinTestAnswers.concerns.slice(0, 2).map((concern) => (
                      <div key={concern} className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm">
                        {concern}
                      </div>
                    ))}
                  </div>
                  {!hasCoreProfile && (
                    <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Complete Skin Test to unlock fully personalized Final Score.
                    </div>
                  )}
                  <button
                    onClick={() => onNavigate('skin-test')}
                    className="w-full mt-3 text-sm text-primary hover:underline"
                  >
                    Retake Test
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex-1">
            <div className="grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProducts.map((product, index) => {
                const priceInfo = formatFromPrice(product);
                const saved = savedProductIds.includes(product.id);
                return (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="group bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-border/50"
                  >
                    <div onClick={() => onSelectProduct(product.id)} className="cursor-pointer">
                      <div className="aspect-square overflow-hidden bg-muted relative">
                        <ImageWithFallback
                          src={product.image ?? undefined}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {hasCoreProfile ? (
                          <div className="absolute top-3 left-3 px-3 py-1 bg-gradient-to-r from-primary to-sage text-white rounded-full text-sm flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {getMatchPercent(product.recommendation.finalScore)}% Match
                          </div>
                        ) : (
                          <div className="absolute top-3 left-3 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-xs">
                            Skin Test Needed
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSaved(product.id);
                          }}
                          className="absolute top-3 right-3 w-9 h-9 bg-card/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-card transition-colors"
                          aria-label="Save product"
                        >
                          <Heart className={`w-4 h-4 ${saved ? 'fill-primary text-primary' : ''}`} />
                        </button>
                      </div>

                      <div className="p-5">
                        <div className="text-xs text-muted-foreground mb-1">{product.brand}</div>
                        <h3
                          className="text-lg mb-2 group-hover:text-primary transition-colors line-clamp-2"
                          style={{ fontFamily: 'var(--font-serif)' }}
                        >
                          {product.name}
                        </h3>

                        <div className="text-xs text-primary mb-2">
                          {product.explanation.reasons[0] ?? 'General skin fit'}
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-1">
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-medium">{product.rating}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            ({product.reviews.toLocaleString()})
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1 mb-2">
                          {product.keyIngredients.slice(0, 2).map((ingredient, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-1 bg-sage/10 text-sage rounded-full"
                            >
                              {ingredient}
                            </span>
                          ))}
                        </div>

                        {(product.explanation.warnings.length > 0 || product.cautionIngredients.length > 0) && (
                          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-3 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Caution: {product.explanation.warnings[0] ?? product.cautionIngredients[0]}
                          </div>
                        )}

                        <div className="text-[11px] text-muted-foreground mb-3">
                          Skin {product.recommendation.breakdown.skinTypeScore.toFixed(1)} · Concern{' '}
                          {product.recommendation.breakdown.concernScore.toFixed(1)} · Budget{' '}
                          {product.recommendation.breakdown.budgetScore.toFixed(1)}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailProductId(product.id);
                          }}
                          className="text-xs text-primary underline-offset-2 hover:underline mb-3"
                        >
                          View score details
                        </button>

                        <div className="flex items-center justify-between pt-3 border-t border-border">
                          <div>
                            {priceInfo.sub ? (
                              <div className="text-xs text-muted-foreground">{priceInfo.sub}</div>
                            ) : (
                              <div className="text-xs text-muted-foreground invisible">From</div>
                            )}
                            <div
                              className="text-xl"
                              style={{ fontFamily: 'var(--font-serif)' }}
                            >
                              {priceInfo.label}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectProduct(product.id, 'comparison');
                            }}
                            className="px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-all text-sm flex items-center gap-2"
                          >
                            <ShoppingCart className="w-4 h-4" />
                            Compare
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {detailProduct && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={() => setDetailProductId(null)}
        >
          <div
            className="w-full max-w-lg bg-card rounded-2xl border border-border p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl" style={{ fontFamily: 'var(--font-serif)' }}>
                  Score Breakdown
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {detailProduct.brand} · {detailProduct.name}
                </p>
              </div>
              <button
                onClick={() => setDetailProductId(null)}
                className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><span>Skin Type Score</span><span>{detailProduct.recommendation.breakdown.skinTypeScore.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Concern Score</span><span>{detailProduct.recommendation.breakdown.concernScore.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Tag/Category Score</span><span>{detailProduct.recommendation.breakdown.tagScore.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Sensitivity Score</span><span>{detailProduct.recommendation.breakdown.sensitivityScore.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Review Score</span><span>{detailProduct.recommendation.breakdown.reviewScore.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Preferred Ingredient Score</span><span>{detailProduct.recommendation.breakdown.preferredIngredientScore.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Brand Score</span><span>{detailProduct.recommendation.breakdown.brandScore.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Budget Score</span><span>{detailProduct.recommendation.breakdown.budgetScore.toFixed(2)}</span></div>
              <div className="flex justify-between text-amber-700"><span>Avoid Penalty</span><span>-{detailProduct.recommendation.breakdown.avoidPenalty.toFixed(2)}</span></div>
              <div className="border-t border-border pt-2 flex justify-between font-medium">
                <span>Final Score</span>
                <span>{detailProduct.recommendation.finalScore.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="text-sm font-medium mb-1">Why recommended</div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {(detailProduct.explanation.reasons.length ? detailProduct.explanation.reasons : ['General profile fit']).map((reason) => (
                    <li key={reason}>- {reason}</li>
                  ))}
                </ul>
              </div>
              {detailProduct.explanation.warnings.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-1 text-amber-700">Warnings</div>
                  <ul className="text-xs text-amber-700 space-y-1">
                    {detailProduct.explanation.warnings.map((warning) => (
                      <li key={warning}>- {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
