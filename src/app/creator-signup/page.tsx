'use client';

import { useState } from 'react';
import {
  collection, addDoc, doc, serverTimestamp, setDoc, getDoc,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  type User,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const GENRES = [
  'Highlife', 'Afrobeats', 'Gospel', 'News & Talk', 'Sports',
  'Hip Hop / HipLife', 'Reggae', 'R&B', 'Jazz', 'Classical',
  'Electronic', 'Traditional', 'Akan', 'Multi-genre',
];

const REGIONS = [
  'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern',
  'Northern', 'Upper East', 'Upper West', 'Volta', 'Brong-Ahafo',
];

// Step 1 = account details (email/password) or OAuth landing
// Step 2 = station info
// Step 3 = preview & launch
type Step = 1 | 2 | 3;

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  stationName: string;
  genre: string;
  region: string;
  city: string;
  streamUrl: string;
  agreedToTerms: boolean;
}

export default function CreatorSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // After OAuth sign-in we have the firebase user before station setup
  const [oauthUser, setOauthUser] = useState<User | null>(null);

  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    stationName: '',
    genre: '',
    region: '',
    city: '',
    streamUrl: '',
    agreedToTerms: false,
  });

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  // ─── Step validation ────────────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!oauthUser) {
      // Email / password path
      if (!form.firstName.trim()) return 'First name is required.';
      if (!form.lastName.trim())  return 'Last name is required.';
      if (!form.email.trim() || !form.email.includes('@')) return 'A valid email is required.';
      if (form.password.length < 6) return 'Password must be at least 6 characters.';
      if (!form.agreedToTerms) return 'You must agree to the Terms of Service.';
    }
    return null;
  };

  const validateStep2 = () => {
    if (!form.stationName.trim()) return 'Station name is required.';
    if (!form.genre)   return 'Please select a genre.';
    if (!form.region)  return 'Please select a region.';
    return null;
  };

  const nextStep = () => {
    setError('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    setStep(s => (s + 1) as Step);
  };

  // ─── Shared: save user docs + station then redirect ─────────────────────────
  const provisionCreator = async (
    uid: string,
    firstName: string,
    lastName: string,
    email: string,
  ) => {
    await setDoc(doc(db, 'users', uid), {
      email,
      firstName,
      lastName,
      role: 'creator',
      createdAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, 'creators', uid), {
      uid,
      firstName,
      lastName,
      email,
      role: 'creator',
      createdAt: serverTimestamp(),
    }, { merge: true });

    await addDoc(collection(db, 'stations'), {
      ownerId: uid,
      name: form.stationName,
      genre: form.genre,
      region: form.region,
      location: form.city || form.region,
      streamUrl: form.streamUrl || '',
      bitrate: '128kbps',
      status: 'ONLINE',
      logoUrl: '',
      createdAt: serverTimestamp(),
    });

    router.push('/station-dashboard');
  };

  // ─── OAuth helpers ──────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    setOauthLoading('google');
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if creator already registered — if so, just redirect
      const snap = await getDoc(doc(db, 'creators', user.uid));
      if (snap.exists()) {
        router.push('/station-dashboard');
        return;
      }

      // Pre-fill name/email from Google profile
      const nameParts = (user.displayName ?? '').split(' ');
      setForm(prev => ({
        ...prev,
        firstName: nameParts[0] ?? '',
        lastName: nameParts.slice(1).join(' ') ?? '',
        email: user.email ?? '',
        agreedToTerms: true, // implied by OAuth
      }));
      setOauthUser(user);
      setStep(2); // skip to station setup
    } catch (err: unknown) {
      console.error(err);
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // user dismissed — silently ignore
      } else if (code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups for this site.');
      } else {
        setError('Google sign-in failed. Please try again or use email/password.');
      }
    } finally {
      setOauthLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    setOauthLoading('apple');
    setError('');
    try {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if creator already registered — if so, just redirect
      const snap = await getDoc(doc(db, 'creators', user.uid));
      if (snap.exists()) {
        router.push('/station-dashboard');
        return;
      }

      // Apple only provides name on first sign-in
      const credential = OAuthProvider.credentialFromResult(result);
      const idToken = credential?.idToken ?? '';
      let firstName = '';
      let lastName = '';
      try {
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        if (payload.given_name) firstName = payload.given_name;
        if (payload.family_name) lastName = payload.family_name;
      } catch { /* ignore */ }
      if (!firstName && user.displayName) {
        const parts = user.displayName.split(' ');
        firstName = parts[0] ?? '';
        lastName = parts.slice(1).join(' ') ?? '';
      }

      setForm(prev => ({
        ...prev,
        firstName,
        lastName,
        email: user.email ?? '',
        agreedToTerms: true,
      }));
      setOauthUser(user);
      setStep(2);
    } catch (err: unknown) {
      console.error(err);
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // silently ignore
      } else if (code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups for this site.');
      } else if (code === 'auth/operation-not-allowed') {
        setError('Apple sign-in is not enabled. Please use Google or email/password.');
      } else {
        setError('Apple sign-in failed. Please try again or use email/password.');
      }
    } finally {
      setOauthLoading(null);
    }
  };

  // ─── Final submission ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateStep2();
    if (err) { setError(err); return; }

    setLoading(true);
    setError('');

    try {
      if (oauthUser) {
        // OAuth path — user already signed in, just provision station
        const nameParts = (oauthUser.displayName ?? '').split(' ');
        await provisionCreator(
          oauthUser.uid,
          form.firstName || nameParts[0] || '',
          form.lastName  || nameParts.slice(1).join(' ') || '',
          oauthUser.email ?? form.email,
        );
      } else {
        // Email/password path
        const credential = await createUserWithEmailAndPassword(auth, form.email, form.password);
        await provisionCreator(
          credential.user.uid,
          form.firstName,
          form.lastName,
          form.email,
        );
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // ─── Step indicator ──────────────────────────────────────────────────────────
  const steps = [
    { n: 1, label: 'Your Account' },
    { n: 2, label: 'Your Station' },
    { n: 3, label: 'Go Live!'    },
  ];

  return (
    <>
      <main className="flex min-h-screen flex-col md:flex-row">

        {/* ── Left panel ─────────────────────────────────────────────────────── */}
        <section className="hidden md:flex relative w-1/2 flex-col justify-end p-[32px] overflow-hidden border-r border-outline-variant/20 bg-surface-dim">
          <div className="absolute inset-0 z-0">
            <img
              className="h-full w-full object-cover grayscale opacity-30"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCgxQF_gZ8d85R3wSQXychk2WbbclYaofJc8x1-3woktK4VHyRcdLdX-z0ZqCsEBgQVyJFL-AkM5DAoZqiptbyEZ0rfLazxZz0nc3Cz68PPTFOxMrLxa8t0MkQqkQvKvLNouEGL9La1JnRi8o6oTjLyqkAjLQjuFRXrF3MZUnnXhKl90MTUYwpjkhMhZH1ukEB98xcI4V3Y1O5beZvA0ETU6avsoG3kuiIlVrFnwziwFquELd4TP81naPi4zW9Dctxlr2z15Hi0DBE"
              alt="Studio"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-surface-dim via-surface-dim/40 to-transparent" />
          </div>

          {/* Rotating gallery */}
          <div className="relative z-10 w-full mb-12">
            <div className="grid grid-cols-6 gap-4 items-end">
              <div className="col-span-2 aspect-square rounded-xl overflow-hidden border border-outline/20 shadow-xl transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                <img className="w-full h-full object-cover opacity-90"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuByJclYKFJ8tAn4Y4UmuSBYJjeIyUlCTByk7m0PT4v047xB_ZwXUEgRC0-S3Hkgzn3BF4PjewDr9bl-N8QyDJmgAKMtW79OhUggNMBdV263-LMwD_VpyDabnzu7GK_5BN1PXB1_98Phm6S_YBClQuVKs7W88j9RyxAP1Ehr4O4FFuVrOpoUW1DnB7zDD1rDrY8J2u7YbF9TeGZKnHUtEojm4MjLkr_csANlw_eVNGvRSqHd4akDSfiD_5bQ3SbOJaPszKd_q3d2gY4"
                  alt="DJ Mixer" />
              </div>
              <div className="col-span-3 aspect-video rounded-xl overflow-hidden border border-outline/20 shadow-xl transform translate-y-8 rotate-2 hover:rotate-0 transition-transform duration-500">
                <img className="w-full h-full object-cover opacity-90"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAqkDjutAM6BpImS67WZ0GbiwOysG62H6nHMJEFxKrYJ-_eizGDc_pnhozaejQ_JfGgKGIcIAPMxm741ZxOM7yEBp5jvmY6peviG9Er1hEsHnJhppu_a9X0i3CPy79ltotKrLEdVR7fQU3JxujiB2MpRkYs-OSR4P_GfDfiafop7UIl0G68Ja5zS28OaijucLJSFiVS5gobRigzBBSDj4dAbqBHdpWhOjpL7lYwH9evOjcpwLtyfyy2s2R8TKaRRnxAXVJv5AhH4wY"
                  alt="Radio Studio" />
              </div>
            </div>
          </div>

          {/* Hero text */}
          <div className="relative z-10 space-y-6 max-w-lg">
            <div className="flex items-center gap-4">
              <div className="bg-primary px-3 py-1 rounded-full flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-on-primary animate-pulse" />
                <span className="font-label-md text-on-primary tracking-wider">LIVE NOW</span>
              </div>
              <p className="font-label-md text-primary tracking-widest uppercase">Ghana Radio Global</p>
            </div>
            <h1 className="font-display-lg text-display-lg text-on-surface leading-none">
              JOIN THE <br/>
              <span className="text-primary italic">REVOLUTION</span> <br/>
              OF AUDIO.
            </h1>
            <p className="font-body-lg text-on-surface-variant max-w-sm">
              Launch your station in under 60 seconds. We auto-provision your stream, analytics, and audience chat — no technical setup required.
            </p>

            {/* Stats */}
            <div className="flex gap-6 pt-2">
              {[['12M+', 'Monthly Listeners'], ['180+', 'Countries'], ['50K+', 'Active Stations']].map(([num, label]) => (
                <div key={label}>
                  <p className="font-display-lg text-[28px] text-primary leading-none">{num}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Right panel ─────────────────────────────────────────────────────── */}
        <section className="flex-1 flex flex-col justify-center items-center px-8 md:px-[32px] py-12 bg-surface-container-lowest overflow-y-auto">
          <div className="w-full max-w-md">

            {/* Logo */}
            <Link href="/" className="flex items-center justify-center gap-2 mb-8 hover:opacity-85 transition-opacity">
              <img src="/logo.png" alt="Ghana Radio" className="h-20 w-auto" />
            </Link>

            {/* Step indicator */}
            <div className="flex items-center gap-0 mb-8">
              {steps.map((s, i) => (
                <div key={s.n} className="flex items-center flex-1">
                  <div className={`flex flex-col items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                      step > s.n ? 'bg-primary text-on-primary' :
                      step === s.n ? 'bg-primary text-on-primary ring-4 ring-primary/20' :
                      'bg-surface-container text-on-surface-variant'
                    }`}>
                      {step > s.n ? <span className="material-symbols-outlined text-sm">check</span> : s.n}
                    </div>
                    <p className={`text-[10px] mt-1 font-semibold whitespace-nowrap ${step >= s.n ? 'text-primary' : 'text-on-surface-variant'}`}>{s.label}</p>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 mb-4 transition-all ${step > s.n ? 'bg-primary' : 'bg-outline-variant'}`} />
                  )}
                </div>
              ))}
            </div>

            {/* ── STEP 1: Account details ────────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-headline-lg text-on-surface">Create your account</h2>
                  <p className="font-body-md text-on-surface-variant mt-1">Start your 14-day free trial. No credit card required.</p>
                </div>

                {/* OAuth buttons */}
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={!!oauthLoading}
                    className="flex items-center justify-center gap-3 bg-surface-container-lowest border border-outline-variant p-3 rounded-xl hover:bg-surface-container-low transition-all active:scale-95 group disabled:opacity-60"
                  >
                    {oauthLoading === 'google' ? (
                      <span className="w-4 h-4 border-2 border-outline-variant border-t-primary rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                    )}
                    <span className="font-label-md text-on-surface">Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAppleSignIn}
                    disabled={!!oauthLoading}
                    className="flex items-center justify-center gap-3 bg-surface-container-lowest border border-outline-variant p-3 rounded-xl hover:bg-surface-container-low transition-all active:scale-95 group disabled:opacity-60"
                  >
                    {oauthLoading === 'apple' ? (
                      <span className="w-4 h-4 border-2 border-outline-variant border-t-on-surface rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.3C4.24 17.15 4.3 11.23 7.12 8.5c1.4-1.33 3-1.3 4-.67.75.46 1.54.46 2.27 0 1.2-.67 2.76-.84 4.02.5-.32.22-2.58 2.65-2.5 5.8.1 3.5 2.33 4.77 3.14 5.3-.2.53-.4 1.05-.6 1.56l-.34.3zm-3.55-16.1c.3-.04.6-.06.9-.06.13 1.34-.4 2.62-1.4 3.5-.96.85-2.3 1.03-2.6.14-.1-.32-.2-.64-.2-.96.12-1.28.94-2.3 2.1-2.6z" />
                      </svg>
                    )}
                    <span className="font-label-md text-on-surface">Apple</span>
                  </button>
                </div>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-outline-variant/30" /></div>
                  <div className="relative flex justify-center"><span className="bg-surface-container-lowest px-4 text-on-surface-variant text-sm">Or continue with email</span></div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-label-md text-on-surface-variant ml-1 text-xs">First Name *</label>
                    <input value={form.firstName} onChange={e => set('firstName', e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                      placeholder="Kofi" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-label-md text-on-surface-variant ml-1 text-xs">Last Name *</label>
                    <input value={form.lastName} onChange={e => set('lastName', e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                      placeholder="Mensah" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-label-md text-on-surface-variant ml-1 text-xs">Email Address *</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                    placeholder="kofi@example.com" />
                </div>

                <div className="space-y-1.5">
                  <label className="font-label-md text-on-surface-variant ml-1 text-xs">Password *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 pr-12 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                      placeholder="Min. 6 characters" />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-sm">{showPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                  {/* Strength bar */}
                  {form.password && (
                    <div className="flex gap-1 mt-1.5 px-1">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                          form.password.length > i * 3
                            ? form.password.length < 6 ? 'bg-error' : form.password.length < 10 ? 'bg-amber-400' : 'bg-green-500'
                            : 'bg-outline-variant'
                        }`} />
                      ))}
                      <span className="text-[10px] text-on-surface-variant ml-1">
                        {form.password.length < 6 ? 'Weak' : form.password.length < 10 ? 'Fair' : 'Strong'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <input type="checkbox" id="terms" checked={form.agreedToTerms} onChange={e => set('agreedToTerms', e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-outline-variant text-primary focus:ring-primary" />
                  <label htmlFor="terms" className="font-body-sm text-on-surface-variant leading-tight text-sm cursor-pointer">
                    I agree to the <a className="text-primary font-semibold hover:underline" href="#">Terms of Service</a> and <a className="text-primary font-semibold hover:underline" href="#">Privacy Policy</a>.
                  </label>
                </div>

                {error && <ErrorAlert message={error} />}

                <button onClick={nextStep}
                  className="w-full bg-primary text-on-primary py-4 rounded-xl font-headline-md hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2">
                  Continue
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>

                <p className="text-center font-body-md text-on-surface-variant text-sm">
                  Already have an account? <Link href="/login" className="text-primary font-bold hover:underline">Log in</Link>
                </p>
              </div>
            )}

            {/* ── STEP 2: Station details ────────────────────────────────────── */}
            {step === 2 && (
              <form onSubmit={e => { e.preventDefault(); nextStep(); }} className="space-y-6">
                <div>
                  <h2 className="font-headline-lg text-on-surface">Set up your station</h2>
                  <p className="font-body-md text-on-surface-variant mt-1">Tell us about your broadcast. You can always change this later.</p>
                </div>

                {/* Show the signed-in account info if OAuth */}
                {oauthUser && (
                  <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                    {oauthUser.photoURL && (
                      <img src={oauthUser.photoURL} alt="profile" className="w-8 h-8 rounded-full border border-primary/30" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{oauthUser.displayName || form.email}</p>
                      <p className="text-[11px] text-primary">Signed in · now set up your station</p>
                    </div>
                    <span className="material-symbols-outlined text-primary ml-auto text-sm">verified</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="font-label-md text-on-surface-variant ml-1 text-xs">Station Name *</label>
                  <input value={form.stationName} onChange={e => set('stationName', e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                    placeholder="e.g. Empire FM" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-label-md text-on-surface-variant ml-1 text-xs">Genre *</label>
                    <select value={form.genre} onChange={e => set('genre', e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm">
                      <option value="">Select genre</option>
                      {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-label-md text-on-surface-variant ml-1 text-xs">Region *</label>
                    <select value={form.region} onChange={e => set('region', e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm">
                      <option value="">Select region</option>
                      {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-label-md text-on-surface-variant ml-1 text-xs">City / Frequency <span className="text-on-surface-variant/60">(optional)</span></label>
                  <input value={form.city} onChange={e => set('city', e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm"
                    placeholder="e.g. Accra, 102.7 MHz" />
                </div>

                <div className="space-y-1.5">
                  <label className="font-label-md text-on-surface-variant ml-1 text-xs">Stream URL <span className="text-on-surface-variant/60">(optional — add later)</span></label>
                  <input type="url" value={form.streamUrl} onChange={e => set('streamUrl', e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-3 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-on-surface text-sm font-mono"
                    placeholder="https://yourserver.com/stream.m3u8" />
                  <p className="text-[11px] text-on-surface-variant pl-1">Supports HLS (.m3u8), Icecast, or direct audio streams</p>
                </div>

                {error && <ErrorAlert message={error} />}

                <div className="flex gap-3">
                  <button type="button" onClick={() => { setOauthUser(null); setStep(1); }}
                    className="flex-1 py-3 rounded-xl border border-outline-variant font-label-md text-on-surface hover:bg-surface-container transition-all">
                    Back
                  </button>
                  <button type="submit"
                    className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-headline-md hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2">
                    Preview &amp; Launch
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </form>
            )}

            {/* ── STEP 3: Preview & launch ───────────────────────────────────── */}
            {step === 3 && (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h2 className="font-headline-lg text-on-surface">You&apos;re ready to go live!</h2>
                  <p className="font-body-md text-on-surface-variant mt-1">Review your station details and launch.</p>
                </div>

                {/* Summary card */}
                <div className="bg-surface-container rounded-2xl border border-outline-variant overflow-hidden">
                  <div className="px-5 py-4 bg-primary/5 border-b border-outline-variant flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-2xl">radio</span>
                    </div>
                    <div>
                      <p className="font-bold text-on-surface">{form.stationName}</p>
                      <p className="text-xs text-on-surface-variant">{form.genre} · {form.city || form.region}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs font-bold text-green-600">Will go ONLINE</span>
                    </div>
                  </div>
                  <div className="divide-y divide-outline-variant/40">
                    {[
                      ['Host', `${form.firstName} ${form.lastName}`],
                      ['Email', oauthUser?.email ?? form.email],
                      ['Region', form.region],
                      ['Stream URL', form.streamUrl || 'Not set — add later in Settings'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center px-5 py-3 text-sm">
                        <span className="text-on-surface-variant">{k}</span>
                        <span className="font-medium text-on-surface truncate max-w-[60%] text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features list */}
                <div className="space-y-2">
                  {[
                    ['sensors',     'Station goes live instantly on the directory'],
                    ['queue_music', 'Listeners can request songs via the station drawer'],
                    ['chat_bubble', 'Real-time audience chat room activated'],
                    ['bar_chart',   'Analytics & listener tracking enabled'],
                  ].map(([icon, text]) => (
                    <div key={icon} className="flex items-center gap-3">
                      <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-primary text-sm">{icon}</span>
                      </div>
                      <p className="text-sm text-on-surface-variant">{text}</p>
                    </div>
                  ))}
                </div>

                {error && <ErrorAlert message={error} />}

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep(2)} disabled={loading}
                    className="flex-1 py-3 rounded-xl border border-outline-variant font-label-md text-on-surface hover:bg-surface-container transition-all disabled:opacity-50">
                    Back
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 bg-primary text-on-primary py-4 rounded-xl font-headline-md hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/30 flex items-center justify-center gap-2 disabled:opacity-70">
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                        Launching…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">sensors</span>
                        Launch My Station
                      </>
                    )}
                  </button>
                </div>

                <p className="text-center text-xs text-on-surface-variant">
                  By launching, you confirm this station complies with our <a href="#" className="text-primary hover:underline">Broadcast Guidelines</a>.
                </p>
              </form>
            )}

            {/* Trust badges */}
            <div className="flex justify-center gap-6 pt-6">
              {[['verified','SECURE SIGNUP','text-secondary'], ['shield','DATA PROTECTED','text-tertiary'], ['lock','256-BIT SSL','text-primary']].map(([icon, label, color]) => (
                <div key={label} className="flex items-center gap-1.5 text-on-surface-variant">
                  <span className={`material-symbols-outlined ${color} text-sm`}>{icon}</span>
                  <span className="font-label-md text-[10px]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Visualizer strip */}
      <div className="fixed bottom-0 left-0 right-0 h-1 z-50 flex items-end gap-[2px] opacity-20 pointer-events-none">
        {[20, 60, 40, 80, 30, 90, 50, 70, 45, 85, 35, 65].map((h, i) => (
          <div key={i} className="flex-1 bg-primary rounded-t animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 bg-error-container/30 border border-error/20 text-error rounded-xl px-4 py-3">
      <span className="material-symbols-outlined text-sm flex-shrink-0">error</span>
      <p className="font-body-sm text-sm">{message}</p>
    </div>
  );
}
