import { useEffect, useMemo, useState } from 'react';
import { UserMinus, UserPlus, Users } from 'lucide-react';
import { ImageWithFallback } from '../ImageWithFallback';
import { getCommunityFeed, toggleFollow, type AuthUser, type CreatorItem } from '../../../lib/backendApi';

interface FollowingManagePageProps {
  onNavigate: (page: string) => void;
  authToken: string | null;
  authUser: AuthUser | null;
  onRequireLogin: (onSuccess?: () => void) => void;
}

export function FollowingManagePage({
  onNavigate,
  authToken,
  authUser,
  onRequireLogin
}: FollowingManagePageProps) {
  const [creators, setCreators] = useState<CreatorItem[]>([]);
  const [followingAuthorIds, setFollowingAuthorIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingAuthorId, setPendingAuthorId] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken) return;
    getCommunityFeed(authToken)
      .then((result) => {
        setCreators(result.creators);
        setFollowingAuthorIds(result.followingAuthorIds);
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : 'Failed to load following'));
  }, [authToken]);

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
      setPendingAuthorId(authorId);
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

  useEffect(() => {
    if (!authToken || !pendingAuthorId) return;
    const next = pendingAuthorId;
    setPendingAuthorId(null);
    void handleToggleFollow(next);
  }, [authToken, pendingAuthorId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-card to-muted/30 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-4xl" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
              Following Manage
            </h1>
          </div>
          <p className="text-muted-foreground">
            Manage who you follow and tailor your community feed.
          </p>
          {!authUser && (
            <div className="mt-4">
              <button
                onClick={() => onRequireLogin()}
                className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest text-sm"
              >
                Login to manage following
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>

        <div className="mb-10 bg-card rounded-2xl border border-border/50 p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Currently following <span className="text-foreground font-medium">{followedCreators.length}</span> creators
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('community')}
              className="px-4 py-2 rounded-full border border-border hover:bg-muted transition-colors text-sm"
            >
              Go to Community
            </button>
            <button
              onClick={() => onNavigate('dashboard')}
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-colors text-sm"
            >
              Go to Account
            </button>
          </div>
        </div>

        <div className="space-y-10">
          <section>
            <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
              Following
            </h2>
            {followedCreators.length === 0 ? (
              <div className="p-6 bg-muted/30 rounded-xl text-sm text-muted-foreground border border-border/50">
                You are not following anyone yet. Follow creators below to personalize your feed.
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
                      onClick={() => handleToggleFollow(creator.authorId)}
                      disabled={!authUser}
                      className="px-3 py-2 rounded-full border border-border hover:border-destructive/40 text-sm flex items-center gap-1"
                    >
                      <UserMinus className="w-4 h-4" />
                      Unfollow
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-2xl mb-4" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
              Suggested Creators
            </h2>
            {suggestedCreators.length === 0 ? (
              <div className="p-6 bg-muted/30 rounded-xl text-sm text-muted-foreground border border-border/50">
                You already follow all suggested creators.
              </div>
            ) : (
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
                      onClick={() => handleToggleFollow(creator.authorId)}
                      disabled={!authUser}
                      className="px-3 py-2 rounded-full border border-border hover:border-primary/40 text-sm flex items-center gap-1"
                    >
                      <UserPlus className="w-4 h-4" />
                      Follow
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
