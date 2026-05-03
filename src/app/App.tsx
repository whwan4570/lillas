import { useEffect, useRef, useState } from 'react';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/pages/LandingPage';
import { SkinTestPage } from './components/pages/SkinTestPage';
import { RecommendationsPage } from './components/pages/RecommendationsPage';
import { ProductDetailPage } from './components/pages/ProductDetailPage';
import { ComparisonPage } from './components/pages/ComparisonPage';
import { CommunityPage } from './components/pages/CommunityPage';
import { DashboardPage } from './components/pages/DashboardPage';
import { FollowingManagePage } from './components/pages/FollowingManagePage';
import { AuthModal } from './components/AuthModal';
import { ProfileEditModal } from './components/ProfileEditModal';
import { PasswordResetModal } from './components/PasswordResetModal';
import { EmailVerificationBanner } from './components/EmailVerificationBanner';
import type { SkinTestAnswers } from './types';
import { buildUserProfile, type UserProfile } from '../lib/recommendationEngine';
import {
  ApiError,
  getMe,
  getRecentProducts,
  getSavedProducts,
  getSkinTest,
  login,
  recordRecentProduct,
  register,
  saveSkinTest,
  setSavedProducts as apiSetSavedProducts,
  updateMe,
  type AuthUser
} from '../lib/backendApi';

const SAVED_PRODUCTS_KEY = 'lillasy_saved_products';
const SKIN_TEST_ANSWERS_KEY = 'lillasy_skin_test_answers';
const AUTH_TOKEN_KEY = 'lillasy_auth_token';
const RECENT_PRODUCTS_KEY = 'lillasy_recent_products';
const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8787/api').replace(
  /\/api\/?$/,
  ''
);

const defaultSkinProfile: SkinTestAnswers = {
  skinType: '',
  concerns: [],
  sensitivity: '',
  routine: '',
  budget: '',
  preferredIngredients: [],
  avoidIngredients: [],
  preferredBrands: []
};

