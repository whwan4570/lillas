import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart,
  MessageCircle,
  TrendingUp,
  Users,
  Send,
  UserPlus,
  UserMinus,
  Plus,
  Search,
  X,
  ImagePlus
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ImageWithFallback } from '../ImageWithFallback';
import type { SkinTestAnswers } from '../../types';
import { getSeedCatalogProducts, type SeedCatalogProduct } from '../../../data/catalogSeed';
import {
  buildUserProfile,
  explainProduct,
  ingredientMap,
  scoreProduct,
  type Product
} from '../../../lib/recommendationEngine';
import {
  addPostComment,
  createCommunityPost,
  getCommunityFeed,
  toggleFollow,
  togglePostLike,
  type AuthUser,
  type CommunityPost,
  type CreatorItem,
  type ProductAttachment
} from '../../../lib/backendApi';

interface CommunityPageProps {
  onNavigate: (page: string) => void;
  onSelectProduct: (productId: number, targetPage?: string) => void;
  skinTestAnswers: SkinTestAnswers;
  authToken: string | null;
  authUser: AuthUser | null;
  onRequireLogin: (onSuccess?: () => void) => void;
}

type PendingIntent =
  | { type: 'toggleFollow'; authorId: string }
  | { type: 'toggleLike'; postId: number }
  | { type: 'comment'; postId: number }
  | { type: 'createPost' }
  | null;

function toEngineProduct(product: SeedCatalogProduct): Product {
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
    tags: [product.category]
  };
}

