import { useMemo, useState } from 'react';
import {
  Heart,
  Clock,
  MessageCircle,
  Settings,
  TrendingUp,
  Package,
  Star,
  Sparkles,
  UserMinus,
  UserPlus
} from 'lucide-react';
import { motion } from 'motion/react';
import { ImageWithFallback } from '../ImageWithFallback';

interface DashboardPageProps {
  onNavigate: (page: string) => void;
}

const FOLLOWING_STORAGE_KEY = 'lillasy_community_following';

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [selectedTab, setSelectedTab] = useState('saved');
  const [followingAuthorIds, setFollowingAuthorIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(FOLLOWING_STORAGE_KEY) ?? '[]';
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  });

  const user = {
    name: 'Jessica Park',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
    skinType: 'Dry · Sensitive',
    concerns: ['Hydration', 'Fine Lines', 'Redness'],
    routine: 'Moderate',
    memberSince: 'January 2025'
  };

  const savedProducts = [
    {
      name: 'Hydrating Essence',
      brand: 'Glow Lab',
      price: 42,
      image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=300&h=300&fit=crop',
      matchScore: 98
    },
    {
      name: 'Vitamin C Serum',
      brand: 'Radiance Co',
      price: 38,
      image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=300&h=300&fit=crop',
      matchScore: 95
    },
    {
      name: 'Calming Moisturizer',
      brand: 'Pure Skin',
      price: 35,
      image: 'https://images.unsplash.com/photo-1556228852-80c7ca4b1f40?w=300&h=300&fit=crop',
      matchScore: 92
    },
    {
      name: 'Gentle Cleanser',
      brand: 'Clean Beauty',
      price: 28,
      image: 'https://images.unsplash.com/photo-1570554886111-e80fcca6a029?w=300&h=300&fit=crop',
      matchScore: 90
    }
  ];

  const recentlyViewed = [
    {
      name: 'Retinol Night Cream',
      brand: 'Youth Restore',
      price: 52,
      image: 'https://images.unsplash.com/photo-1571875257727-256c39da42af?w=300&h=300&fit=crop'
    },
    {
      name: 'Sunscreen SPF 50',
      brand: 'Daily Defense',
      price: 32,
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300&h=300&fit=crop'
    }
  ];

  const myPosts = [
    {
      title: 'My routine for dry, sensitive skin',
      excerpt: 'After years of trial and error, I finally found what works...',
      likes: 45,
      comments: 12,
      timeAgo: '3 days ago'
    },
    {
      title: 'Question: Hyaluronic acid percentage?',
      excerpt: 'What percentage of HA is most effective for hydration?',
      likes: 23,
      comments: 18,
      timeAgo: '1 week ago'
    }
  ];

  const creators = [
    {
      authorId: 'sarah-kim',
      author: 'Sarah Kim',
      skinType: 'Dry · Sensitive',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop'
    },
    {
      authorId: 'emma-chen',
      author: 'Emma Chen',
      skinType: 'Combination · Acne-Prone',
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop'
    },
    {
      authorId: 'jessica-park',
      author: 'Jessica Park',
      skinType: 'Oily · Large Pores',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop'
    },
    {
      authorId: 'mia-rodriguez',
      author: 'Mia Rodriguez',
      skinType: 'Sensitive · Rosacea',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop'
    }
  ];

  const followedCreators = useMemo(
    () => creators.filter((creator) => followingAuthorIds.includes(creator.authorId)),
    [creators, followingAuthorIds]
  );
  const suggestedCreators = useMemo(
    () => creators.filter((creator) => !followingAuthorIds.includes(creator.authorId)),
    [creators, followingAuthorIds]
  );

  const updateFollowing = (next: string[]) => {
    setFollowingAuthorIds(next);
    window.localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(next));
  };

  const handleUnfollow = (authorId: string) => {
    updateFollowing(followingAuthorIds.filter((id) => id !== authorId));
  };

  const handleFollow = (authorId: string) => {
    if (followingAuthorIds.includes(authorId)) return;
    updateFollowing([...followingAuthorIds, authorId]);
  };

  const stats = [
    { label: 'Products Saved', value: savedProducts.length, icon: <Heart className="w-5 h-5" /> },
    {
      label: 'Products Tried',
      value: 12,
      icon: <Package className="w-5 h-5" />
    },
    { label: 'Community Posts', value: myPosts.length, icon: <MessageCircle className="w-5 h-5" /> },
    { label: 'Average Match', value: '94%', icon: <TrendingUp className="w-5 h-5" /> }
  ];

  const tabs = [
    { id: 'saved', label: 'Saved Products', count: savedProducts.length },
    { id: 'recent', label: 'Recently Viewed', count: recentlyViewed.length },
    { id: 'posts', label: 'My Posts', count: myPosts.length },
    { id: 'following', label: 'Following', count: followedCreators.length }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-card to-muted/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-3 gap-8 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-card rounded-2xl p-8 border border-border/50 sticky top-24">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-muted mb-4 border-4 border-primary/20">
                  <ImageWithFallback
                    src={user.avatar}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h2
                  className="text-2xl mb-2"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
                >
                  {user.name}
                </h2>
                <p className="text-muted-foreground mb-4">{user.skinType}</p>
                <button className="w-full px-6 py-2 bg-primary text-primary-foreground rounded-full hover:bg-forest transition-all flex items-center justify-center gap-2 mb-3">
                  <Settings className="w-4 h-4" />
                  Edit Profile
                </button>
                <button
                  onClick={() => onNavigate('skin-test')}
                  className="w-full px-6 py-2 border-2 border-primary text-primary rounded-full hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Retake Skin Test
                </button>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Skin Concerns</div>
                  <div className="flex flex-wrap gap-2">
                    {user.concerns.map((concern, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm"
                      >
                        {concern}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Routine Level</div>
                  <div className="font-medium">{user.routine}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Member Since</div>
                  <div className="font-medium">{user.memberSince}</div>
                </div>
              </div>

              <div className="pt-6 border-t border-border">
                <div className="grid grid-cols-2 gap-4">
                  {stats.map((stat, i) => (
                    <div key={i} className="text-center p-4 bg-muted/30 rounded-xl">
                      <div className="flex justify-center text-primary mb-2">{stat.icon}</div>
                      <div
                        className="text-2xl mb-1"
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
            <div className="flex items-center gap-4 mb-6 border-b border-border">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={`pb-4 px-2 transition-all relative ${
                    selectedTab === tab.id
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {tab.label}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedTab === tab.id
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </span>
                  {selectedTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                    />
                  )}
                </button>
              ))}
            </div>

            {selectedTab === 'saved' && (
              <div className="grid sm:grid-cols-2 gap-6">
                {savedProducts.map((product, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => onNavigate('product-detail')}
                    className="group bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-border/50"
                  >
                    <div className="aspect-square overflow-hidden bg-muted relative">
                      <ImageWithFallback
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3 px-3 py-1 bg-gradient-to-r from-primary to-sage text-white rounded-full text-sm flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        {product.matchScore}%
                      </div>
                      <button className="absolute top-3 right-3 w-9 h-9 bg-card/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                        <Heart className="w-4 h-4 fill-primary text-primary" />
                      </button>
                    </div>
                    <div className="p-5">
                      <div className="text-xs text-muted-foreground mb-1">{product.brand}</div>
                      <h3
                        className="text-lg mb-3 group-hover:text-primary transition-colors"
                        style={{ fontFamily: 'var(--font-serif)' }}
                      >
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className="text-xl" style={{ fontFamily: 'var(--font-serif)' }}>
                          ${product.price}
                        </span>
                        <button className="px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-all text-sm">
                          View
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {selectedTab === 'recent' && (
              <div className="grid sm:grid-cols-2 gap-6">
                {recentlyViewed.map((product, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => onNavigate('product-detail')}
                    className="group bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer border border-border/50"
                  >
                    <div className="aspect-square overflow-hidden bg-muted relative">
                      <ImageWithFallback
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 right-3 w-9 h-9 bg-card/90 backdrop-blur-sm rounded-full flex items-center justify-center">
                        <Clock className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="text-xs text-muted-foreground mb-1">{product.brand}</div>
                      <h3
                        className="text-lg mb-3 group-hover:text-primary transition-colors"
                        style={{ fontFamily: 'var(--font-serif)' }}
                      >
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className="text-xl" style={{ fontFamily: 'var(--font-serif)' }}>
                          ${product.price}
                        </span>
                        <button className="px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-primary-foreground transition-all text-sm">
                          View
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {selectedTab === 'posts' && (
              <div className="space-y-4">
                {myPosts.map((post, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-card rounded-2xl p-6 border border-border/50 hover:shadow-lg transition-all cursor-pointer"
                  >
                    <h3
                      className="text-xl mb-2"
                      style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
                    >
                      {post.title}
                    </h3>
                    <p className="text-muted-foreground mb-4">{post.excerpt}</p>
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
                ))}
              </div>
            )}

            {selectedTab === 'following' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl mb-3" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
                    Following
                  </h3>
                  {followedCreators.length === 0 ? (
                    <div className="p-6 bg-muted/30 rounded-xl text-sm text-muted-foreground">
                      You are not following anyone yet. Go to Community and follow creators, or start here below.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {followedCreators.map((creator) => (
                        <div
                          key={creator.authorId}
                          className="flex items-center justify-between p-4 bg-card rounded-xl border border-border/50"
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
                              <div className="text-xs text-muted-foreground">{creator.skinType}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnfollow(creator.authorId)}
                            className="px-3 py-2 rounded-full border border-border hover:border-destructive/40 text-sm flex items-center gap-1"
                          >
                            <UserMinus className="w-4 h-4" />
                            Unfollow
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-xl mb-3" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
                    Suggested Creators
                  </h3>
                  <div className="space-y-3">
                    {suggestedCreators.map((creator) => (
                      <div
                        key={creator.authorId}
                        className="flex items-center justify-between p-4 bg-card rounded-xl border border-border/50"
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
                            <div className="text-xs text-muted-foreground">{creator.skinType}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleFollow(creator.authorId)}
                          className="px-3 py-2 rounded-full border border-border hover:border-primary/40 text-sm flex items-center gap-1"
                        >
                          <UserPlus className="w-4 h-4" />
                          Follow
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