function readNumberArray(storageKey: string): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  } catch {
    return [];
  }
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedProductId, setSelectedProductId] = useState<number>(1);
  const [savedProductIds, setSavedProductIds] = useState<number[]>(() =>
    readNumberArray(SAVED_PRODUCTS_KEY)
  );
  const [recentProductIds, setRecentProductIds] = useState<number[]>(() =>
    readNumberArray(RECENT_PRODUCTS_KEY)
  );
  const [skinTestAnswers, setSkinTestAnswers] = useState<SkinTestAnswers>(() => {
    if (typeof window === 'undefined') return defaultSkinProfile;
    try {
      const raw = window.localStorage.getItem(SKIN_TEST_ANSWERS_KEY);
      return raw ? ({ ...defaultSkinProfile, ...(JSON.parse(raw) as Partial<SkinTestAnswers>) }) : defaultSkinProfile;
    } catch {
      return defaultSkinProfile;
    }
  });
  const [userProfile, setUserProfile] = useState<UserProfile>(() => buildUserProfile(defaultSkinProfile));
  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  });
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalDefaultMode, setAuthModalDefaultMode] = useState<'login' | 'signup'>('login');
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [postLoginAction, setPostLoginAction] = useState<(() => void) | null>(null);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);
  const [profileModalError, setProfileModalError] = useState<string | null>(null);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetInitialToken, setResetInitialToken] = useState<string | null>(null);
  const [resetDefaultEmail, setResetDefaultEmail] = useState<string>('');
  const [pendingVerifyToken, setPendingVerifyToken] = useState<string | null>(null);

  const savedHydratedRef = useRef(false);
  const recentHydratedRef = useRef(false);
  const skinTestHydratedRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(SAVED_PRODUCTS_KEY, JSON.stringify(savedProductIds));
  }, [savedProductIds]);

  useEffect(() => {
    window.localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(recentProductIds));
  }, [recentProductIds]);

  useEffect(() => {
    window.localStorage.setItem(SKIN_TEST_ANSWERS_KEY, JSON.stringify(skinTestAnswers));
    setUserProfile(buildUserProfile(skinTestAnswers));
  }, [skinTestAnswers]);

  useEffect(() => {
    if (authToken) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  }, [authToken]);

  useEffect(() => {
    if (!authToken) {
      setAuthUser(null);
      savedHydratedRef.current = false;
      recentHydratedRef.current = false;
      skinTestHydratedRef.current = false;
      return;
    }
    let cancelled = false;
    getMe(authToken)
      .then((result) => {
        if (cancelled) return;
        setAuthUser(result.user);
      })
      .catch((error) => {
        if (cancelled) return;
        // Only force logout when the token is truly invalid.
        if (error instanceof ApiError && error.status === 401) {
          setAuthToken(null);
          setAuthUser(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    (async () => {
      try {
        const [savedResult, recentResult] = await Promise.all([
          getSavedProducts(authToken),
          getRecentProducts(authToken)
        ]);
        if (cancelled) return;
        const localSaved = readNumberArray(SAVED_PRODUCTS_KEY);
        const mergedSaved = Array.from(new Set([...savedResult.productIds, ...localSaved]));
        setSavedProductIds(mergedSaved);
        if (mergedSaved.length !== savedResult.productIds.length) {
          void apiSetSavedProducts(authToken, mergedSaved).catch(() => {});
        }
        setRecentProductIds(recentResult.productIds);
      } catch {
        // keep local state when the backend sync fails
      } finally {
        if (!cancelled) {
          savedHydratedRef.current = true;
          recentHydratedRef.current = true;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (!authToken || !savedHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      void apiSetSavedProducts(authToken, savedProductIds).catch(() => {});
    }, 300);
    return () => window.clearTimeout(timer);
  }, [savedProductIds, authToken]);

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    skinTestHydratedRef.current = false;
    getSkinTest(authToken)
      .then((result) => {
        if (cancelled) return;
        if (result.answers) {
          setSkinTestAnswers({ ...defaultSkinProfile, ...result.answers });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) skinTestHydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  useEffect(() => {
    if (!authToken || !skinTestHydratedRef.current) return;
    if (!skinTestAnswers.skinType && skinTestAnswers.concerns.length === 0) return;
    const timer = window.setTimeout(() => {
      void saveSkinTest(authToken, skinTestAnswers)
        .then((result) => {
          if (result.user) setAuthUser(result.user);
        })
        .catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [skinTestAnswers, authToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('auth_token');
    const callbackError = params.get('auth_error');
    const callbackPage = params.get('page');
    const resetToken = params.get('reset_token');
    const verifyToken = params.get('verify_token');
    const hasAnyParam =
      callbackToken || callbackError || resetToken || verifyToken;
    if (!hasAnyParam) return;

    if (callbackToken) {
      setAuthToken(callbackToken);
      setCurrentPage(callbackPage || 'dashboard');
    }
    if (callbackError) {
      setAuthModalError(callbackError);
      setIsAuthModalOpen(true);
    }
    if (resetToken) {
      setResetInitialToken(resetToken);
      setIsResetModalOpen(true);
    }
    if (verifyToken) {
      setPendingVerifyToken(verifyToken);
    }

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, '', cleanUrl);
  }, []);

  const recordRecent = (productId: number) => {
    setRecentProductIds((prev) => {
      const next = [productId, ...prev.filter((id) => id !== productId)].slice(0, 20);
      return next;
    });
    if (authToken) {
      void recordRecentProduct(authToken, productId).catch(() => {});
    }
  };

  const handleSelectProduct = (productId: number, targetPage: string = 'product-detail') => {
    setSelectedProductId(productId);
    setCurrentPage(targetPage);
    if (targetPage === 'product-detail') {
      recordRecent(productId);
    }
  };

  const handleToggleSaved = (productId: number) => {
    setSavedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleSkinTestComplete = (answers: SkinTestAnswers) => {
    setSkinTestAnswers(answers);
    setCurrentPage('products');
  };

  const openAuthModal = (mode: 'login' | 'signup' = 'login', onSuccess?: () => void) => {
    setAuthModalDefaultMode(mode);
    setAuthModalError(null);
    setPostLoginAction(() => onSuccess ?? null);
    setIsAuthModalOpen(true);
  };

  const handleAuthSubmit = async (payload: {
    mode: 'login' | 'signup';
    name: string;
    email: string;
    password: string;
    skinType: string;
  }) => {
    try {
      setIsAuthSubmitting(true);
      setAuthModalError(null);
      if (payload.mode === 'signup') {
        const result = await register({
          name: payload.name,
          email: payload.email,
          password: payload.password,
          skinType: payload.skinType
        });
        setAuthToken(result.token);
        setAuthUser(result.user);
      } else {
        const result = await login({
          email: payload.email,
          password: payload.password
        });
        setAuthToken(result.token);
        setAuthUser(result.user);
      }
      setIsAuthModalOpen(false);
      if (postLoginAction) {
        postLoginAction();
        setPostLoginAction(null);
      } else if (payload.mode === 'signup') {
        setCurrentPage('skin-test');
      } else {
        setCurrentPage('dashboard');
      }
    } catch (error) {
      setAuthModalError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setAuthToken(null);
    setAuthUser(null);
    setCurrentPage('home');
  };

  const handleProfileSubmit = async (payload: { name: string; skinType: string; avatar?: string }) => {
    if (!authToken) return;
    try {
      setIsProfileSubmitting(true);
      setProfileModalError(null);
      const result = await updateMe(authToken, payload);
      setAuthUser(result.user);
      setIsProfileModalOpen(false);
    } catch (error) {
      setProfileModalError(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsProfileSubmitting(false);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <LandingPage onNavigate={setCurrentPage} />;
      case 'skin-test':
        return <SkinTestPage onNavigate={setCurrentPage} onComplete={handleSkinTestComplete} />;
      case 'recommendations':
      case 'products':
        return (
          <RecommendationsPage
            onNavigate={setCurrentPage}
            skinTestAnswers={skinTestAnswers}
            userProfile={userProfile}
            onSelectProduct={handleSelectProduct}
            savedProductIds={savedProductIds}
            onToggleSaved={handleToggleSaved}
          />
        );
      case 'product-detail':
        return (
          <ProductDetailPage
            onNavigate={setCurrentPage}
            selectedProductId={selectedProductId}
            userProfile={userProfile}
            isSaved={savedProductIds.includes(selectedProductId)}
            onToggleSaved={handleToggleSaved}
            onSelectProduct={handleSelectProduct}
          />
        );
      case 'comparison':
        return <ComparisonPage onNavigate={setCurrentPage} selectedProductId={selectedProductId} />;
      case 'community':
        return (
          <CommunityPage
            onNavigate={setCurrentPage}
            onSelectProduct={handleSelectProduct}
            skinTestAnswers={skinTestAnswers}
            authToken={authToken}
            authUser={authUser}
            onRequireLogin={(onSuccess) => openAuthModal('login', onSuccess)}
          />
        );
      case 'following-manage':
        return (
          <FollowingManagePage
            onNavigate={setCurrentPage}
            authToken={authToken}
            authUser={authUser}
            onRequireLogin={(onSuccess) => openAuthModal('login', onSuccess)}
          />
        );
      case 'dashboard':
        return (
          <DashboardPage
            onNavigate={setCurrentPage}
            authToken={authToken}
            authUser={authUser}
            savedProductIds={savedProductIds}
            recentProductIds={recentProductIds}
            onRequireLogin={(onSuccess) => openAuthModal('login', onSuccess)}
            onSelectProduct={handleSelectProduct}
            onToggleSaved={handleToggleSaved}
            onEditProfile={() => {
              setProfileModalError(null);
              setIsProfileModalOpen(true);
            }}
          />
        );
      default:
        return <LandingPage onNavigate={setCurrentPage} />;
    }
  };

  const openResetModal = (email: string) => {
    setResetInitialToken(null);
    setResetDefaultEmail(email);
    setIsResetModalOpen(true);
    setIsAuthModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation
        onNavigate={setCurrentPage}
        currentPage={currentPage}
        isLoggedIn={Boolean(authUser)}
        onLogin={() => openAuthModal('login')}
        onLogout={handleLogout}
        onSelectProduct={handleSelectProduct}
      />
      <EmailVerificationBanner
        authToken={authToken}
        authUser={authUser}
        onVerified={(user) => setAuthUser(user)}
        pendingVerifyToken={pendingVerifyToken}
        onVerifyTokenConsumed={() => setPendingVerifyToken(null)}
      />
      {renderPage()}
      <AuthModal
        isOpen={isAuthModalOpen}
        defaultMode={authModalDefaultMode}
        isLoading={isAuthSubmitting}
        errorMessage={authModalError}
        onClose={() => setIsAuthModalOpen(false)}
        onSubmit={handleAuthSubmit}
        onForgotPassword={openResetModal}
        onGoogleLogin={() => {
          const targetPage = currentPage && currentPage !== 'home' ? currentPage : 'dashboard';
          const current = encodeURIComponent(targetPage);
          window.location.href = `${API_BASE_URL}/api/auth/google/start?page=${current}`;
        }}
      />
      <ProfileEditModal
        isOpen={isProfileModalOpen}
        user={authUser}
        isSubmitting={isProfileSubmitting}
        errorMessage={profileModalError}
        onClose={() => setIsProfileModalOpen(false)}
        onSubmit={handleProfileSubmit}
      />
      <PasswordResetModal
        isOpen={isResetModalOpen}
        initialToken={resetInitialToken}
        defaultEmail={resetDefaultEmail}
        onClose={() => {
          setIsResetModalOpen(false);
          setResetInitialToken(null);
        }}
        onSuccess={(authToken) => {
          setAuthToken(authToken);
          setIsResetModalOpen(false);
          setResetInitialToken(null);
          setCurrentPage('dashboard');
        }}
      />
    </div>
  );
}