export function CommunityPage({
  onNavigate,
  onSelectProduct,
  skinTestAnswers,
  authToken,
  authUser,
  onRequireLogin
}: CommunityPageProps) {
  const [selectedFilter, setSelectedFilter] = useState('for-you');
  const [draftContent, setDraftContent] = useState('');
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [infoProduct, setInfoProduct] = useState<ProductAttachment | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<ProductAttachment[]>([]);
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [creators, setCreators] = useState<CreatorItem[]>([]);
  const [followingAuthorIds, setFollowingAuthorIds] = useState<string[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);

  const userProfile = useMemo(() => buildUserProfile(skinTestAnswers), [skinTestAnswers]);
  const catalogProducts = useMemo(() => getSeedCatalogProducts(), []);

  const loadFeed = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);
      const result = await getCommunityFeed(authToken);
      setPosts(result.posts);
      setCreators(result.creators);
      setFollowingAuthorIds(result.followingAuthorIds);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load community feed');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [authToken]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadFeed({ silent: true });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [authToken]);

  const preferredSkinType = skinTestAnswers.skinType?.toLowerCase() ?? '';

  const filters = [
    { value: 'for-you', label: 'For You', icon: <Users className="w-4 h-4" /> },
    { value: 'following', label: 'Following', icon: <Heart className="w-4 h-4" /> },
    { value: 'trending', label: 'Trending', icon: <TrendingUp className="w-4 h-4" /> },
    { value: 'questions', label: 'Questions', icon: <MessageCircle className="w-4 h-4" /> }
  ];

  const buildAttachment = (product: SeedCatalogProduct): ProductAttachment => {
    const recommendation = scoreProduct(toEngineProduct(product), ingredientMap, userProfile);
    const explanation = explainProduct(toEngineProduct(product), ingredientMap, userProfile);
    return {
      productId: product.id,
      name: product.name,
      brand: product.brand,
      image: product.image ?? '',
      fitScore: recommendation.finalScore,
      reasons: explanation.reasons.length ? explanation.reasons : ['General profile fit for your skin'],
      warning: explanation.warnings[0] ?? null
    };
  };

  const searchedProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    const candidates = catalogProducts.filter(
      (product) => !selectedProducts.some((selected) => selected.productId === product.id)
    );
    if (!query) return candidates.slice(0, 6);
    return candidates
      .filter((product) =>
        `${product.name} ${product.brand} ${product.categoryLabel}`.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [catalogProducts, productQuery, selectedProducts]);

  const filteredPosts = useMemo(() => {
    const copy = [...posts];
    if (selectedFilter === 'following') {
      return copy.filter((post) => followingAuthorIds.includes(post.authorId));
    }
    if (selectedFilter === 'trending') {
      return copy.sort((a, b) => b.likes + b.comments - (a.likes + a.comments));
    }
    if (selectedFilter === 'questions') {
      return copy.filter((post) => post.tags.includes('Question'));
    }
    return copy.sort((a, b) => {
      const aFollow = followingAuthorIds.includes(a.authorId) ? 1 : 0;
      const bFollow = followingAuthorIds.includes(b.authorId) ? 1 : 0;
      if (aFollow !== bFollow) return bFollow - aFollow;
      const aSkin = preferredSkinType && a.skinType.toLowerCase().includes(preferredSkinType) ? 1 : 0;
      const bSkin = preferredSkinType && b.skinType.toLowerCase().includes(preferredSkinType) ? 1 : 0;
      if (aSkin !== bSkin) return bSkin - aSkin;
      return b.likes + b.comments - (a.likes + a.comments);
    });
  }, [posts, selectedFilter, followingAuthorIds, preferredSkinType]);

  const upsertPost = (nextPost: CommunityPost) => {
    setPosts((prev) => prev.map((post) => (post.id === nextPost.id ? nextPost : post)));
  };

  const handleRequireLogin = (intent: PendingIntent) => {
    setPendingIntent(intent);
    onRequireLogin();
  };

  const handleToggleFollow = async (authorId: string) => {
    if (!authToken) return handleRequireLogin({ type: 'toggleFollow', authorId });
    if (authUser?.id === authorId) return;
    try {
      const result = await toggleFollow(authToken, authorId);
      setFollowingAuthorIds(result.followingAuthorIds);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Failed to update follow');
    }
  };

  const handleToggleLike = async (postId: number) => {
    if (!authToken) return handleRequireLogin({ type: 'toggleLike', postId });
    try {
      const result = await togglePostLike(authToken, postId);
      upsertPost(result.post);
    } catch (likeError) {
      setError(likeError instanceof Error ? likeError.message : 'Failed to update like');
    }
  };

  const handleAddComment = async (postId: number) => {
    if (!authToken) return handleRequireLogin({ type: 'comment', postId });
    const content = (commentDrafts[postId] ?? '').trim();
    if (!content) return;
    try {
      const result = await addPostComment(authToken, postId, content);
      upsertPost(result.post);
      setCommentDrafts((prev) => ({ ...prev, [postId]: '' }));
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : 'Failed to add comment');
    }
  };

  const handleAddProductToDraft = (product: SeedCatalogProduct) => {
    if (selectedProducts.some((selected) => selected.productId === product.id)) return;
    const next = [...selectedProducts, buildAttachment(product)];
    setSelectedProducts(next.slice(0, 3));
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const handleSelectImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageError(null);
    const maxTotal = 4;
    const maxSize = 2 * 1024 * 1024;
    const remaining = Math.max(0, maxTotal - draftImages.length);
    if (remaining === 0) {
      setImageError('You can attach up to 4 images.');
      return;
    }
    const candidates = Array.from(files).slice(0, remaining);
    try {
      const nextImages: string[] = [];
      for (const file of candidates) {
        if (!file.type.startsWith('image/')) {
          setImageError('Only image files are allowed.');
          continue;
        }
        if (file.size > maxSize) {
          setImageError(`"${file.name}" is larger than 2MB.`);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        if (dataUrl) nextImages.push(dataUrl);
      }
      if (nextImages.length === 0) return;
      setDraftImages((prev) => [...prev, ...nextImages].slice(0, maxTotal));
    } catch (readError) {
      setImageError(readError instanceof Error ? readError.message : 'Failed to read image');
    }
  };

  const handleRemoveImage = (index: number) => {
    setDraftImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreatePost = async () => {
    if (!authToken) return handleRequireLogin({ type: 'createPost' });
    if (!draftContent.trim() && selectedProducts.length === 0 && draftImages.length === 0) return;
    try {
      const result = await createCommunityPost(authToken, {
        title: selectedProducts.length ? `My routine note with ${selectedProducts[0].name}` : 'My skincare note',
        content: draftContent.trim(),
        productAttachments: selectedProducts,
        images: draftImages
      });
      setPosts((prev) => [result.post, ...prev]);
      setDraftContent('');
      setSelectedProducts([]);
      setProductQuery('');
      setInfoProduct(null);
      setIsProductPickerOpen(false);
      setDraftImages([]);
      setImageError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : 'Failed to create post');
    }
  };

  useEffect(() => {
    if (!authToken || !pendingIntent) return;
    const intent = pendingIntent;
    setPendingIntent(null);

    if (intent.type === 'toggleFollow') void handleToggleFollow(intent.authorId);
    if (intent.type === 'toggleLike') void handleToggleLike(intent.postId);
    if (intent.type === 'comment') void handleAddComment(intent.postId);
    if (intent.type === 'createPost') void handleCreatePost();
  }, [authToken, pendingIntent]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-card to-muted/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-4xl lg:text-5xl mb-4" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
            Community
          </h1>
          <p className="text-muted-foreground text-lg">
            Backend active: posts, comments, likes, follows, and account sync are now API-driven.
          </p>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>

        <div className="mb-8">
          <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm">
            <textarea
              placeholder="Share your skincare journey, ask a question, or post a review..."
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              className="w-full min-h-[100px] p-4 bg-muted/50 rounded-xl border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />

            {draftImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {draftImages.map((src, index) => (
                  <div key={index} className="relative group aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                    <img src={src} alt={`Attachment ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center opacity-80 group-hover:opacity-100 transition"
                      aria-label={`Remove image ${index + 1}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {imageError && <p className="text-xs text-destructive mt-2">{imageError}</p>}

            {selectedProducts.length > 0 && (
              <div className="mt-4 space-y-3">
                {selectedProducts.map((product) => (
                  <div key={product.productId} className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                      <ImageWithFallback src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{product.brand} · {product.name}</div>
                      <div className="text-xs text-primary mt-1">Fit score {product.fitScore.toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{product.reasons[0] ?? 'General fit'}</div>
                    </div>
                    <button
                      onClick={() => setSelectedProducts((prev) => prev.filter((v) => v.productId !== product.productId))}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isProductPickerOpen && (
              <div className="mt-4 p-4 rounded-xl border border-border bg-muted/20">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search products from our catalog..."
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {searchedProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-card">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.brand}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setInfoProduct(buildAttachment(product))}
                          className="px-3 py-1.5 rounded-full border border-border hover:border-primary/40 text-xs"
                        >
                          Info
                        </button>
                        <button
                          onClick={() => handleAddProductToDraft(product)}
                          className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs hover:bg-forest"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleSelectImages(e.target.files);
                if (e.target) e.target.value = '';
              }}
            />

            <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {draftImages.length > 0 && `${draftImages.length}/4 images · `}
                Max 2MB per image.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={draftImages.length >= 4}
                  className="px-4 py-2 rounded-full border border-border hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2 transition-all"
                >
                  <ImagePlus className="w-4 h-4" />
                  Add Image
                </button>
                <button
                  type="button"
                  onClick={() => setIsProductPickerOpen((prev) => !prev)}
                  className="px-4 py-2 rounded-full border border-border hover:border-primary/30 hover:bg-primary/5 text-sm flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Product
                </button>
                <button
                  onClick={handleCreatePost}
                  className="px-6 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest active:scale-[0.98] transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
                >
                  <Send className="w-4 h-4" />
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-8 overflow-x-auto pb-2">
          {filters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setSelectedFilter(filter.value)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full whitespace-nowrap transition-all ${
                selectedFilter === filter.value ? 'bg-primary text-primary-foreground' : 'bg-card border border-border hover:border-primary/30'
              }`}
            >
              {filter.icon}
              {filter.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading feed...</div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {filteredPosts.map((post, index) => (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="bg-card rounded-2xl p-6 border border-border/50"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-muted">
                        <ImageWithFallback src={post.avatar} alt={post.author} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <h3 className="font-medium">{post.author}</h3>
                        <div className="text-xs text-muted-foreground">{post.skinType} · {post.timeAgo}</div>
                      </div>
                    </div>
                    {!post.sponsored && (
                      <button
                        onClick={() => handleToggleFollow(post.authorId)}
                        className="px-3 py-1.5 text-xs rounded-full border border-border hover:border-primary/40 flex items-center gap-1"
                      >
                        {followingAuthorIds.includes(post.authorId) ? <UserMinus className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                        {followingAuthorIds.includes(post.authorId) ? 'Unfollow' : 'Follow'}
                      </button>
                    )}
                  </div>

                  <h2 className="text-xl mb-2" style={{ fontFamily: 'var(--font-serif)' }}>{post.title}</h2>
                  <p className="text-muted-foreground mb-4 whitespace-pre-wrap">{post.content}</p>

                  {post.images?.length ? (
                    <div
                      className={`mb-4 grid gap-2 ${
                        post.images.length === 1
                          ? 'grid-cols-1'
                          : post.images.length === 2
                            ? 'grid-cols-2'
                            : 'grid-cols-2 sm:grid-cols-3'
                      }`}
                    >
                      {post.images.map((image, imageIndex) => (
                        <div
                          key={imageIndex}
                          className={`overflow-hidden rounded-xl bg-muted border border-border/50 ${
                            post.images.length === 1 ? 'aspect-[16/10]' : 'aspect-square'
                          }`}
                        >
                          <ImageWithFallback
                            src={image}
                            alt={`${post.title} ${imageIndex + 1}`}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {post.productAttachments?.length ? (
                    <div className="mb-4 space-y-3">
                      {post.productAttachments.map((product) => (
                        <div key={product.productId} className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
                          <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                            <ImageWithFallback src={product.image} alt={product.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium">{product.brand} · {product.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">{product.reasons[0] ?? 'General fit'}</div>
                          </div>
                          <button
                            onClick={() => onSelectProduct(product.productId, 'product-detail')}
                            className="px-3 py-1.5 rounded-full border border-border hover:border-primary/40 text-xs"
                          >
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-6 pt-4 border-t border-border">
                    <button onClick={() => handleToggleLike(post.id)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                      <Heart className={`w-5 h-5 ${post.isLiked ? 'fill-primary text-primary' : ''}`} />
                      <span>{post.likes}</span>
                    </button>
                    <span className="text-sm text-muted-foreground">{post.comments} comments</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {post.commentItems?.map((comment) => (
                      <div key={comment.id} className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
                          {comment.avatar ? (
                            <ImageWithFallback
                              src={comment.avatar}
                              alt={comment.author}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-sage to-primary flex items-center justify-center text-[11px] text-primary-foreground font-medium">
                              {comment.author?.slice(0, 1).toUpperCase() ?? '?'}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 bg-muted/40 rounded-2xl px-3.5 py-2">
                          <div className="text-xs font-medium text-foreground">
                            {comment.author}
                          </div>
                          <div className="text-sm text-foreground/90 break-words">{comment.content}</div>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2.5 pt-1">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
                        {authUser?.avatar ? (
                          <ImageWithFallback
                            src={authUser.avatar}
                            alt={authUser.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-sage to-primary flex items-center justify-center text-[11px] text-primary-foreground font-medium">
                            {authUser?.name?.slice(0, 1).toUpperCase() ?? '?'}
                          </div>
                        )}
                      </div>
                      <input
                        value={commentDrafts[post.id] ?? ''}
                        onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void handleAddComment(post.id);
                          }
                        }}
                        placeholder={authUser ? 'Write a comment...' : 'Login to comment...'}
                        className="flex-1 px-3.5 py-2 rounded-full border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                      />
                      <button
                        onClick={() => handleAddComment(post.id)}
                        className="px-3.5 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest text-xs font-medium transition-all flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Post
                      </button>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>

            <aside className="space-y-6">
              <div className="bg-card rounded-2xl p-6 border border-border/50 sticky top-24">
                <h3 className="text-xl mb-3" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>Account Sync</h3>
                <div className="text-sm text-muted-foreground mb-2">Status: {authUser ? `Signed in as ${authUser.name}` : 'Guest'}</div>
                {!authUser && (
                  <button
                    onClick={() => onRequireLogin()}
                    className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest text-sm"
                  >
                    Login / Signup
                  </button>
                )}
                <div className="text-sm text-muted-foreground mt-4">Following: {followingAuthorIds.length}</div>
                <button onClick={() => onNavigate('following-manage')} className="mt-3 text-sm text-primary hover:underline">
                  Open Following Manage
                </button>
              </div>
              <div className="bg-card rounded-2xl p-6 border border-border/50">
                <h3 className="text-xl mb-3" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>Creators</h3>
                <div className="space-y-2">
                  {creators.slice(0, 5).map((creator) => (
                    <div key={creator.authorId} className="text-sm text-muted-foreground">
                      {creator.author} · {creator.skinType}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      <AnimatePresence>
        {infoProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
            onClick={() => setInfoProduct(null)}
          >
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
                    Product Fit Info
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">{infoProduct.brand} · {infoProduct.name}</p>
                </div>
                <button onClick={() => setInfoProduct(null)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
                <div className="text-sm text-primary font-medium">Fit score {infoProduct.fitScore.toFixed(2)}</div>
                <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                  {infoProduct.reasons.map((reason) => (
                    <li key={reason}>- {reason}</li>
                  ))}
                </ul>
                {infoProduct.warning && <div className="text-sm text-amber-700 mt-2">Caution: {infoProduct.warning}</div>}
              </div>
              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={() => onSelectProduct(infoProduct.productId, 'product-detail')}
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest text-sm"
                >
                  View Product
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
