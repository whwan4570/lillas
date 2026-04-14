import { useMemo, useState } from 'react';
import { Star, Heart, Share2, ChevronRight, Check, ShoppingBag, AlertCircle, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../ImageWithFallback';
import { getSeedCatalogProducts } from '../../../data/catalogSeed';
import {
  explainProduct,
  ingredientMap,
  scoreProduct,
  type Product,
  type UserProfile
} from '../../../lib/recommendationEngine';

interface ProductDetailPageProps {
  onNavigate: (page: string) => void;
  selectedProductId: number;
  userProfile: UserProfile;
  isSaved: boolean;
  onToggleSaved: (productId: number) => void;
  onSelectProduct: (productId: number, targetPage?: string) => void;
}

export function ProductDetailPage({
  onNavigate,
  selectedProductId,
  userProfile,
  isSaved,
  onToggleSaved,
  onSelectProduct
}: ProductDetailPageProps) {
  const [selectedTab, setSelectedTab] = useState('overview');
  const product = useMemo(
    () => getSeedCatalogProducts().find((item) => item.id === selectedProductId) ?? getSeedCatalogProducts()[0],
    [selectedProductId]
  );
  const productSites = [
    { name: 'Sephora', price: 42, rating: 4.8, reviews: 1523, stock: true },
    { name: 'Ulta', price: 40, rating: 4.7, reviews: 892, stock: true },
    { name: 'Amazon', price: 38, rating: 4.9, reviews: 432, stock: false },
    { name: 'Olive Young', price: 39, rating: 4.7, reviews: 671, stock: true }
  ];
  const engineProduct: Product = {
    id: String(product.id),
    name: product.name,
    brand: product.brand,
    category: product.categoryLabel,
    price: product.price ?? 40,
    rating: product.rating,
    reviews: product.reviews,
    ingredients: [...product.keyIngredients, ...product.cautionIngredients].map((x) => x.toLowerCase()),
    benefits: product.benefits
  };
  const scored = scoreProduct(engineProduct, ingredientMap, userProfile);
  const explanation = explainProduct(engineProduct, ingredientMap, userProfile);
  const topSkinType = Object.entries(userProfile.skinWeights).find(([, w]) => w > 0.5)?.[0] ?? '';
  const topConcern = Object.entries(userProfile.concernWeights).find(([, w]) => w > 0.5)?.[0] ?? '';
  const recommendationReason =
    explanation.reasons[0] ??
    (topConcern ? `Matched for ${topConcern} concern` : 'Matched from weighted profile scoring');
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'ingredients', label: 'Ingredients' },
    { id: 'reviews', label: 'Reviews' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-card to-muted/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <button onClick={() => onNavigate('home')} className="hover:text-foreground">
            Home
          </button>
          <ChevronRight className="w-4 h-4" />
          <button onClick={() => onNavigate('products')} className="hover:text-foreground">
            Products
          </button>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground">{product.name}</span>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 mb-16">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="sticky top-24 h-fit">
            <div className="aspect-square rounded-3xl overflow-hidden bg-muted shadow-2xl border border-border/50 relative">
              <ImageWithFallback src={product.image} alt={product.name} className="w-full h-full object-cover" />
              <div className="absolute top-6 right-6 flex gap-3">
                <button
                  onClick={() => onToggleSaved(product.id)}
                  className="w-12 h-12 bg-card/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-card transition-colors shadow-lg"
                >
                  <Heart className={`w-5 h-5 ${isSaved ? 'fill-primary text-primary' : ''}`} />
                </button>
                <button className="w-12 h-12 bg-card/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-card transition-colors shadow-lg">
                  <Share2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div>
              <div className="text-sm text-muted-foreground mb-2">{product.brand}</div>
              <h1 className="text-4xl lg:text-5xl mb-4" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
                {product.name}
              </h1>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-5 h-5 ${i < Math.floor(product.rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                  ))}
                  <span className="font-medium">{product.rating}</span>
                </div>
                <span className="text-muted-foreground">({product.reviews.toLocaleString()} reviews)</span>
              </div>
              <p className="text-sm text-primary">{recommendationReason}</p>
            </div>

            <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-primary/10 to-sage/10 border border-primary/20 rounded-2xl">
              <Sparkles className="w-5 h-5 text-primary" />
              <div>
                <div className="text-sm text-muted-foreground">Final Score</div>
                <div className="text-2xl text-primary" style={{ fontFamily: 'var(--font-serif)' }}>
                  {scored.finalScore.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <div className="text-sm text-muted-foreground mb-2">Suitable for:</div>
              <div className="flex flex-wrap gap-2">
                {[topSkinType || 'all skin types', product.categoryLabel].map((label) => (
                  <span key={label} className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm">{label}</span>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-border">
              <div className="text-2xl mb-4" style={{ fontFamily: 'var(--font-serif)' }}>Available at:</div>
              <div className="space-y-3">
                {productSites.map((site) => (
                  <div key={site.name} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl hover:border-primary/30 transition-all">
                    <div>
                      <div className="font-medium">{site.name}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                        {site.rating} ({site.reviews} reviews)
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-2xl text-primary" style={{ fontFamily: 'var(--font-serif)' }}>${site.price}</div>
                        <div className={`text-xs ${site.stock ? 'text-green-600' : 'text-destructive'}`}>{site.stock ? 'In Stock' : 'Out of Stock'}</div>
                      </div>
                      <button disabled={!site.stock} className="px-6 py-3 bg-primary text-primary-foreground rounded-full hover:bg-forest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4" />
                        Buy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => onSelectProduct(product.id, 'comparison')} className="w-full mt-4 py-3 border-2 border-primary text-primary rounded-full hover:bg-primary/5 transition-all">
                Compare All Sites
              </button>
            </div>
          </motion.div>
        </div>

        <div className="bg-card rounded-3xl p-8 border border-border/50">
          <div className="flex items-center gap-4 mb-8 border-b border-border">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setSelectedTab(tab.id)} className={`pb-4 px-2 transition-all relative ${selectedTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {selectedTab === 'overview' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-primary/5 rounded-xl border border-primary/20">
                <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium mb-1">Why this is recommended</div>
                  <p className="text-sm text-muted-foreground">{recommendationReason}</p>
                </div>
              </div>
              {(explanation.warnings.length > 0 || product.cautionIngredients.length > 0) && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium mb-1">Caution ingredients</div>
                    <p className="text-sm text-muted-foreground">
                      {explanation.warnings.join(', ') || product.cautionIngredients.join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedTab === 'ingredients' && (
            <div className="grid sm:grid-cols-2 gap-3">
              {product.keyIngredients.map((ingredient) => (
                <div key={ingredient} className="p-4 bg-muted/30 rounded-xl border border-border">
                  <div className="font-medium">{ingredient}</div>
                </div>
              ))}
            </div>
          )}

          {selectedTab === 'reviews' && (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 bg-muted/30 rounded-xl">
                  <div className="text-sm font-medium mb-1">User review summary</div>
                  <p className="text-sm text-muted-foreground">Good texture and absorption. Frequently mentioned for {product.categoryLabel.toLowerCase()} routines.</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
