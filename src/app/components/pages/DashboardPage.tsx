import { useEffect, useMemo, useState } from 'react';
import {
  Heart,
  Clock,
  MessageCircle,
  Settings,
  TrendingUp,
  Package,
  Sparkles,
  UserMinus,
  UserPlus,
  LogIn,
  Users,
  Star
} from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../ImageWithFallback';
import { getSeedCatalogProducts, type SeedCatalogProduct } from '../../../data/catalogSeed';
import {
  getCommunityFeed,
  toggleFollow,
  type AuthUser,
  type CommunityPost,
  type CreatorItem
} from '../../../lib/backendApi';

interface DashboardPageProps {
  onNavigate: (page: string) => void;
  authToken: string | null;
  authUser: AuthUser | null;
  savedProductIds: number[];
  recentProductIds: number[];
  onRequireLogin: (onSuccess?: () => void) => void;
  onSelectProduct: (productId: number, targetPage?: string) => void;
  onToggleSaved: (productId: number) => void;
  onEditProfile: () => void;
}

export function DashboardPage({
  onNavigate,
  authToken,
  authUser,
  savedProductIds,
  recentProductIds,
  onRequireLogin,
  onSelectProduct,
  onToggleSaved,
  onEditProfile
}: DashboardPageProps) {
  const [selectedTab, setSelectedTab] = useState('saved');
  const [creators, setCreators] = useState<CreatorItem[]>([]);
  const [followingAuthorIds, setFollowingAuthorIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const catalogProducts = useMemo(() => getSeedCatalogProducts(), []);
  const catalogById = useMemo(() => {
    const map = new Map<number, SeedCatalogProduct>();
    for (const product of catalogProducts) map.set(product.id, product);
    return map;
  }, [catalogProducts]);

  const savedProducts = useMemo(
    () =>
      savedProductIds
        .map((id) => ({ id, product: catalogById.get(id) }))
        .filter((entry): entry is { id: number; product: SeedCatalogProduct } => Boolean(entry.product)),
    [savedProductIds, catalogById]
  );

  const recentProducts = useMemo(
    () =>
      recentProductIds
        .map((id) => ({ id, product: catalogById.get(id) }))
        .filter((entry): entry is { id: number; product: SeedCatalogProduct } => Boolean(entry.product)),
    [recentProductIds, catalogById]
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getCommunityFeed(authToken)
      .then((result) => {
        if (cancelled) return;
        setCreators(result.creators);
        setFollowingAuthorIds(result.followingAuthorIds);
        setPosts(result.posts);
        setError(null);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load dashboard data');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const myPosts = useMemo(
    () => (authUser ? posts.filter((post) => post.authorId === authUser.id) : []),
    [posts, authUser?.id]
  );

  const followedCreators = useMemo(
    () =>
      creators.filter(
        (creator) => creator.authorId !== authUser?.id && followingAuthorIds.includes(creator.authorId)
      ),
    [creators, followingAuthorIds, authUser?.id]
  );

  const suggestedCreators = useMemo(
    () =>
      creators.filter(
        (creator) => creator.authorId !== authUser?.id && !followingAuthorIds.includes(creator.authorId)
      ),
    [creators, followingAuthorIds, authUser?.id]
  );

  const handleToggleFollow = async (authorId: string) => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    try {
      const result = await toggleFollow(authToken, authorId);
      setFollowingAuthorIds(result.followingAuthorIds);
      setError(null);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Failed to update follow state');
    }
  };

  const displayName = authUser?.name ?? 'Guest';
  const displaySkinType = authUser?.skinType ?? 'Not set';
  const displayAvatar =
    authUser?.avatar ??
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop';

  const totalLikesReceived = useMemo(
    () => myPosts.reduce((acc, post) => acc + post.likes, 0),
    [myPosts]
  );

  const stats = [
    { label: 'Saved', value: savedProducts.length, icon: <Heart className="w-5 h-5" /> },
    { label: 'My Posts', value: myPosts.length, icon: <MessageCircle className="w-5 h-5" /> },
    { label: 'Following', value: followedCreators.length, icon: <Users className="w-5 h-5" /> },
    { label: 'Likes', value: totalLikesReceived, icon: <TrendingUp className="w-5 h-5" /> }
  ];

  const tabs = [
    { id: 'saved', label: 'Saved', count: savedProducts.length },
    { id: 'recent', label: 'Recent', count: recentProducts.length },
    { id: 'posts', label: 'My Posts', count: myPosts.length },
    { id: 'following', label: 'Following', count: followedCreators.length }
  ];

  const primaryButton =
    'px-5 py-2.5 rounded-full bg-primary text-primary-foreground hover:bg-forest active:scale-[0.98] transition-all shadow-sm hover:shadow-md text-sm font-medium flex items-center justify-center gap-2';
  const secondaryButton =
    'px-5 py-2.5 rounded-full border border-primary/40 text-primary hover:bg-primary/5 active:scale-[0.98] transition-all text-sm font-medium flex items-center justify-center gap-2';
  const ghostButton =
    'px-3 py-2 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-sm flex items-center gap-1.5';

  const renderProductCard = (
    product: SeedCatalogProduct,
    meta: { badge?: React.ReactNode; action?: React.ReactNode; index: number }
  ) => (
    <motion.div
      key={product.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: meta.index * 0.04 }}
      className="group bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-border/50 cursor-pointer"
      onClick={() => onSelectProduct(product.id, 'product-detail')}
    >
      <div className="aspect-square overflow-hidden bg-muted relative">
        <ImageWithFallback
          src={product.image ?? ''}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {meta.badge}
      </div>
      <div className="p-4">
        <div className="text-xs text-muted-foreground mb-0.5 truncate">{product.brand}</div>
        <h3
          className="text-base mb-2 group-hover:text-primary transition-colors line-clamp-2 min-h-[2.5rem]"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}
        >
          {product.name}
        </h3>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>{product.rating.toFixed(1)}</span>
          <span>·</span>
          <span>{product.reviews.toLocaleString()} reviews</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg" style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}>
            ${product.price}
          </span>
          {meta.action}
        </div>
      </div>
    </motion.div>
  );

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream via-card to-muted/30 py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center mb-6">
            <LogIn className="w-7 h-7" />
          </div>
          <h1
            className="text-4xl mb-3"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
          >
            Sign in to your dashboard
          </h1>
          <p className="text-muted-foreground mb-8">
            Track saved products, your posts, following list, and personalized stats.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button onClick={() => onRequireLogin()} className={primaryButton}>
              <LogIn className="w-4 h-4" />
              Login / Sign up
            </button>
            <button onClick={() => onNavigate('home')} className={secondaryButton}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream via-card to-muted/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-card rounded-3xl p-8 border border-border/50 shadow-sm sticky top-24">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-muted mb-4 ring-4 ring-primary/10">
                    <ImageWithFallback
                      src={displayAvatar}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute bottom-3 right-0 w-6 h-6 bg-sage rounded-full border-2 border-card" />
                </div>
                <h2
                  className="text-2xl mb-1"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
                >
                  {displayName}
                </h2>
                <p className="text-xs text-muted-foreground mb-1">{authUser.email}</p>
                <p className="text-muted-foreground mb-5 text-sm">{displaySkinType}</p>
                <button onClick={onEditProfile} className={`${primaryButton} w-full mb-2.5`}>
                  <Settings className="w-4 h-4" />
                  Edit Profile
                </button>
                <button
                  onClick={() => onNavigate('skin-test')}
                  className={`${secondaryButton} w-full`}
                >
                  <Sparkles className="w-4 h-4" />
                  Retake Skin Test
                </button>
              </div>

              <div className="pt-6 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  {stats.map((stat, i) => (
                    <div
                      key={i}
                      className="text-center p-4 bg-muted/40 rounded-2xl hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex justify-center text-primary mb-2">{stat.icon}</div>
                      <div
                        className="text-2xl mb-0.5"
                        style={{ fontFamily: 'var(--font-serif)' }}
                      >
                        {stat.value}
                      </div>
                      <div className="text-xs text-muted-foreground">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="lg:col-span-2">
            <div className="mb-6">
              <h1
                className="text-4xl mb-2"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Welcome back, {displayName.split(' ')[0]} 
              </h1>
              <p className="text-muted-foreground">Your personal skincare journey overview.</p>
            </div>

            <div className="flex items-center gap-2 mb-6 border-b border-border overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={`pb-3.5 px-3 transition-all relative whitespace-nowrap ${
                    selectedTab === tab.id
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {tab.label}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedTab === tab.id
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </span>
                  {selectedTab === tab.id && (
                    <motion.div
                      layoutId="activeDashboardTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                    />
                  )}
                </button>
              ))}
            </div>

            {isLoading && (
              <div className="text-sm text-muted-foreground py-8">Loading your data...</div>
            )}

            {selectedTab === 'saved' && !isLoading && (
              <div>
                {savedProducts.length === 0 ? (
                  <div className="p-10 bg-card rounded-2xl border border-border/50 text-center">
                    <Heart className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground mb-4">
                      You haven't saved any products yet.
                    </p>
                    <button onClick={() => onNavigate('products')} className={primaryButton}>
                      Browse products
                    </button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    {savedProducts.map(({ product }, index) =>
                      renderProductCard(product, {
                        index,
                        badge: (
                          <div className="absolute top-3 left-3 px-2.5 py-1 bg-gradient-to-r from-primary to-sage text-white rounded-full text-xs flex items-center gap-1 shadow-sm">
                            <TrendingUp className="w-3 h-3" />
                            {product.matchScore}%
                          </div>
                        ),
                        action: (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSaved(product.id);
                            }}
                            className="w-9 h-9 rounded-full bg-primary/10 text-primary hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-all"
                            aria-label="Remove from saved"
                          >
                            <Heart className="w-4 h-4 fill-current" />
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedTab === 'recent' && !isLoading && (
              <div>
                {recentProducts.length === 0 ? (
                  <div className="p-10 bg-card rounded-2xl border border-border/50 text-center">
                    <Clock className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground mb-4">
                      Products you view will appear here automatically.
                    </p>
                    <button onClick={() => onNavigate('products')} className={primaryButton}>
                      Start exploring
                    </button>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-5">
                    {recentProducts.map(({ product }, index) =>
                      renderProductCard(product, {
                        index,
                        badge: (
                          <div className="absolute top-3 left-3 px-2.5 py-1 bg-card/90 backdrop-blur-sm text-foreground rounded-full text-xs flex items-center gap-1 shadow-sm">
                            <Clock className="w-3 h-3" />
                            Recent
                          </div>
                        ),
                        action: (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSaved(product.id);
                            }}
                            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                              savedProductIds.includes(product.id)
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                            }`}
                            aria-label={
                              savedProductIds.includes(product.id) ? 'Saved' : 'Save product'
                            }
                          >
                            <Heart
                              className={`w-4 h-4 ${
                                savedProductIds.includes(product.id) ? 'fill-current' : ''
                              }`}
                            />
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedTab === 'posts' && !isLoading && (
              <div className="space-y-4">
                {myPosts.length === 0 ? (
                  <div className="p-10 bg-card rounded-2xl border border-border/50 text-center">
                    <MessageCircle className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground mb-4">
                      You haven't posted anything in the community yet.
                    </p>
                    <button onClick={() => onNavigate('community')} className={primaryButton}>
                      Write your first post
                    </button>
                  </div>
                ) : (
                  myPosts.map((post, index) => (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => onNavigate('community')}
                      className="bg-card rounded-2xl p-6 border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer"
                    >
                      <h3
                        className="text-xl mb-2"
                        style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
                      >
                        {post.title}
                      </h3>
                      <p className="text-muted-foreground mb-4 line-clamp-2">{post.content}</p>
                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Heart className="w-4 h-4" />
                          {post.likes}
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-4 h-4" />
                          {post.comments}
                        </div>
                        <div className="ml-auto">{post.timeAgo}</div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {selectedTab === 'following' && !isLoading && (
              <div className="space-y-8">
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3
                      className="text-xl"
                      style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
                    >
                      Following
                    </h3>
                    <button
                      onClick={() => onNavigate('following-manage')}
                      className="text-sm text-primary hover:underline"
                    >
                      Manage all →
                    </button>
                  </div>
                  {followedCreators.length === 0 ? (
                    <div className="p-6 bg-muted/30 rounded-xl text-sm text-muted-foreground border border-border/50">
                      You are not following anyone yet. Start with a suggestion below.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {followedCreators.map((creator) => (
                        <div
                          key={creator.authorId}
                          className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border/50 hover:border-primary/20 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full overflow-hidden bg-muted">
                              <ImageWithFallback
                                src={creator.avatar}
                                alt={creator.author}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <div className="font-medium">{creator.author}</div>
                              <div className="text-xs text-muted-foreground">
                                {creator.skinType}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleFollow(creator.authorId)}
                            className={ghostButton}
                          >
                            <UserMinus className="w-4 h-4" />
                            Unfollow
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {suggestedCreators.length > 0 && (
                  <section>
                    <h3
                      className="text-xl mb-3"
                      style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
                    >
                      Suggested
                    </h3>
                    <div className="space-y-3">
                      {suggestedCreators.map((creator) => (
                        <div
                          key={creator.authorId}
                          className="flex items-center justify-between p-4 bg-card rounded-2xl border border-border/50 hover:border-primary/20 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-full overflow-hidden bg-muted">
                              <ImageWithFallback
                                src={creator.avatar}
                                alt={creator.author}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <div className="font-medium">{creator.author}</div>
                              <div className="text-xs text-muted-foreground">
                                {creator.skinType}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleToggleFollow(creator.authorId)}
                            className="px-3 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-all text-sm flex items-center gap-1.5 active:scale-[0.98]"
                          >
                            <UserPlus className="w-4 h-4" />
                            Follow
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
