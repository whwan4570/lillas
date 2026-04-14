import { useMemo, useState } from 'react';
import { Heart, MessageCircle, Bookmark, TrendingUp, Users, Image, Send, UserPlus, UserMinus } from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../ImageWithFallback';
import type { SkinTestAnswers } from '../../types';

interface CommunityPageProps {
  onNavigate: (page: string) => void;
  skinTestAnswers: SkinTestAnswers;
}

const FOLLOWING_STORAGE_KEY = 'lillasy_community_following';

export function CommunityPage({ onNavigate, skinTestAnswers }: CommunityPageProps) {
  const [selectedFilter, setSelectedFilter] = useState('for-you');
  const [followingAuthorIds, setFollowingAuthorIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(FOLLOWING_STORAGE_KEY) ?? '[]';
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  });

  const posts = [
    {
      id: 1,
      authorId: 'sarah-kim',
      author: 'Sarah Kim',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
      skinType: 'Dry · Sensitive',
      timeAgo: '2 hours ago',
      title: 'My 3-month glow-up journey with hydrating essences',
      content:
        "After struggling with dehydrated skin for years, I finally found the perfect routine. The key was layering multiple hydrating products and being consistent. Here's what worked for me...",
      images: [
        'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&h=400&fit=crop',
        'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=400&h=400&fit=crop'
      ],
      likes: 234,
      comments: 48,
      tags: ['Hydration', 'Before & After', 'Dry Skin'],
      isLiked: false,
      isSaved: false,
      sponsored: false
    },
    {
      id: 2,
      authorId: 'emma-chen',
      author: 'Emma Chen',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
      skinType: 'Combination · Acne-Prone',
      timeAgo: '5 hours ago',
      title: 'Vitamin C serums: Which one is actually worth it?',
      content:
        "I've tested 12 different vitamin C serums over the past year. Here's my honest breakdown of which ones delivered results and which ones were just hype...",
      images: [
        'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=400&fit=crop'
      ],
      likes: 512,
      comments: 127,
      tags: ['Vitamin C', 'Product Review', 'Brightening'],
      isLiked: true,
      isSaved: true,
      sponsored: false
    },
    {
      id: 3,
      authorId: 'jessica-park',
      author: 'Jessica Park',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
      skinType: 'Oily · Large Pores',
      timeAgo: '1 day ago',
      title: 'Help! Niacinamide vs Retinol for texture',
      content:
        "I'm torn between starting with niacinamide or retinol for my textured skin and large pores. Has anyone tried both? What worked better for you?",
      images: [],
      likes: 89,
      comments: 56,
      tags: ['Question', 'Texture', 'Ingredients'],
      isLiked: false,
      isSaved: false,
      sponsored: false
    },
    {
      id: 4,
      authorId: 'mia-rodriguez',
      author: 'Mia Rodriguez',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
      skinType: 'Sensitive · Rosacea',
      timeAgo: '1 day ago',
      title: 'My gentle skincare routine for sensitive skin',
      content:
        'Living with rosacea has taught me that less is more. Here are the 5 products that have completely transformed my reactive skin...',
      images: [
        'https://images.unsplash.com/photo-1556228852-80c7ca4b1f40?w=600&h=400&fit=crop'
      ],
      likes: 342,
      comments: 73,
      tags: ['Sensitive Skin', 'Routine', 'Rosacea'],
      isLiked: false,
      isSaved: true,
      sponsored: false
    },
    {
      id: 5,
      authorId: 'brand-partner-1',
      author: 'lillasy Partner',
      avatar: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=100&h=100&fit=crop',
      skinType: 'Brand',
      timeAgo: 'Sponsored',
      title: 'Ad: 7-day barrier reset set',
      content: 'Curated gentle routine for dry/sensitive users. Limited time partner deal.',
      images: ['https://images.unsplash.com/photo-1556228852-80c7ca4b1f40?w=600&h=400&fit=crop'],
      likes: 22,
      comments: 4,
      tags: ['Ad', 'Barrier', 'Routine'],
      isLiked: false,
      isSaved: false,
      sponsored: true
    }
  ];

  const filters = [
    { value: 'for-you', label: 'For You', icon: <Users className="w-4 h-4" /> },
    { value: 'following', label: 'Following', icon: <Heart className="w-4 h-4" /> },
    { value: 'trending', label: 'Trending', icon: <TrendingUp className="w-4 h-4" /> },
    { value: 'questions', label: 'Questions', icon: <MessageCircle className="w-4 h-4" /> },
    { value: 'reviews', label: 'Reviews', icon: <Heart className="w-4 h-4" /> }
  ];

  const popularTopics = [
    { name: 'Hydration', count: 1247 },
    { name: 'Anti-Aging', count: 982 },
    { name: 'Acne', count: 856 },
    { name: 'Sensitive Skin', count: 734 },
    { name: 'Vitamin C', count: 623 },
    { name: 'Retinol', count: 589 }
  ];

  const preferredSkinType = skinTestAnswers.skinType?.toLowerCase() ?? '';

  const feedPosts = useMemo(() => {
    const copy = [...posts];
    if (selectedFilter === 'following') {
      return copy.filter((post) => followingAuthorIds.includes(post.authorId));
    }
    if (selectedFilter === 'trending') {
      return copy
        .filter((post) => !post.sponsored)
        .sort((a, b) => b.likes + b.comments - (a.likes + a.comments));
    }
    if (selectedFilter === 'questions') {
      return copy.filter((post) => post.tags.includes('Question'));
    }
    if (selectedFilter === 'reviews') {
      return copy.filter((post) => post.tags.includes('Product Review') || post.tags.includes('Before & After'));
    }

    return copy.sort((a, b) => {
      const aFollow = followingAuthorIds.includes(a.authorId) ? 1 : 0;
      const bFollow = followingAuthorIds.includes(b.authorId) ? 1 : 0;
      if (aFollow !== bFollow) return bFollow - aFollow;

      const aSkin = preferredSkinType && a.skinType.toLowerCase().includes(preferredSkinType) ? 1 : 0;
      const bSkin = preferredSkinType && b.skinType.toLowerCase().includes(preferredSkinType) ? 1 : 0;
      if (aSkin !== bSkin) return bSkin - aSkin;

      const aTrend = a.likes + a.comments;
      const bTrend = b.likes + b.comments;
      if (aTrend !== bTrend) return bTrend - aTrend;

      return Number(a.sponsored) - Number(b.sponsored);
    });
  }, [posts, selectedFilter, followingAuthorIds, preferredSkinType]);

  const toggleFollow = (authorId: string) => {
    setFollowingAuthorIds((prev) => {
      const next = prev.includes(authorId) ? prev.filter((id) => id !== authorId) : [...prev, authorId];
      window.localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-card to-muted/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1
            className="text-4xl lg:text-5xl mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
          >
            Community
          </h1>
          <p className="text-muted-foreground text-lg">
            Follow creators to prioritize their posts, and discover skincare trends and personalized content.
          </p>
        </div>

        <div className="mb-8">
          <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-sage flex-shrink-0" />
              <div className="flex-1">
                <textarea
                  placeholder="Share your skincare journey, ask a question, or post a review..."
                  className="w-full min-h-[100px] p-4 bg-muted/50 rounded-xl border border-border resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between mt-4">
                  <button className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Image className="w-4 h-4" />
                    Add Images
                  </button>
                  <button className="px-6 py-2 bg-primary text-primary-foreground rounded-full hover:bg-forest transition-all flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Post
                  </button>
                </div>
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
                selectedFilter === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border hover:border-primary/30'
              }`}
            >
              {filter.icon}
              {filter.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {feedPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-card rounded-2xl p-6 border border-border/50 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex-shrink-0">
                    <ImageWithFallback
                      src={post.avatar}
                      alt={post.author}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium">{post.author}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{post.skinType}</span>
                          <span>·</span>
                          <span>{post.timeAgo}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!post.sponsored && (
                          <button
                            onClick={() => toggleFollow(post.authorId)}
                            className="px-3 py-1.5 text-xs rounded-full border border-border hover:border-primary/40 flex items-center gap-1"
                          >
                            {followingAuthorIds.includes(post.authorId) ? (
                              <>
                                <UserMinus className="w-3 h-3" />
                                Unfollow
                              </>
                            ) : (
                              <>
                                <UserPlus className="w-3 h-3" />
                                Follow
                              </>
                            )}
                          </button>
                        )}
                        <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                          <Bookmark
                            className={`w-5 h-5 ${
                              post.isSaved ? 'fill-primary text-primary' : 'text-muted-foreground'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <h2
                    className="text-xl mb-2 cursor-pointer hover:text-primary transition-colors"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">{post.content}</p>
                </div>

                {post.images.length > 0 && (
                  <div
                    className={`grid gap-2 mb-4 rounded-xl overflow-hidden ${
                      post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                    }`}
                  >
                    {post.images.map((image, i) => (
                      <div
                        key={i}
                        className={`aspect-video overflow-hidden bg-muted ${
                          post.images.length === 1 ? 'aspect-[2/1]' : ''
                        }`}
                      >
                        <ImageWithFallback
                          src={image}
                          alt=""
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-4">
                  {post.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-xs px-3 py-1 bg-primary/10 text-primary rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-6 pt-4 border-t border-border">
                  <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <Heart
                      className={`w-5 h-5 ${
                        post.isLiked ? 'fill-primary text-primary' : ''
                      }`}
                    />
                    <span>{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <MessageCircle className="w-5 h-5" />
                    <span>{post.comments}</span>
                  </button>
                  <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors ml-auto">
                    Share
                  </button>
                </div>
              </motion.article>
            ))}
          </div>

          <aside className="space-y-6">
            <div className="bg-card rounded-2xl p-6 border border-border/50 sticky top-24">
              <h3
                className="text-xl mb-4"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Your Feed Context
              </h3>
              <div className="space-y-2 mb-6">
                <div className="text-sm text-muted-foreground">Skin Type</div>
                <div className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm">
                  {skinTestAnswers.skinType || 'Not set'}
                </div>
                <div className="text-sm text-muted-foreground pt-2">Following</div>
                <div className="text-sm">{followingAuthorIds.length} creators</div>
              </div>

              <h3
                className="text-xl mb-4"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Trending Topics
              </h3>
              <div className="space-y-3">
                {popularTopics.map((topic, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  >
                    <span className="font-medium">#{topic.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {topic.count.toLocaleString()} posts
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-2xl p-6 border border-border/50">
              <h3
                className="text-xl mb-3"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Sponsored
              </h3>
              <div className="p-4 rounded-xl bg-muted/40 border border-border text-sm">
                <div className="font-medium mb-1">Ad · Olive Young Week</div>
                <p className="text-muted-foreground mb-3">
                  K-beauty bundles for hydration and barrier care.
                </p>
                <button
                  onClick={() => onNavigate('products')}
                  className="px-4 py-2 text-xs bg-primary text-primary-foreground rounded-full hover:bg-forest transition-all"
                >
                  View Deals
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary/10 to-sage/10 rounded-2xl p-6 border border-primary/20">
              <h3
                className="text-xl mb-3"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Community Guidelines
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">✓</span>
                  <span>Be respectful and supportive</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">✓</span>
                  <span>Share honest experiences</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">✓</span>
                  <span>Cite sources for claims</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">✓</span>
                  <span>No medical advice</span>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
