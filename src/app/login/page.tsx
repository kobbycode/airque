'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getHomeRoute, useAuthState } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { appUser, loading } = useAuthState();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already logged in
  if (!loading && appUser) {
    router.push(getHomeRoute(appUser.role));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Redirect will happen automatically via the useEffect above
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Failed to sign in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8 hover:opacity-85 transition-opacity">
          <img src="/logo.png" alt="AirCue" className="h-14 w-auto" />
        </Link>

        {/* Login Card */}
        <div className="bg-white border border-outline-variant rounded-2xl p-8 shadow-sm">
          <div className="text-center mb-8">
            <h1 className="font-headline-lg text-on-surface">Welcome back</h1>
            <p className="font-body-sm text-on-surface-variant mt-2">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="font-label-md text-on-surface-variant text-xs">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="font-label-md text-on-surface-variant text-xs">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 pr-12 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-error-container/30 border border-error/20 text-error rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-sm flex-shrink-0">error</span>
                <p className="font-body-sm text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-on-primary py-4 rounded-xl font-headline-md hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="font-body-sm text-on-surface-variant text-sm">
              Don't have an account?{' '}
              <Link href="/creator-signup" className="text-primary font-bold hover:underline">
                Sign up as a creator
              </Link>
            </p>
          </div>
        </div>

        {/* Admin Note */}
        <div className="mt-6 bg-surface-container-low border border-outline-variant rounded-xl p-4">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary text-lg">info</span>
            <div>
              <p className="font-label-md text-on-surface text-xs">Admin Access</p>
              <p className="font-body-sm text-on-surface-variant text-xs mt-1">
                To create an admin account, use the setup script in the project root or manually set the role in Firebase Console.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
