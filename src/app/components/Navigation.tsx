import { Search, User, Heart, Menu, X, LogOut, ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageWithFallback } from './ImageWithFallback';
import type { CatalogProduct } from '../../lib/backendApi';

interface NavigationProps {
  onNavigate: (page: string) => void;
  currentPage: string;
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onSelectProduct: (productId: number, targetPage?: string) => void;
  catalogProducts: CatalogProduct[];
}

export function Navigation({
  onNavigate,
  currentPage,
  isLoggedIn,
  onLogin,
  onLogout,
  onSelectProduct,
  catalogProducts
}: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { label: 'Skin Test', page: 'skin-test' },
    { label: 'Products', page: 'products' },
    { label: 'Community', page: 'community' },
    { label: 'Compare', page: 'comparison' }
  ];

  const catalog = useMemo(() => catalogProducts, [catalogProducts]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as CatalogProduct[];
    return catalog
      .filter((p) => {
        const hay = `${p.name} ${p.brand} ${p.categoryLabel} ${p.keyIngredients.join(' ')} ${p.benefits.join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 6);
  }, [catalog, searchQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideDesktop = searchRef.current?.contains(target);
      const insideMobile = mobileSearchRef.current?.contains(target);
      if (!insideDesktop && !insideMobile) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [searchOpen]);

  const runSelect = (product: CatalogProduct) => {
    setSearchQuery('');
    setSearchOpen(false);
    setMobileMenuOpen(false);
    onSelectProduct(product.id, 'product-detail');
  };

  const submitSearch = () => {
    if (searchResults.length === 0) {
      setSearchOpen(false);
      onNavigate('products');
      setSearchQuery('');
      return;
    }
    const target = searchResults[Math.min(activeIndex, searchResults.length - 1)];
    runSelect(target);
  };

  const handleSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (searchResults.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % searchResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (searchResults.length === 0) return;
      setActiveIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      submitSearch();
    } else if (event.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  const renderSearchDropdown = (layoutId: string) => (
    <AnimatePresence>
      {searchOpen && searchQuery.trim().length > 0 && (
        <motion.div
          key={layoutId}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="absolute left-0 right-0 top-full mt-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-50"
        >
          {searchResults.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No products match "<span className="text-foreground">{searchQuery}</span>"
            </div>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto p-2">
                {searchResults.map((product, index) => (
                  <button
                    key={product.id}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runSelect(product)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      index === activeIndex ? 'bg-primary/10' : 'hover:bg-muted'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-lg overflow-hidden bg-muted shrink-0">
                      <ImageWithFallback
                        src={product.image ?? ''}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{product.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {product.brand} · {product.categoryLabel}
                      </div>
                    </div>
                    <div className="text-xs text-primary font-medium whitespace-nowrap">
                      {product.price != null ? `$${product.price}` : 'See price'}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setSearchOpen(false);
                  onNavigate('products');
                }}
                className="w-full px-4 py-2.5 bg-muted/30 hover:bg-muted text-xs font-medium text-primary border-t border-border flex items-center justify-center gap-1.5 transition-colors"
              >
                Browse all products
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <button
            onClick={() => onNavigate('home')}
            className="group flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sage via-primary to-forest flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-card" />
            </div>
            <span className="text-2xl tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
              lillasy
            </span>
          </button>

          <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
            <div className="relative w-full" ref={searchRef}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products, ingredients..."
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={handleSearchKey}
                className="w-full pl-11 pr-9 py-2.5 bg-muted/50 border border-border rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {renderSearchDropdown('desktop')}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <button
                key={item.page}
                onClick={() => onNavigate(item.page)}
                className={`px-4 py-2 rounded-full transition-all ${
                  currentPage === item.page
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}

            <button
              onClick={() => onNavigate('dashboard')}
              className="p-2 hover:bg-muted rounded-full transition-colors"
              aria-label="Saved"
            >
              <Heart className="w-5 h-5" />
            </button>

            {isLoggedIn ? (
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 p-1 pr-2 rounded-full border border-border hover:border-primary/40 hover:bg-muted/40 transition-all"
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  aria-label="Profile menu"
                >
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-sage via-primary to-forest flex items-center justify-center text-primary-foreground">
                    <User className="w-4 h-4" />
                  </span>
                </button>

                <AnimatePresence>
                  {profileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="absolute right-0 top-12 w-56 bg-card border border-border rounded-2xl shadow-xl p-2 z-50"
                    >
                      <button
                        onClick={() => {
                          onNavigate('dashboard');
                          setProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm flex items-center gap-2"
                      >
                        <User className="w-4 h-4 text-muted-foreground" />
                        Dashboard
                      </button>
                      <button
                        onClick={() => {
                          onNavigate('following-manage');
                          setProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors text-sm flex items-center gap-2"
                      >
                        <Heart className="w-4 h-4 text-muted-foreground" />
                        Following
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={() => {
                          onLogout();
                          setProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-destructive/10 transition-colors text-sm text-destructive flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={onLogin}
                className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest active:scale-[0.98] transition-all text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                Login
              </button>
            )}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-muted rounded-full transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-border bg-card"
          >
            <div className="px-4 py-4 space-y-3">
              <div className="relative mb-4" ref={mobileSearchRef}>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onKeyDown={handleSearchKey}
                  className="w-full pl-11 pr-9 py-2.5 bg-muted/50 border border-border rounded-full text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {renderSearchDropdown('mobile')}
              </div>
              {navItems.map((item) => (
                <button
                  key={item.page}
                  onClick={() => {
                    onNavigate(item.page);
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left px-4 py-3 rounded-lg hover:bg-muted transition-colors"
                >
                  {item.label}
                </button>
              ))}
              <div className="h-px bg-border my-2" />
              {isLoggedIn ? (
                <>
                  <button
                    onClick={() => {
                      onNavigate('dashboard');
                      setMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-3 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    Dashboard
                  </button>
                  <button
                    onClick={() => {
                      onLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-4 py-3 rounded-lg hover:bg-destructive/10 text-destructive transition-colors flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    onLogin();
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-center px-4 py-3 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-colors font-medium"
                >
                  Login / Sign up
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
