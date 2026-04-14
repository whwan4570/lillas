import { ArrowRight, Sparkles, TestTube, TrendingUp, Users, Shield, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../ImageWithFallback';
import { getSeedCatalogProducts } from '../../../data/catalogSeed';

interface LandingPageProps {
  onNavigate: (page: string) => void;
}

export function LandingPage({ onNavigate }: LandingPageProps) {
  const popularProducts = getSeedCatalogProducts()
    .slice(0, 4)
    .map((p) => ({
      name: p.name,
      brand: p.brand,
      priceLabel: p.price != null ? `$${p.price}` : `${p.matchScore}% match`,
      rating: p.rating,
      reviews: p.reviews,
      skinTypes: p.benefits.length > 0 ? p.benefits.slice(0, 2) : [p.categoryLabel],
      image: p.image
    }));

  const catalogCount = getSeedCatalogProducts().length;

  const concerns = [
    { name: 'Hydration', icon: '💧', color: 'from-blue-100 to-blue-50' },
    { name: 'Anti-Aging', icon: '✨', color: 'from-purple-100 to-purple-50' },
    { name: 'Acne', icon: '🎯', color: 'from-green-100 to-green-50' },
    { name: 'Brightening', icon: '☀️', color: 'from-yellow-100 to-yellow-50' },
    { name: 'Sensitivity', icon: '🌸', color: 'from-pink-100 to-pink-50' },
    { name: 'Texture', icon: '🔆', color: 'from-orange-100 to-orange-50' }
  ];

  const features = [
    {
      icon: <Sparkles className="w-6 h-6" />,
      title: 'AI-Powered Matching',
      description: 'Personalized recommendations based on your unique skin profile'
    },
    {
      icon: <TestTube className="w-6 h-6" />,
      title: 'Ingredient Analysis',
      description: 'Deep dive into formulations to find what works for you'
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Price Comparison',
      description: 'Compare across multiple retailers to find the best deals'
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: 'Community Reviews',
      description: 'Real experiences from people with similar skin types'
    }
  ];

  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden bg-gradient-to-br from-cream via-card to-muted/30">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-sage rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-rose rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm text-primary">Trusted by 50,000+ users</span>
              </div>

              <h1
                className="text-5xl lg:text-7xl mb-6 tracking-tight"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, lineHeight: 1.1 }}
              >
                Find Your Perfect
                <span className="block text-primary" style={{ fontWeight: 500 }}>
                  Skincare Match
                </span>
              </h1>

              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                Discover products tailored to your skin type, concerns, and goals. Compare prices,
                analyze ingredients, and join a community of skincare enthusiasts.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => onNavigate('skin-test')}
                  className="group px-8 py-4 bg-primary text-primary-foreground rounded-full hover:bg-forest transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  Start Skin Test
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => onNavigate('products')}
                  className="px-8 py-4 bg-card border-2 border-primary text-primary rounded-full hover:bg-primary/5 transition-all duration-300"
                >
                  Explore Products
                </button>
              </div>

              <div className="flex items-center gap-8 mt-12">
                <div>
                  <div className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                    98%
                  </div>
                  <div className="text-sm text-muted-foreground">Match Rate</div>
                </div>
                <div className="w-px h-12 bg-border" />
                <div>
                  <div className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                    {catalogCount > 999 ? `${Math.floor(catalogCount / 1000)}k+` : catalogCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Products</div>
                </div>
                <div className="w-px h-12 bg-border" />
                <div>
                  <div className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                    4.9★
                  </div>
                  <div className="text-sm text-muted-foreground">User Rating</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative hidden lg:block"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-sage/20 to-rose/20 rounded-3xl blur-3xl" />
              <div className="relative bg-card rounded-3xl p-8 shadow-2xl border border-border/50">
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="aspect-square rounded-2xl bg-gradient-to-br from-muted to-muted/50 overflow-hidden"
                    >
                      <ImageWithFallback
                        src={popularProducts[i - 1]?.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2
              className="text-4xl lg:text-5xl mb-4"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
            >
              Why lillas?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Combining AI technology with community wisdom to revolutionize your skincare journey
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className="p-6 rounded-2xl bg-gradient-to-br from-muted/50 to-card border border-border hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-b from-card to-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2
                className="text-4xl lg:text-5xl mb-2"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Popular Products
              </h2>
              <p className="text-muted-foreground">Loved by our community</p>
            </div>
            <button
              onClick={() => onNavigate('products')}
              className="hidden md:flex items-center gap-2 text-primary hover:gap-3 transition-all"
            >
              View All
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {popularProducts.map((product, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                onClick={() => onNavigate('product-detail')}
                className="group bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-border/50"
              >
                <div className="aspect-square overflow-hidden bg-muted relative">
                  <ImageWithFallback
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 right-3 bg-card/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs flex items-center gap-1">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    {product.rating}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs text-muted-foreground mb-1">{product.brand}</div>
                  <h3
                    className="text-lg mb-2 group-hover:text-primary transition-colors"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {product.name}
                  </h3>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {product.skinTypes.map((type, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl" style={{ fontFamily: 'var(--font-serif)' }}>
                      {product.priceLabel}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {product.reviews.toLocaleString()} reviews
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2
              className="text-4xl lg:text-5xl mb-4"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
            >
              Shop by Concern
            </h2>
            <p className="text-muted-foreground">Find solutions for your specific skin needs</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {concerns.map((concern, index) => (
              <motion.button
                key={index}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
                onClick={() => onNavigate('products')}
                className={`p-6 rounded-2xl bg-gradient-to-br ${concern.color} hover:shadow-lg transition-all duration-300 border border-border/30`}
              >
                <div className="text-4xl mb-3">{concern.icon}</div>
                <div className="text-sm font-medium">{concern.name}</div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-br from-primary to-forest text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2
              className="text-4xl lg:text-5xl mb-6"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
            >
              Ready to Transform Your Skin?
            </h2>
            <p className="text-lg mb-8 opacity-90">
              Take our 2-minute skin test and get personalized product recommendations
            </p>
            <button
              onClick={() => onNavigate('skin-test')}
              className="px-10 py-4 bg-card text-primary rounded-full hover:bg-card/90 transition-all duration-300 shadow-xl"
            >
              Start Your Journey
            </button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
