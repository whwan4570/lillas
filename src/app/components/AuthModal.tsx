import { useEffect, useState } from 'react';
import { X, Mail, Lock, User as UserIcon, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type AuthMode = 'login' | 'signup';

interface AuthModalSubmitPayload {
  mode: AuthMode;
  name: string;
  email: string;
  password: string;
  skinType: string;
}

interface AuthModalProps {
  isOpen: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  defaultMode?: AuthMode;
  onClose: () => void;
  onSubmit: (payload: AuthModalSubmitPayload) => Promise<void>;
  onGoogleLogin: () => void;
  onForgotPassword?: (email: string) => void;
}

function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function AuthModal({
  isOpen,
  isLoading,
  errorMessage,
  defaultMode = 'login',
  onClose,
  onSubmit,
  onGoogleLogin,
  onForgotPassword
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(defaultMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [skinType, setSkinType] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode);
    setLocalError(null);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setSkinType('');
  }, [defaultMode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!emailOk) {
      setLocalError('Please enter a valid email address.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters for signup.');
        return;
      }
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        setLocalError('Password must include at least one letter and one number.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('Password confirmation does not match.');
        return;
      }
    }

    await onSubmit({
      mode,
      name: name.trim() || 'New User',
      email: normalizedEmail,
      password,
      skinType: skinType.trim() || 'Not set'
    });
  };

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all text-sm placeholder:text-muted-foreground';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden"
          >
            <div className="relative px-8 pt-8 pb-6 bg-gradient-to-br from-cream via-card to-muted/30">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Close authentication modal"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sage via-primary to-forest flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <h2
                className="text-3xl mb-1"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mode === 'login'
                  ? 'Log in to sync your skincare profile.'
                  : 'Start your personalized skincare journey.'}
              </p>
            </div>

            <div className="px-8 py-6">
              <div className="inline-flex p-1 rounded-full bg-muted mb-5 w-full">
                <button
                  onClick={() => setMode('login')}
                  type="button"
                  className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition-all ${
                    mode === 'login'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => setMode('signup')}
                  type="button"
                  className={`flex-1 px-3 py-2 rounded-full text-sm font-medium transition-all ${
                    mode === 'signup'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Sign up
                </button>
              </div>

              <button
                onClick={onGoogleLogin}
                type="button"
                className="w-full mb-4 px-4 py-2.5 rounded-full border border-border bg-card hover:bg-muted/40 hover:border-primary/30 active:scale-[0.99] text-sm font-medium flex items-center justify-center gap-3 transition-all"
              >
                <GoogleIcon className="w-4 h-4" />
                Continue with Google
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-3 text-xs text-muted-foreground uppercase tracking-wider">
                    or
                  </span>
                </div>
              </div>

              <form onSubmit={submit} className="space-y-3">
                {mode === 'signup' && (
                  <>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Display name"
                        className={inputClass}
                        required
                      />
                    </div>
                    <div>
                      <div className="relative">
                        <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          value={skinType}
                          onChange={(e) => setSkinType(e.target.value)}
                          placeholder="Skin type (optional — e.g. Dry · Sensitive)"
                          className={inputClass}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 ml-1">
                        Leave blank to set later via the Skin Test.
                      </p>
                    </div>
                  </>
                )}

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    className={inputClass}
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    type="password"
                    minLength={6}
                    className={inputClass}
                    required
                  />
                </div>
                {mode === 'login' && onForgotPassword && (
                  <div className="flex justify-end -mt-1">
                    <button
                      type="button"
                      onClick={() => onForgotPassword(email.trim())}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
                {mode === 'signup' && (
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      type="password"
                      minLength={8}
                      className={inputClass}
                      required
                    />
                  </div>
                )}

                {(localError || errorMessage) && (
                  <div className="px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/10">
                    <p className="text-sm text-destructive">{localError ?? errorMessage}</p>
                  </div>
                )}

                <button
                  disabled={isLoading}
                  className={`w-full px-4 py-2.5 mt-2 rounded-full text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    isLoading
                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:bg-forest active:scale-[0.99] shadow-sm hover:shadow-md'
                  }`}
                >
                  {isLoading
                    ? 'Processing...'
                    : mode === 'login'
                      ? 'Login to dashboard'
                      : 'Create account'}
                </button>

                <p className="text-xs text-center text-muted-foreground pt-2">
                  {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                    className="text-primary hover:underline font-medium"
                  >
                    {mode === 'login' ? 'Sign up' : 'Login'}
                  </button>
                </p>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
