'use client';

import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
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
    } catch (err: unknown) {
      console.error(err);
      const code = err instanceof FirebaseError ? err.code : '';
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setError('Invalid email or password.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Failed to sign in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#07080f] px-4 relative overflow-hidden">
      {/* Background Auras */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-[-25%] left-[-15%] w-[70%] h-[70%] rounded-full bg-indigo-700/15 blur-[130px]" />
        <div className="absolute bottom-[-15%] right-[15%] w-[60%] h-[60%] rounded-full bg-cyan-700/12 blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8 hover:opacity-85 transition-opacity">
          <img src="/logo.png" alt="Ghana Radio" className="h-20 w-auto" />
        </Link>

        {/* Login Card */}
        <div className="bg-[#0a0b12]/95 backdrop-blur-3xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="font-display-lg text-[28px] font-black tracking-tight text-white leading-none">Welcome back</h1>
            <p className="text-[13px] text-white/40 mt-2 font-medium">Sign in to access your dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase tracking-widest font-black ml-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:border-[#E6C280]/40 focus:ring-2 focus:ring-[#E6C280]/10 outline-none transition-all text-white text-sm"
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-white/40 uppercase tracking-widest font-black ml-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 focus:border-[#E6C280]/40 focus:ring-2 focus:ring-[#E6C280]/10 outline-none transition-all text-white text-sm"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-[#E6C280] transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-sm flex-shrink-0">error</span>
                <p className="text-xs font-semibold">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#E6C280] text-black py-4 rounded-xl font-black text-sm hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#E6C280]/20 flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-white/5 pt-6">
            <p className="text-[13px] text-white/40 font-medium">
              Don&apos;t have an account?{' '}
              <Link href="/creator-signup" className="text-[#E6C280] font-black hover:underline">
                Sign up as a creator
              </Link>
            </p>
          </div>
        </div>

        {/* Admin Note */}
        <div className="mt-6 bg-white/[0.02] border border-white/10 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#E6C280] text-[20px]">info</span>
            <div>
              <p className="text-[11px] font-black text-white uppercase tracking-wider">Admin Access</p>
              <p className="text-[11px] text-white/40 font-medium mt-1 leading-relaxed">
                To create an admin account, use the setup script in the project root or manually set the role in Firebase Console.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
