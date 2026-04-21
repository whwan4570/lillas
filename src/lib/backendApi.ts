const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8787/api';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  skinType: string;
  avatar: string;
  emailVerified: boolean;
}

export interface SkinTestAnswersPayload {
  skinType: string;
  concerns: string[];
  sensitivity: string;
  routine: string;
  budget: string;
  preferredIngredients: string[];
  avoidIngredients: string[];
  preferredBrands: string[];
}

export interface ProductAttachment {
  productId: number;
  name: string;
  brand: string;
  image: string;
  fitScore: number;
  reasons: string[];
  warning: string | null;
}

export interface CommentItem {
  id: number;
  authorId: string;
  author: string;
  avatar: string;
  content: string;
  createdAt: string;
}

export interface CommunityPost {
  id: number;
  authorId: string;
  author: string;
  avatar: string;
  skinType: string;
  timeAgo: string;
  title: string;
  content: string;
  images: string[];
  likes: number;
  comments: number;
  tags: string[];
  isLiked: boolean;
  isSaved: boolean;
  sponsored: boolean;
  productAttachments?: ProductAttachment[];
  commentItems?: CommentItem[];
}

export interface CreatorItem {
  authorId: string;
  author: string;
  skinType: string;
  avatar: string;
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
}

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body == null ? undefined : JSON.stringify(options.body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }
  return payload as T;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  skinType: string;
}) {
  return apiRequest<{ token: string; user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: input
  });
}

export async function login(input: { email: string; password: string }) {
  return apiRequest<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: input
  });
}

export async function getMe(token: string) {
  return apiRequest<{ user: AuthUser }>('/auth/me', { token });
}

export async function updateMe(
  token: string,
  payload: { name?: string; skinType?: string; avatar?: string }
) {
  return apiRequest<{ user: AuthUser }>('/auth/me', {
    method: 'PATCH',
    token,
    body: payload
  });
}

export async function getSavedProducts(token: string) {
  return apiRequest<{ productIds: number[] }>('/user/saved', { token });
}

export async function setSavedProducts(token: string, productIds: number[]) {
  return apiRequest<{ productIds: number[] }>('/user/saved', {
    method: 'POST',
    token,
    body: { productIds }
  });
}

export async function getRecentProducts(token: string) {
  return apiRequest<{ productIds: number[] }>('/user/recents', { token });
}

export async function recordRecentProduct(token: string, productId: number) {
  return apiRequest<{ productIds: number[] }>('/user/recents', {
    method: 'POST',
    token,
    body: { productId }
  });
}

export async function getCommunityFeed(token?: string | null) {
  return apiRequest<{
    posts: CommunityPost[];
    creators: CreatorItem[];
    followingAuthorIds: string[];
  }>('/community/feed', { token: token ?? null });
}

export async function createCommunityPost(
  token: string,
  payload: {
    title: string;
    content: string;
    productAttachments: ProductAttachment[];
    images?: string[];
  }
) {
  return apiRequest<{ post: CommunityPost }>('/community/posts', {
    method: 'POST',
    token,
    body: payload
  });
}

export async function togglePostLike(token: string, postId: number) {
  return apiRequest<{ post: CommunityPost }>(`/community/posts/${postId}/like`, {
    method: 'POST',
    token
  });
}

export async function addPostComment(token: string, postId: number, content: string) {
  return apiRequest<{ post: CommunityPost }>(`/community/posts/${postId}/comments`, {
    method: 'POST',
    token,
    body: { content }
  });
}

export async function toggleFollow(token: string, authorId: string) {
  return apiRequest<{ followingAuthorIds: string[] }>(`/community/follow/${encodeURIComponent(authorId)}`, {
    method: 'POST',
    token
  });
}

export async function getSkinTest(token: string) {
  return apiRequest<{ answers: SkinTestAnswersPayload | null }>('/user/skin-test', { token });
}

export async function saveSkinTest(token: string, answers: SkinTestAnswersPayload) {
  return apiRequest<{ answers: SkinTestAnswersPayload; user: AuthUser }>('/user/skin-test', {
    method: 'POST',
    token,
    body: { answers }
  });
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ ok: true; devResetToken?: string; devResetUrl?: string }>(
    '/auth/password/request-reset',
    {
      method: 'POST',
      body: { email }
    }
  );
}

export async function resetPassword(token: string, password: string) {
  return apiRequest<{ token: string; user: AuthUser }>('/auth/password/reset', {
    method: 'POST',
    body: { token, password }
  });
}

export async function requestEmailVerify(token: string) {
  return apiRequest<{
    ok: true;
    alreadyVerified?: boolean;
    devVerifyToken?: string;
    devVerifyUrl?: string;
  }>('/auth/email/request-verify', {
    method: 'POST',
    token
  });
}

export async function verifyEmail(verifyToken: string) {
  return apiRequest<{ user: AuthUser }>('/auth/email/verify', {
    method: 'POST',
    body: { token: verifyToken }
  });
}
