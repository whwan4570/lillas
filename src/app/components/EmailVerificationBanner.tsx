import { useEffect, useState } from 'react';
import { AlertCircle, Mail, ExternalLink, X, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { requestEmailVerify, verifyEmail, type AuthUser } from '../../lib/backendApi';

interface EmailVerificationBannerProps {
  authToken: string | null;
  authUser: AuthUser | null;
  onVerified: (user: AuthUser) => void;
  pendingVerifyToken?: string | null;
  onVerifyTokenConsumed?: () => void;
}

const DISMISS_KEY = 'lillasy_email_verify_dismissed';

export function EmailVerificationBanner({
  authToken,
  authUser,
  onVerified,
  pendingVerifyToken,
  onVerifyTokenConsumed
}: EmailVerificationBannerProps) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem(DISMISS_KEY) === '1';
  });
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!pendingVerifyToken || !authToken) return;
    setExpanded(true);
    setDismissed(false);
    setIsVerifying(true);
    verifyEmail(pendingVerifyToken)
      .then((result) => {
        onVerified(result.user);
        setRequestMessage('Email verified. Thanks for confirming!');
      })
      .catch((err) => {
        setVerifyError(err instanceof Error ? err.message : 'Failed to verify email');
      })
      .finally(() => {
        setIsVerifying(false);
        onVerifyTokenConsumed?.();
      });
  }, [pendingVerifyToken, authToken, onVerified, onVerifyTokenConsumed]);

  if (!authUser || authUser.emailVerified) return null;
  if (dismissed) return null;
  if (!authToken) return null;

  const handleSendLink = async () => {
    setIsRequesting(true);
    setRequestError(null);
    setRequestMessage(null);
    setDevLink(null);
    try {
      const result = await requestEmailVerify(authToken);
      if (result.alreadyVerified) {
        setRequestMessage('Your email is already verified.');
        return;
      }
      setRequestMessage(
        'Verification link generated. In this dev build you can use the link below or paste the token.'
      );
      if (result.devVerifyToken) setTokenInput(result.devVerifyToken);
      if (result.devVerifyUrl) setDevLink(result.devVerifyUrl);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to request verification');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifyError(null);
    if (!tokenInput.trim()) {
      setVerifyError('Paste the verification token to continue.');
      return;
    }
    setIsVerifying(true);
    try {
      const result = await verifyEmail(tokenInput.trim());
      onVerified(result.user);
      setRequestMessage('Email verified. Thanks for confirming!');
      setTokenInput('');
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Failed to verify email');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    }
  };

  return (
    <div className="w-full border-b border-amber-300/60 bg-amber-50/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-amber-900 flex-1 min-w-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="truncate">
            Please verify <span className="font-medium">{authUser.email}</span> to unlock all
            features.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" />
            {expanded ? 'Hide' : 'Verify email'}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-full hover:bg-amber-100 text-amber-900 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-amber-200/80 bg-amber-50"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="text-xs text-amber-900 max-w-md">
                <p>
                  Click the button to generate a verification link. In this local dev build the
                  link is returned directly below — paste the token and submit to verify.
                </p>
                <button
                  onClick={handleSendLink}
                  disabled={isRequesting}
                  className="mt-2 px-3 py-1.5 rounded-full border border-amber-400 text-amber-900 bg-white hover:bg-amber-100 text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {isRequesting ? 'Sending...' : 'Send verification link'}
                </button>
                {devLink && (
                  <a
                    href={devLink}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-800 hover:underline break-all"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    {devLink}
                  </a>
                )}
                {requestMessage && (
                  <p className="mt-2 text-[11px] text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {requestMessage}
                  </p>
                )}
                {requestError && (
                  <p className="mt-2 text-[11px] text-red-700">{requestError}</p>
                )}
              </div>

              <form
                onSubmit={handleVerify}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-xl"
              >
                <input
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste verification token"
                  className="flex-1 px-3 py-2 text-xs rounded-full border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                />
                <button
                  type="submit"
                  disabled={isVerifying}
                  className="px-4 py-2 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors disabled:opacity-60"
                >
                  {isVerifying ? 'Verifying...' : 'Verify'}
                </button>
                {verifyError && (
                  <span className="text-[11px] text-red-700 w-full">{verifyError}</span>
                )}
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
