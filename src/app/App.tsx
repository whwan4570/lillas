import { useEffect, useState } from 'react';
import { Navigation } from './components/Navigation';
import { LandingPage } from './components/pages/LandingPage';
import { SkinTestPage } from './components/pages/SkinTestPage';
import { RecommendationsPage } from './components/pages/RecommendationsPage';
import { ProductDetailPage } from './components/pages/ProductDetailPage';
import { ComparisonPage } from './components/pages/ComparisonPage';
import { CommunityPage } from './components/pages/CommunityPage';
import { DashboardPage } from './components/pages/DashboardPage';
import type { SkinTestAnswers } from './types';
import { buildUserProfile, type UserProfile } from '../lib/recommendationEngine';

const SAVED_PRODUCTS_KEY = 'lillas_saved_products';
const SKIN_TEST_ANSWERS_KEY = 'lillas_skin_test_answers';

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

export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedProductId, setSelectedProductId] = useState<number>(1);
  const [savedProductIds, setSavedProductIds] = useState<number[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(SAVED_PRODUCTS_KEY);
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  });
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

  useEffect(() => {
    window.localStorage.setItem(SAVED_PRODUCTS_KEY, JSON.stringify(savedProductIds));
  }, [savedProductIds]);

  useEffect(() => {
    window.localStorage.setItem(SKIN_TEST_ANSWERS_KEY, JSON.stringify(skinTestAnswers));
    setUserProfile(buildUserProfile(skinTestAnswers));
  }, [skinTestAnswers]);

  const handleSelectProduct = (productId: number, targetPage: string = 'product-detail') => {
    setSelectedProductId(productId);
    setCurrentPage(targetPage);
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
        return <CommunityPage onNavigate={setCurrentPage} skinTestAnswers={skinTestAnswers} />;
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      default:
        return <LandingPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation onNavigate={setCurrentPage} currentPage={currentPage} />
      {renderPage()}
    </div>
  );
}