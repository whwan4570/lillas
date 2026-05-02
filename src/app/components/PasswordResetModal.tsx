import { useEffect, useState } from 'react';
import { X, Mail, Lock, KeyRound, ShieldCheck, ExternalLink } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { requestPasswordReset, resetPassword } from '../../lib/backendApi';

interface PasswordResetModalProps {
  isOpen: boolean;
  initialToken?: string | null;
  defaultEmail?: string;
  onClose: () => void;
  onSuccess: (authToken: string) => void;
}

type Stage = 'request' | 'confirm';

function isValidPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function PasswordResetModal({
  isOpen,
  initialToken,
  defaultEmail,
  onClose,
  onSuccess
}: PasswordResetModalProps) {
  const [stage, setStage] = useState<Stage>(initialToken ? 'confirm' : 'request');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [token, setToken] = useState(initialToken ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStage(initialToken ? 'confirm' : 'request');
    setEmail(defaultEmail ?? '');
    setToken(initialToken ?? '');
    setPassword('');
    setConfirmPassword('');
    setMessage(null);
    setError(null);
    setDevLink(null);
    setIsSubmitting(false);
  }, [isOpen, initialToken, defaultEmail]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all text-sm placeholder:text-muted-foreground';

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    setDevLink(null);
    try {
      const result = await requestPasswordReset(email.trim());
      setMessage('If an account matches that email, a reset link has been generated.');
      if (result.devResetToken) {
        setToken(result.devResetToken);
      }
      if (result.devResetUrl) {
        setDevLink(result.devResetUrl);
      }
      setStage('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (!isValidPassword(password)) {
      setError('Password must be at least 8 characters and include one letter and one number.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await resetPassword(token.trim(), password);
      onSuccess(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <div className="relative px-8 pt-8 pb-4 bg-gradient-to-br from-cream via-card to-muted/30">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  {stage === 'request' ? (
                    <KeyRound className="w-4 h-4" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                </div>
                <h2
                  className="text-2xl"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
                >
                  {stage === 'request' ? 'Reset your password' : 'Set a new password'}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {stage === 'request'
                  ? 'Enter the email you signed up with. We will issue a reset link valid for 30 minutes.'
                  : 'Paste your reset token and choose a new password.'}
              </p>
            </div>

            {stage === 'request' ? (
              <form onSubmit={handleRequest} className="px-8 py-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>

                {message && (
                  <div className="px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-sm text-foreground">
                    {message}
                  </div>
                )}
                {error && (
                  <div className="px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStage('confirm')}
                    className="text-xs text-primary hover:underline"
                  >
                    I already have a reset token →
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                      isSubmitting
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-forest active:scale-[0.98] shadow-sm hover:shadow-md'
                    }`}
                  >
                    {isSubmitting ? 'Sending...' : 'Send reset link'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirm} className="px-8 py-6 space-y-4">
                {message && (
                  <div className="px-3 py-2 rounded-lg border border-primary/20 bg-primary/5 text-sm text-foreground">
                    {message}
                  </div>
                )}
                {devLink && (
                  <a
                    href={devLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-xs text-primary hover:underline break-all px-3 py-2 rounded-lg bg-muted/40 border border-border"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    {devLink}
                  </a>
                )}

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Reset token
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className={inputClass}
                      placeholder="Paste the reset token"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputClass}
                      placeholder="Repeat new password"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                {error && (
                  <div className="px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStage('request')}
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    ← Request a new link
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                      isSubmitting
                        ? 'bg-muted text-muted-foreground cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:bg-forest active:scale-[0.98] shadow-sm hover:shadow-md'
                    }`}
                  >
                    {isSubmitting ? 'Resetting...' : 'Reset password'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
