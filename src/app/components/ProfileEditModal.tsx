import { useEffect, useRef, useState } from 'react';
import { X, User as UserIcon, Sparkles, Camera } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { ImageWithFallback } from './ImageWithFallback';
import type { AuthUser } from '../../lib/backendApi';

interface ProfileEditModalProps {
  isOpen: boolean;
  user: AuthUser | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (payload: { name: string; skinType: string; avatar?: string }) => Promise<void>;
}

export function ProfileEditModal({
  isOpen,
  user,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit
}: ProfileEditModalProps) {
  const [name, setName] = useState('');
  const [skinType, setSkinType] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(user?.name ?? '');
    setSkinType(user?.skinType ?? '');
    setAvatar(undefined);
    setLocalError(null);
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleAvatarPick = (file: File | undefined) => {
    if (!file) return;
    setLocalError(null);
    if (!file.type.startsWith('image/')) {
      setLocalError('Only image files are allowed.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLocalError('Avatar image must be smaller than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result ?? ''));
    reader.onerror = () => setLocalError('Failed to read image.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError('Display name cannot be empty.');
      return;
    }
    await onSubmit({
      name: trimmed,
      skinType: skinType.trim() || 'Not set',
      avatar
    });
  };

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40 transition-all text-sm placeholder:text-muted-foreground';

  const currentAvatar =
    avatar ??
    user?.avatar ??
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop';

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
                aria-label="Close profile editor"
              >
                <X className="w-4 h-4" />
              </button>
              <h2
                className="text-3xl mb-1"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}
              >
                Edit profile
              </h2>
              <p className="text-sm text-muted-foreground">
                Update your display name, skin type, and avatar.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-muted ring-4 ring-primary/10">
                    <ImageWithFallback
                      src={currentAvatar}
                      alt={user?.name ?? 'avatar'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-primary-foreground hover:bg-forest flex items-center justify-center shadow-md transition-colors"
                    aria-label="Change avatar"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      handleAvatarPick(e.target.files?.[0]);
                      if (e.target) e.target.value = '';
                    }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-0.5">Profile photo</p>
                  <p>PNG or JPG, max 2MB.</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Display name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                    placeholder="Your name"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Skin type
                </label>
                <div className="relative">
                  <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    value={skinType}
                    onChange={(e) => setSkinType(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. Dry · Sensitive"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 ml-1">
                  Take the Skin Test for a personalized recommendation.
                </p>
              </div>

              <div className="text-xs text-muted-foreground border border-dashed border-border rounded-xl px-3 py-2">
                Email: <span className="text-foreground">{user?.email ?? '-'}</span>
              </div>

              {(localError || errorMessage) && (
                <div className="px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/10">
                  <p className="text-sm text-destructive">{localError ?? errorMessage}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-full border border-border hover:bg-muted text-sm transition-all"
                >
                  Cancel
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
                  {isSubmitting ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
