'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  Coins,
  ShieldCheck,
  Check,
  Sparkles,
  ArrowRight,
  Lock,
  CreditCard,
  Wallet,
  Search,
  UserCheck,
  AlertCircle,
  Gift,
  Zap,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  HelpCircle,
  Flame,
  ArrowUpRight,
  User,
  Mail,
  Eye,
  EyeOff,
  LogOut,
  Receipt,
  Clock,
  Download,
  Share,
  PlusSquare,
  X,
  Smartphone,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import StripeExpressCheckout from '@/components/StripeExpressCheckout';

interface UserProfile {
  id: string;
  username: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  is_verified?: boolean;
  coins_balance?: number;
}

interface CoinTier {
  id: string;
  coins: number;
  usdPrice: number;
  discountPercent?: number;
  badge?: string;
  popular?: boolean;
}

const DEFAULT_TIERS: CoinTier[] = [
  { id: 'tier_70', coins: 70, usdPrice: 0.99 },
  { id: 'tier_350', coins: 350, usdPrice: 4.79, discountPercent: 5 },
  { id: 'tier_700', coins: 700, usdPrice: 9.49, discountPercent: 10, popular: true, badge: 'MOST POPULAR' },
  { id: 'tier_1400', coins: 1400, usdPrice: 18.49, discountPercent: 15, badge: 'CREATOR CHOICE' },
  { id: 'tier_3500', coins: 3500, usdPrice: 44.99, discountPercent: 20, badge: 'VIP STREAMER' },
  { id: 'tier_7000', coins: 7000, usdPrice: 84.99, discountPercent: 25, badge: 'ELITE PRO' },
  { id: 'tier_17500', coins: 17500, usdPrice: 199.99, discountPercent: 30, badge: 'MAX SAVINGS' },
];

function ZevPayContent() {
  const searchParams = useSearchParams();
  const urlUid = searchParams.get('uid')?.trim() || '';
  const urlUsername = searchParams.get('username')?.trim() || '';
  const urlStatus = searchParams.get('status')?.trim() || '';
  const urlCoins = searchParams.get('coins')?.trim() || '';
  const urlOrderId = searchParams.get('orderId')?.trim() || '';

  // Navigation tab: 'recharge' | 'transactions' | 'security' | 'profile'
  const [activeTab, setActiveTab] = useState<'recharge' | 'transactions' | 'security' | 'profile'>('recharge');

  // Supabase Auth State
  const [authUser, setAuthUser] = useState<any>(null);
  const [authProfile, setAuthProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Transactions State
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [txToast, setTxToast] = useState('');

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Tiers & Target Account
  const [tiers, setTiers] = useState<CoinTier[]>(DEFAULT_TIERS);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Selection
  const [selectedTier, setSelectedTier] = useState<CoinTier>(DEFAULT_TIERS[2]);
  const [isCustomAmount, setIsCustomAmount] = useState(false);
  const [customCoins, setCustomCoins] = useState(2500);
  const [selectedPayment, setSelectedPayment] = useState<string>('card');

  // Checkout Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);
  const [purchasedAmount, setPurchasedAmount] = useState(0);

  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      ) {
        setIsInstalled(true);
      }

      const ua = window.navigator.userAgent.toLowerCase();
      setIsIOS(/iphone|ipad|ipod/.test(ua));

      const handleBeforeInstall = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      const handleAppInstalled = () => {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setShowInstallBanner(false);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstall);
      window.addEventListener('appinstalled', handleAppInstalled);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setShowInstallBanner(false);
        }
        setDeferredPrompt(null);
      } catch (err) {
        setShowInstallModal(true);
      }
    } else {
      setShowInstallModal(true);
    }
  };

  // 1. Fetch Packages dynamically from Supabase database
  useEffect(() => {
    async function loadCoinPackages() {
      try {
        const { data, error } = await supabase
          .from('coin_packages')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (!error && data && data.length > 0) {
          const loaded: CoinTier[] = data.map((p) => ({
            id: p.id,
            coins: p.coins,
            usdPrice: Number(p.usd_price),
            discountPercent: p.discount_percent ?? undefined,
            badge: p.badge ?? undefined,
            popular: p.is_popular ?? false,
          }));
          setTiers(loaded);
          const pop = loaded.find((t) => t.popular) || loaded[0];
          setSelectedTier(pop);
        }
      } catch (err) {
        console.warn('Fallback to default packages:', err);
      }
    }
    loadCoinPackages();
  }, []);

  // 2. Load Auth User & Session Listener
  useEffect(() => {
    async function initAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setAuthUser(session.user);
          await loadUserProfile(session.user.id, true);
        }
      } catch (err) {
        console.error('Session load error:', err);
      } finally {
        setAuthLoading(false);
      }
    }

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setAuthUser(session.user);
        await loadUserProfile(session.user.id, true);
      } else {
        setAuthUser(null);
        setAuthProfile(null);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  async function loadUserProfile(userId: string, isAuthAccount = false) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, first_name, last_name, avatar_url, is_verified, coins_balance')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        const u = data as UserProfile;
        if (isAuthAccount) {
          setAuthProfile(u);
          // If no target account was specified in the URL, automatically default target to logged in account
          if (!urlUid && !urlUsername) {
            setProfile(u);
          }
        } else {
          setProfile(u);
        }
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
    }
  }

  async function loadTransactions(userId: string) {
    if (!userId) return;
    setLoadingTransactions(true);
    try {
      const res = await fetch(`/api/v1/users/transactions?userId=${userId}`);
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (err) {
      console.warn('Failed to load transactions:', err);
    } finally {
      setLoadingTransactions(false);
    }
  }

  useEffect(() => {
    if (activeTab === 'transactions' && authUser?.id) {
      loadTransactions(authUser.id);
    }
  }, [activeTab, authUser]);

  // 3. Resolve Target User from URL Params or fallback
  useEffect(() => {
    async function resolveUser() {
      setLoadingProfile(true);
      try {
        if (urlUid) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, first_name, last_name, avatar_url, is_verified, coins_balance')
            .eq('id', urlUid)
            .maybeSingle();

          if (data) {
            setProfile(data as UserProfile);
            setLoadingProfile(false);
            return;
          }
        }

        if (urlUsername) {
          const clean = urlUsername.replace(/^@/, '');
          const { data } = await supabase
            .from('profiles')
            .select('id, username, first_name, last_name, avatar_url, is_verified, coins_balance')
            .ilike('username', clean)
            .maybeSingle();

          if (data) {
            setProfile(data as UserProfile);
            setLoadingProfile(false);
            return;
          }
        }

        // If user is logged in, default to auth user
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, first_name, last_name, avatar_url, is_verified, coins_balance')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (data) {
            setProfile(data as UserProfile);
            setAuthProfile(data as UserProfile);
            setLoadingProfile(false);
            return;
          }
        }
      } catch (err) {
        console.error('Resolve profile err:', err);
      } finally {
        setLoadingProfile(false);
      }
    }

    resolveUser();
  }, [urlUid, urlUsername]);

  // Handle Return Status from Gateway
  useEffect(() => {
    if (urlStatus === 'success') {
      const added = parseInt(urlCoins || '0', 10);
      setPurchasedAmount(added > 0 ? added : selectedTier.coins);
      setCheckoutComplete(true);

      // Re-fetch updated balance
      if (urlUid) {
        supabase
          .from('profiles')
          .select('coins_balance')
          .eq('id', urlUid)
          .maybeSingle()
          .then(({ data }) => {
            if (data && profile) {
              setProfile({ ...profile, coins_balance: data.coins_balance });
            }
          });
      }
    }
  }, [urlStatus, urlCoins, urlUid]);

  // Live Instant Search with Debounce
  useEffect(() => {
    const q = searchQuery.trim().replace(/^@/, '');
    if (!q || q.length < 1) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');
      try {
        const res = await fetch(`/api/v1/users/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (json.users) {
          setSearchResults(json.users);
          setShowSearchDropdown(json.users.length > 0);
        } else {
          setSearchResults([]);
        }
      } catch (err: any) {
        setSearchError('Search failed');
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute pricing
  const effectiveCoins = isCustomAmount ? customCoins : selectedTier.coins;
  const effectivePrice = isCustomAmount
    ? (customCoins * 0.01414)
    : selectedTier.usdPrice;

  // Login Handlers
  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Please enter both email and password.');
      return;
    }
    setLoginLoading(true);
    setLoginError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        setLoginError(error.message);
        return;
      }

      if (data?.user) {
        setAuthUser(data.user);
        await loadUserProfile(data.user.id, true);
        setActiveTab('profile');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed.');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoginLoading(true);
    setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setLoginError(err.message || 'Google Sign-In failed.');
      setLoginLoading(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setAuthUser(null);
    setAuthProfile(null);
  }

  function getPaymentLabel(id: string) {
    switch (id) {
      case 'apple_pay': return 'Apple Pay';
      case 'google_pay': return 'Google Pay';
      case 'samsung_pay': return 'Samsung Pay';
      case 'paypal': return 'PayPal';
      case 'crypto':
      case 'nowpayments': return 'Crypto';
      case 'card':
      case 'stripe':
      default: return 'Card';
    }
  }

  // Handle Checkout Submission
  async function handleProceedToPayment() {
    if (!profile) {
      setActiveTab('recharge');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 100, behavior: 'smooth' });
        setTimeout(() => {
          const input = document.querySelector('.zev-search-input') as HTMLInputElement | null;
          if (input) input.focus();
        }, 150);
      }
      return;
    }

    if (effectiveCoins < 50) {
      alert('Minimum recharge amount is 50 coins.');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/v1/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: profile.id,
          userId: profile.id,
          target_username: profile.username,
          username: profile.username,
          coins: effectiveCoins,
          usd_amount: Number(effectivePrice.toFixed(2)),
          usdAmount: Number(effectivePrice.toFixed(2)),
          gateway: selectedPayment,
          paymentMethod: selectedPayment,
        }),
      });

      const data = await res.json();
      if (!res.ok || (!data.success && !data.redirectUrl && !data.redirect_url)) {
        throw new Error(data.error || 'Failed to initialize payment.');
      }

      const redirect = data.redirectUrl || data.redirect_url;
      if (redirect) {
        window.location.href = redirect;
      } else {
        throw new Error('No redirect URL returned by gateway.');
      }
    } catch (err: any) {
      alert(err.message || 'Checkout failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  function getFullName(u: UserProfile | null) {
    if (!u) return '';
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
    return name || `@${u.username}`;
  }

  return (
    <div className="zev-layout">
      {/* 1. DESKTOP SIDEBAR */}
      <aside className="zev-sidebar">
        <div className="zev-sidebar-top">
          <a href="https://zevapp.com" className="zev-brand-header">
            <div className="zev-brand-logo" style={{ overflow: 'hidden', padding: 0, background: 'transparent', boxShadow: 'none' }}>
              <Image src="/zev-logo.png" alt="ZEV" width={44} height={44} style={{ borderRadius: 14, objectFit: 'cover' }} priority />
            </div>
            <div>
              <div className="zev-brand-name">ZEV Pay</div>
              <div className="zev-brand-tagline">Official Portal</div>
            </div>
          </a>

          <nav className="zev-nav-menu">
            <div
              className={`zev-nav-item ${activeTab === 'recharge' ? 'active' : ''}`}
              onClick={() => setActiveTab('recharge')}
            >
              <Coins className="zev-nav-icon" />
              <span>Recharge Coins</span>
            </div>

            <div
              className={`zev-nav-item ${activeTab === 'transactions' ? 'active' : ''} ${!authUser ? 'disabled' : ''}`}
              onClick={() => {
                if (!authUser) {
                  setTxToast('Please sign in to view your transaction history');
                  setTimeout(() => setTxToast(''), 3000);
                  setActiveTab('profile');
                  return;
                }
                setActiveTab('transactions');
              }}
            >
              <Receipt className="zev-nav-icon" />
              <span>Transactions</span>
              {!authUser && <Lock style={{ width: 12, height: 12, marginLeft: 'auto', opacity: 0.5 }} />}
            </div>

            <div
              className={`zev-nav-item ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <ShieldCheck className="zev-nav-icon" />
              <span>Security & Trust</span>
            </div>

            <div
              className={`zev-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <User className="zev-nav-icon" />
              <span>{authUser && authProfile ? `@${authProfile.username}` : 'Sign In / Profile'}</span>
              {authUser && (
                <span style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10B981' }} />
              )}
            </div>
          </nav>
        </div>

        <div className="zev-sidebar-bottom">
          <div className="zev-sidebar-trust-box">
            <div className="zev-trust-item">
              <ShieldCheck style={{ width: 14, height: 14, color: '#10B981' }} />
              <span>256-Bit SSL Encrypted</span>
            </div>
            <div className="zev-trust-item">
              <Check style={{ width: 14, height: 14, color: '#00D4FF' }} />
              <span>0% Platform Surcharge</span>
            </div>
            <div className="zev-trust-item">
              <Lock style={{ width: 14, height: 14, color: '#536DFE' }} />
              <span>Verified Direct Deposit</span>
            </div>
          </div>

          {!isInstalled && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="zev-sidebar-install-card"
              style={{ marginBottom: 10 }}
            >
              <div className="zev-install-icon">
                <Download style={{ width: 16, height: 16 }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#080D1A' }}>Install Web App</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>1-Tap quick home screen access</div>
              </div>
            </button>
          )}

          <a
            href="https://play.google.com/store/apps/details?id=com.zevapp.app"
            target="_blank"
            rel="noopener noreferrer"
            className="zev-app-btn"
          >
            <span>Open ZEV App</span>
            <ExternalLink style={{ width: 13, height: 13 }} />
          </a>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="zev-main-container">
        {/* Mobile Header Bar */}
        <header className="zev-mobile-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="zev-brand-logo" style={{ width: 36, height: 36, borderRadius: 12, overflow: 'hidden', padding: 0, background: 'transparent', boxShadow: 'none' }}>
              <Image src="/zev-logo.png" alt="ZEV" width={36} height={36} style={{ borderRadius: 12, objectFit: 'cover' }} priority />
            </div>
            <span style={{ fontSize: 17, fontWeight: 900, color: '#080D1A' }}>ZEV Pay</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {authUser && authProfile && (
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 16,
                  backgroundColor: '#E0F2FE',
                  border: '1px solid #BAE6FD',
                  cursor: 'pointer',
                  color: '#0284C7',
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                <User style={{ width: 13, height: 13 }} />
                <span>@{authProfile.username}</span>
              </button>
            )}

            {!isInstalled && (
              <button
                type="button"
                onClick={handleInstallClick}
                className="zev-install-btn"
                title="Install ZEV Pay Web App"
              >
                <Download style={{ width: 12, height: 12 }} />
                <span>Install</span>
              </button>
            )}

            <a
              href="https://play.google.com/store/apps/details?id=com.zevapp.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 800,
                padding: '6px 12px',
                borderRadius: 20,
                backgroundColor: '#F1F5F9',
                color: '#080D1A',
                textDecoration: 'none',
              }}
            >
              <span>App</span>
              <ArrowUpRight style={{ width: 12, height: 12 }} />
            </a>
          </div>
        </header>

        {/* Mobile Top Segmented Tab Navigation */}
        <div className="zev-mobile-top-tabs">
          <button
            type="button"
            className={`zev-top-tab-item ${activeTab === 'recharge' ? 'active' : ''}`}
            onClick={() => setActiveTab('recharge')}
          >
            <Coins style={{ width: 14, height: 14 }} />
            <span>Recharge</span>
          </button>

          <button
            type="button"
            className={`zev-top-tab-item ${activeTab === 'transactions' ? 'active' : ''} ${!authUser ? 'disabled' : ''}`}
            onClick={() => {
              if (!authUser) {
                setTxToast('Please sign in to view transaction history');
                setTimeout(() => setTxToast(''), 3000);
                setActiveTab('profile');
                return;
              }
              setActiveTab('transactions');
            }}
          >
            <Receipt style={{ width: 14, height: 14 }} />
            <span>Orders</span>
            {!authUser && <Lock style={{ width: 10, height: 10, opacity: 0.6 }} />}
          </button>

          <button
            type="button"
            className={`zev-top-tab-item ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <ShieldCheck style={{ width: 14, height: 14 }} />
            <span>Security</span>
          </button>

          <button
            type="button"
            className={`zev-top-tab-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User style={{ width: 14, height: 14 }} />
            <span>{authUser && authProfile ? `@${authProfile.username}` : 'Sign In'}</span>
          </button>
        </div>

        <div className="zev-content-wrapper">
          {/* TAB 1: RECHARGE COINS */}
          {activeTab === 'recharge' && (
            <>
              {/* PWA Mobile Install Banner */}
              {showInstallBanner && !isInstalled && (
                <div className="zev-install-banner">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                      <Image src="/zev-logo.png" alt="ZEV Pay" width={32} height={32} />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#080D1A' }}>Install ZEV Pay Web App</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>Add to home screen for instant 1-tap top-ups</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className="zev-install-action-btn"
                    >
                      Install
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInstallBanner(false)}
                      className="zev-install-dismiss-btn"
                      aria-label="Close"
                    >
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Hero Value Banner */}
              <div className="zev-hero-banner">
                <div className="zev-hero-left">
                  <div className="zev-hero-icon-box">
                    <Zap style={{ width: 24, height: 24 }} />
                  </div>
                  <div>
                    <div className="zev-hero-title">
                      <span>Recharge ZEV Virtual Coins</span>
                      <span className="zev-hero-badge">0% APP STORE FEES</span>
                    </div>
                    <p className="zev-hero-subtitle">
                      Web top-ups give you maximum coins per dollar. Deposited directly to your account in seconds.
                    </p>
                  </div>
                </div>
              </div>

              {/* 1. Account Section */}
              <div className="zev-target-section">
                <div className="zev-section-title">
                  <UserCheck style={{ width: 15, height: 15, color: '#00D4FF' }} />
                  <span>Target Account</span>
                  {authUser && profile?.id === authUser.id && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#059669', fontWeight: 800, backgroundColor: '#ECFDF5', padding: '2px 8px', borderRadius: 8 }}>
                      Connected Account (You)
                    </span>
                  )}
                </div>

                {loadingProfile ? (
                  <div className="zev-user-card" style={{ opacity: 0.6 }}>
                    <div className="zev-user-left">
                      <div className="zev-user-avatar" />
                      <div>
                        <div style={{ height: 16, width: 140, background: '#E2E8F0', borderRadius: 4, marginBottom: 6 }} />
                        <div style={{ height: 12, width: 90, background: '#F1F5F9', borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                ) : profile ? (
                  <div className="zev-user-card">
                    <div className="zev-user-left">
                      <div className="zev-user-avatar">
                        {profile.avatar_url ? (
                          <Image
                            src={profile.avatar_url}
                            alt={profile.username}
                            width={52}
                            height={52}
                            unoptimized
                          />
                        ) : (
                          <div className="zev-avatar-fallback">
                            {(profile.first_name || profile.username || 'Z')[0].toUpperCase()}
                          </div>
                        )}
                        {profile.is_verified && <div className="zev-verified-tag">✓</div>}
                      </div>

                      <div className="zev-user-details">
                        <h4>
                          <span>{getFullName(profile)}</span>
                          {profile.is_verified && <span style={{ color: '#00D4FF', fontSize: 13, marginLeft: 4 }}>✓</span>}
                        </h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          <span className="zev-user-handle">@{profile.username}</span>
                          <span style={{ color: '#94A3B8', fontSize: 10 }}>•</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#D97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Coins style={{ width: 12, height: 12 }} />
                            <span>{(profile.coins_balance ?? 0).toLocaleString()} Coins</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="zev-user-right">
                      <button
                        type="button"
                        onClick={() => {
                          setProfile(null);
                          setSearchQuery('');
                        }}
                        className="zev-switch-account-btn"
                      >
                        {authUser && profile?.id === authUser.id ? 'Gift a Friend' : 'Change'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="zev-search-card" ref={searchDropdownRef}>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (searchResults.length > 0) {
                          setProfile(searchResults[0]);
                          setShowSearchDropdown(false);
                        }
                      }}
                      className="zev-search-form"
                    >
                      <div className="zev-search-input-wrap">
                        <Search className="zev-search-icon" style={{ width: 16, height: 16 }} />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onFocus={() => {
                            if (searchResults.length > 0) setShowSearchDropdown(true);
                          }}
                          placeholder="Type ZEV @username or name to search..."
                          className="zev-search-input"
                        />
                      </div>
                      <button type="submit" disabled={isSearching} className="zev-search-btn">
                        {isSearching ? <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Search style={{ width: 16, height: 16 }} />}
                        <span>Find</span>
                      </button>
                    </form>

                    {!authUser && (
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(226, 232, 240, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ color: '#64748B', fontWeight: 600 }}>Recharging your own account?</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('profile')}
                          style={{
                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.12) 0%, rgba(83, 109, 254, 0.08) 100%)',
                            border: '1px solid rgba(0, 212, 255, 0.25)',
                            color: '#0284C7',
                            fontWeight: 800,
                            cursor: 'pointer',
                            padding: '6px 14px',
                            borderRadius: 12,
                            boxShadow: '0 2px 6px rgba(0, 212, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.2s',
                          }}
                        >
                          <User style={{ width: 13, height: 13 }} />
                          <span>Sign In for Instant Recharge</span>
                          <ArrowRight style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    )}

                    {/* Instant Suggestions Dropdown */}
                    {showSearchDropdown && searchResults.length > 0 && (
                      <div className="zev-search-dropdown">
                        {searchResults.map((user) => (
                          <div
                            key={user.id}
                            onClick={() => {
                              setProfile(user);
                              setShowSearchDropdown(false);
                              setSearchQuery('');
                            }}
                            className="zev-dropdown-item"
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', background: '#E2E8F0', flexShrink: 0 }}>
                                {user.avatar_url ? (
                                  <Image src={user.avatar_url} alt={user.username} width={36} height={36} unoptimized />
                                ) : (
                                  <div className="zev-avatar-fallback" style={{ fontSize: 13 }}>
                                    {(user.first_name || user.username)[0].toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#080D1A', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span>{getFullName(user)}</span>
                                  {user.is_verified && <span style={{ color: '#00D4FF', fontSize: 11 }}>✓</span>}
                                </div>
                                <div style={{ fontSize: 11.5, color: '#718096' }}>@{user.username}</div>
                              </div>
                            </div>

                            <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Coins style={{ width: 13, height: 13 }} />
                              <span>{(user.coins_balance ?? 0).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Packages Grid */}
              <div className="zev-tiers-section">
                <div className="zev-section-title">
                  <Coins style={{ width: 15, height: 15, color: '#D97706' }} />
                  <span>Select Coin Package</span>
                </div>

                <div className="zev-tiers-grid">
                  {tiers.map((tier) => {
                    const isSelected = !isCustomAmount && selectedTier.id === tier.id;

                    return (
                      <div
                        key={tier.id}
                        onClick={() => {
                          setIsCustomAmount(false);
                          setSelectedTier(tier);
                        }}
                        className={`zev-tier-card ${isSelected ? 'selected' : ''}`}
                      >
                        {tier.badge && (
                          <div className={`zev-tier-badge ${tier.popular ? 'popular' : 'default'}`}>
                            {tier.badge}
                          </div>
                        )}

                        <div className="zev-tier-top">
                          <div className="zev-tier-icon-circle">
                            <Coins style={{ width: 18, height: 18 }} />
                          </div>
                          <div>
                            <div className="zev-tier-amount">{tier.coins.toLocaleString()}</div>
                            <div className="zev-tier-label">Coins</div>
                          </div>
                        </div>

                        <div className="zev-tier-bottom">
                          <span className="zev-tier-price">${tier.usdPrice.toFixed(2)}</span>
                          {tier.discountPercent && (
                            <span className="zev-tier-savings">Save {tier.discountPercent}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Custom Package Card */}
                  <div
                    onClick={() => setIsCustomAmount(true)}
                    className={`zev-tier-card ${isCustomAmount ? 'selected' : ''}`}
                  >
                    <div className="zev-tier-top">
                      <div className="zev-tier-icon-circle" style={{ background: '#E0F2FE', borderColor: '#BAE6FD', color: '#0284C7' }}>
                        <Sparkles style={{ width: 18, height: 18 }} />
                      </div>
                      <div>
                        <div className="zev-tier-amount" style={{ fontSize: 17 }}>Custom</div>
                        <div className="zev-tier-label">Any Amount</div>
                      </div>
                    </div>

                    <div className="zev-tier-bottom">
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#0284C7', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span>Flexible</span>
                        <ChevronRight style={{ width: 14, height: 14 }} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Custom Amount Slider */}
                {isCustomAmount && (
                  <div className="zev-custom-card">
                    <div className="zev-custom-header">
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, color: '#4A5568' }}>
                          Choose Exact Coin Amount
                        </span>
                        <p style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>Min 50 coins • Max 200,000 coins</p>
                      </div>
                      <div className="zev-custom-input-box">
                        <input
                          type="number"
                          min={50}
                          max={200000}
                          value={customCoins}
                          onChange={(e) => setCustomCoins(Math.max(50, Math.min(200000, parseInt(e.target.value) || 0)))}
                          className="zev-custom-input"
                        />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#D97706' }}>Coins</span>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={50}
                      max={50000}
                      step={50}
                      value={customCoins}
                      onChange={(e) => setCustomCoins(parseInt(e.target.value))}
                      className="zev-custom-range"
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#718096' }}>
                      <span>Estimated Total:</span>
                      <strong style={{ color: '#080D1A', fontSize: 14 }}>${(customCoins * 0.01414).toFixed(2)} USD</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Payment Method Section */}
              <div style={{ marginBottom: 30 }}>
                {/* Stripe Express One-Click Checkout (Apple Pay, Google Pay, Link, Amazon Pay) */}
                <StripeExpressCheckout
                  amount={effectivePrice}
                  coins={effectiveCoins}
                  targetUser={
                    profile
                      ? {
                          id: profile.id,
                          username: profile.username,
                          full_name: profile.first_name
                            ? `${profile.first_name} ${profile.last_name || ''}`.trim()
                            : undefined,
                        }
                      : null
                  }
                  onPaymentStart={() => setIsProcessing(true)}
                  onPaymentError={(err) => {
                    setIsProcessing(false);
                    alert(err);
                  }}
                  onPaymentSuccess={() => {
                    setIsProcessing(false);
                  }}
                />

                <div className="zev-section-title">
                  <CreditCard style={{ width: 15, height: 15, color: '#536DFE' }} />
                  <span>Select Payment Method</span>
                </div>

                {/* Compact Branded Payment Buttons Grid (Mobile-Safe) */}
                <div className="zev-compact-payment-grid">
                  {[
                    {
                      id: 'apple_pay',
                      name: 'Apple Pay',
                      bg: '#000000',
                      color: '#FFFFFF',
                      border: '1.5px solid rgba(255, 255, 255, 0.2)',
                      isLight: false,
                      icon: (
                        <svg width="16" height="16" viewBox="0 0 170 170" fill="currentColor" style={{ display: 'block' }}>
                          <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.07-7.86-7.94-12.49-14.6-5.99-8.68-10.74-18.73-14.25-30.13-3.51-11.41-5.27-22.39-5.27-32.96 0-16.09 4.18-29.43 12.54-40.03 8.36-10.6 18.89-16.03 31.6-16.3 4.88 0 10.15 1.25 15.82 3.75 5.66 2.5 9.73 3.81 12.21 3.93 2.13-.22 6.33-1.61 12.6-4.16 6.28-2.56 11.66-3.72 16.14-3.5 11.96.65 21.6 4.9 28.93 12.74-10.45 6.3-15.61 15.11-15.48 26.43.13 8.8 3.51 16.18 10.14 22.13 6.63 5.95 14.54 9.4 23.73 10.36-2.18 6.74-4.89 13.59-8.14 20.55zM119.22 31.84c0-7.39 2.66-14.38 7.98-20.97 5.32-6.59 11.93-10.66 19.83-12.21.22 1.3.33 2.45.33 3.45 0 7.39-2.8 14.61-8.39 21.66-5.59 7.05-12.42 11.19-20.49 12.42-.43-1.41-.65-2.76-.65-4.35z"/>
                        </svg>
                      ),
                    },
                    {
                      id: 'google_pay',
                      name: 'Google Pay',
                      bg: '#FFFFFF',
                      color: '#1F1F1F',
                      border: '1.5px solid #CBD5E1',
                      isLight: true,
                      icon: (
                        <svg width="17" height="17" viewBox="0 0 24 24" style={{ display: 'block' }}>
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                      ),
                    },
                    {
                      id: 'samsung_pay',
                      name: 'Samsung Pay',
                      bg: 'linear-gradient(135deg, #034EA2 0%, #002B66 100%)',
                      color: '#FFFFFF',
                      border: '1.5px solid rgba(255, 255, 255, 0.25)',
                      isLight: false,
                      icon: (
                        <span style={{ fontSize: 12.5, fontWeight: 900, color: '#00D4FF', background: 'rgba(255,255,255,0.12)', width: 20, height: 20, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>S</span>
                      ),
                    },
                    {
                      id: 'card',
                      name: 'Card (Visa/MC)',
                      bg: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                      color: '#FFFFFF',
                      border: '1.5px solid rgba(255, 255, 255, 0.2)',
                      isLight: false,
                      icon: (
                        <CreditCard style={{ width: 17, height: 17, color: '#00D4FF', flexShrink: 0 }} />
                      ),
                    },
                    {
                      id: 'paypal',
                      name: 'PayPal',
                      bg: 'linear-gradient(135deg, #003087 0%, #0070BA 100%)',
                      color: '#FFFFFF',
                      border: '1.5px solid rgba(255, 255, 255, 0.25)',
                      isLight: false,
                      icon: (
                        <svg width="17" height="19" viewBox="0 0 24 28" fill="none" style={{ display: 'block' }}>
                          <path d="M21.2 7.3c-.4 2.8-2 5.2-4.5 6.4-1.2.6-2.6.9-4.2.9h-3.2c-.6 0-1 .4-1.1 1l-1.3 8c-.1.4-.4.7-.8.7H2.4c-.5 0-.8-.4-.7-.9L6.1 2.9c.1-.5.5-.9 1-.9h7.4c2.8 0 5 .8 6 2.5.4.7.7 1.7.7 2.8z" fill="#00D4FF"/>
                          <path d="M9.3 14.6h3.2c1.6 0 3-.3 4.2-.9 2.5-1.2 4.1-3.6 4.5-6.4.1-.7.1-1.3 0-1.9-.5 4.3-3.6 6.8-7.9 6.8H9.3c-.6 0-1 .4-1.1 1l-1.8 11.2c-.1.4.2.8.6.8h3.3c.4 0 .7-.3.8-.7l1.1-7c.1-.6.5-1 1-1z" fill="#FFFFFF"/>
                        </svg>
                      ),
                    },
                    {
                      id: 'crypto',
                      name: 'Crypto (USDT)',
                      bg: 'linear-gradient(135deg, #061822 0%, #0B2535 100%)',
                      color: '#FFFFFF',
                      border: '1.5px solid rgba(16, 185, 129, 0.4)',
                      isLight: false,
                      icon: (
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 900, background: '#26A17B', color: '#FFFFFF', padding: '1px 3px', borderRadius: 2 }}>₮</span>
                          <span style={{ fontSize: 9, fontWeight: 900, background: '#F7931A', color: '#FFFFFF', padding: '1px 3px', borderRadius: 2 }}>₿</span>
                        </div>
                      ),
                    },
                  ].map((method) => {
                    const isSelected = selectedPayment === method.id;
                    return (
                      <div
                        key={method.id}
                        onClick={() => setSelectedPayment(method.id)}
                        className={`zev-compact-pay-btn ${isSelected ? 'selected' : ''}`}
                        style={{
                          background: method.bg,
                          color: method.color,
                          borderColor: isSelected ? '#00D4FF' : (method.border as string),
                        }}
                      >
                        <div className="zev-compact-pay-left">
                          <div className="zev-compact-pay-icon">
                            {method.icon}
                          </div>
                          <span className="zev-compact-pay-name" style={{ color: method.color }}>
                            {method.name}
                          </span>
                        </div>

                        <div className={`zev-compact-pay-radio ${method.isLight ? 'light-theme' : ''} ${isSelected ? (method.isLight ? 'selected-light' : 'selected') : ''}`}>
                          {isSelected && <Check style={{ width: 11, height: 11, strokeWidth: 3 }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trust & Guarantee Banner */}
              <div className="zev-trust-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: '#080D1A', marginBottom: 6 }}>
                  <ShieldCheck style={{ width: 18, height: 18, color: '#10B981' }} />
                  <span>Official ZEV Security Guarantee</span>
                </div>
                <p style={{ fontSize: 12, color: '#718096', lineHeight: 1.5 }}>
                  Purchases made via ZEV Pay official web portal are protected by 256-bit cryptographic encryption. Coins are credited instantly to your account without third-party commissions.
                </p>
              </div>
            </>
          )}

          {/* TAB 2: SECURITY & TRUST */}
          {activeTab === 'security' && (
            <div className="zev-security-container" style={{ padding: '10px 0 60px 0' }}>
              <div className="zev-auth-header" style={{ marginBottom: 16 }}>
                <div className="zev-auth-icon-circle" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                  <ShieldCheck style={{ width: 28, height: 28 }} />
                </div>
                <h2 className="zev-auth-title">Bank-Grade Payment Security</h2>
                <p className="zev-auth-desc">
                  All transactions on ZEV Pay are end-to-end encrypted and verified via official cryptographic webhooks.
                </p>
              </div>

              <div className="zev-security-grid">
                <div className="zev-security-card">
                  <div className="zev-security-card-icon">
                    <Lock style={{ width: 22, height: 22 }} />
                  </div>
                  <div className="zev-security-card-title">256-Bit SSL Encryption</div>
                  <div className="zev-security-card-desc">
                    Your payment information is encrypted using industry-standard TLS 1.3 and 256-bit SSL protocols.
                  </div>
                </div>

                <div className="zev-security-card">
                  <div className="zev-security-card-icon" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                    <Zap style={{ width: 22, height: 22 }} />
                  </div>
                  <div className="zev-security-card-title">Instant Account Credit</div>
                  <div className="zev-security-card-desc">
                    Coins are credited automatically to your ZEV database profile within seconds of gateway confirmation.
                  </div>
                </div>

                <div className="zev-security-card">
                  <div className="zev-security-card-icon" style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}>
                    <Coins style={{ width: 22, height: 22 }} />
                  </div>
                  <div className="zev-security-card-title">0% App Store Fees</div>
                  <div className="zev-security-card-desc">
                    By purchasing through the official web portal, you avoid the 30% App Store tax and get maximum coin value.
                  </div>
                </div>

                <div className="zev-security-card">
                  <div className="zev-security-card-icon" style={{ backgroundColor: '#FAF5FF', color: '#9333EA' }}>
                    <CheckCircle2 style={{ width: 22, height: 22 }} />
                  </div>
                  <div className="zev-security-card-title">Triple Gateway Protection</div>
                  <div className="zev-security-card-desc">
                    Official bank-grade security with Visa, Mastercard, PayPal, and leading blockchain networks ensure 100% buyer protection and chargeback safety.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PROFILE & ACCOUNT */}
          {activeTab === 'profile' && (
            <div style={{ padding: '10px 0 60px 0' }}>
              {authUser && authProfile ? (
                /* Logged-In Profile View */
                <div className="zev-profile-card">
                  <div className="zev-profile-user-hero">
                    <div className="zev-profile-avatar-big">
                      {authProfile.avatar_url ? (
                        <Image
                          src={authProfile.avatar_url}
                          alt={authProfile.username}
                          width={72}
                          height={72}
                          unoptimized
                        />
                      ) : (
                        <div className="zev-avatar-fallback">
                          {(authProfile.first_name || authProfile.username || 'Z')[0].toUpperCase()}
                        </div>
                      )}
                      {authProfile.is_verified && <div className="zev-verified-tag">✓</div>}
                    </div>
                    <div className="zev-profile-names">
                      <h3>
                        <span>{getFullName(authProfile)}</span>
                        {authProfile.is_verified && <Sparkles style={{ width: 16, height: 16, color: '#00D4FF' }} />}
                      </h3>
                      <p>@{authProfile.username}</p>
                    </div>
                  </div>

                  {/* Balance Card */}
                  <div className="zev-profile-balance-box">
                    <div className="zev-balance-left">
                      <div className="zev-balance-coin-icon">
                        <Coins style={{ width: 26, height: 26 }} />
                      </div>
                      <div>
                        <div className="zev-balance-amount">
                          {(authProfile.coins_balance ?? 0).toLocaleString()}
                        </div>
                        <div className="zev-balance-label">Current Virtual Coins</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#059669', backgroundColor: '#ECFDF5', padding: '6px 10px', borderRadius: 10 }}>
                      <CheckCircle2 style={{ width: 13, height: 13 }} />
                      <span>Active & Synced</span>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="zev-profile-actions">
                    <button
                      type="button"
                      className="zev-profile-recharge-btn"
                      onClick={() => {
                        setProfile(authProfile);
                        setActiveTab('recharge');
                      }}
                    >
                      <Coins style={{ width: 18, height: 18 }} />
                      <span>Recharge This Account Now</span>
                    </button>

                    <button
                      type="button"
                      className="zev-profile-signout-btn"
                      onClick={handleSignOut}
                    >
                      <LogOut style={{ width: 16, height: 16 }} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Sign In View */
                <div className="zev-auth-card">
                  <div className="zev-auth-header">
                    <div className="zev-auth-icon-circle">
                      <User style={{ width: 28, height: 28 }} />
                    </div>
                    <h2 className="zev-auth-title">Sign In to ZEV</h2>
                    <p className="zev-auth-desc">
                      Sign in to recharge your account directly without manual search and view your coin balance.
                    </p>
                  </div>

                  {loginError && (
                    <div className="zev-auth-error">
                      <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                      <span>{loginError}</span>
                    </div>
                  )}

                  {/* 1. Continue with Google */}
                  <button
                    type="button"
                    className="zev-google-btn"
                    onClick={handleGoogleLogin}
                    disabled={loginLoading}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </button>

                  <div className="zev-auth-divider">
                    <div className="zev-auth-divider-line" />
                    <span className="zev-auth-divider-text">Or continue with email</span>
                    <div className="zev-auth-divider-line" />
                  </div>

                  {/* 2. Email / Password Form */}
                  <form onSubmit={handleEmailLogin}>
                    <div className="zev-form-group">
                      <label className="zev-form-label">Email Address</label>
                      <div className="zev-form-input-wrap">
                        <Mail className="zev-form-input-icon" style={{ width: 17, height: 17 }} />
                        <input
                          type="email"
                          placeholder="name@example.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="zev-form-input"
                          required
                        />
                      </div>
                    </div>

                    <div className="zev-form-group">
                      <label className="zev-form-label">Password</label>
                      <div className="zev-form-input-wrap">
                        <Lock className="zev-form-input-icon" style={{ width: 17, height: 17 }} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="zev-form-input"
                          required
                        />
                        <button
                          type="button"
                          className="zev-password-toggle"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="zev-auth-submit-btn"
                      disabled={loginLoading}
                    >
                      {loginLoading ? (
                        <RefreshCw className="zev-spin" style={{ width: 18, height: 18 }} />
                      ) : (
                        <>
                          <span>Sign In</span>
                          <ArrowRight style={{ width: 16, height: 16 }} />
                        </>
                      )}
                    </button>
                  </form>

                  <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#718096' }}>
                    Don't have an account yet?{' '}
                    <a
                      href="https://play.google.com/store/apps/details?id=com.zevapp.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#0284C7', fontWeight: 800, textDecoration: 'none' }}
                    >
                      Download ZEV App
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TRANSACTION HISTORY */}
          {activeTab === 'transactions' && (
            <div className="zev-transactions-container">
              <div className="zev-transactions-card">
                <div className="zev-auth-header">
                  <div className="zev-auth-icon-circle">
                    <Receipt style={{ width: 28, height: 28 }} />
                  </div>
                  <h2 className="zev-auth-title">Transaction History</h2>
                  <p className="zev-auth-desc">
                    Official database record of all coin recharges credited to your ZEV account.
                  </p>
                </div>

                {loadingTransactions ? (
                  <div style={{ padding: '44px 20px', textAlign: 'center', color: '#64748B' }}>
                    <RefreshCw className="zev-spin" style={{ width: 26, height: 26, margin: '0 auto 12px auto', color: '#00D4FF' }} />
                    <p style={{ fontSize: 13, fontWeight: 700 }}>Loading transactions from database...</p>
                  </div>
                ) : transactions.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B' }}>
                    <Clock style={{ width: 44, height: 44, margin: '0 auto 14px auto', opacity: 0.35, color: '#64748B' }} />
                    <h4 style={{ fontSize: 17, fontWeight: 900, color: '#080D1A' }}>No Purchases Yet</h4>
                    <p style={{ fontSize: 13, marginTop: 4, maxWidth: 320, margin: '4px auto 0 auto' }}>
                      Any coin recharges you complete will automatically appear here with full receipt details.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('recharge')}
                      className="zev-checkout-btn"
                      style={{ margin: '22px auto 0 auto', padding: '12px 26px', fontSize: 13.5 }}
                    >
                      <Coins style={{ width: 16, height: 16 }} />
                      <span>Top Up Coins Now</span>
                    </button>
                  </div>
                ) : (
                  <div className="zev-tx-list">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="zev-tx-item">
                        <div className="zev-tx-left">
                          <div className="zev-tx-icon-box">
                            <Coins style={{ width: 20, height: 20 }} />
                          </div>
                          <div>
                            <div className="zev-tx-title">
                              <span>+{tx.coins_amount?.toLocaleString()} Coins</span>
                              <span className="zev-tx-status-badge">Completed</span>
                            </div>
                            <div className="zev-tx-meta">
                              <span>Via {tx.payment_gateway}</span>
                              <span>•</span>
                              <span>
                                {new Date(tx.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="zev-tx-right">
                          <span className="zev-tx-amount">${Number(tx.usd_amount || 0).toFixed(2)} USD</span>
                          <span className="zev-tx-order">#{tx.order_id?.slice(-8)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 3. STICKY BOTTOM CHECKOUT BAR (Visible when in recharge tab) */}
      {activeTab === 'recharge' && (
        <div className="zev-bottom-bar">
          <div className="zev-bottom-inner">
            <div className="zev-bottom-summary">
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748B' }}>Total Coins</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#D97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Coins style={{ width: 16, height: 16 }} />
                  <span>{effectiveCoins.toLocaleString()}</span>
                </div>
              </div>

              <div style={{ width: 1, height: 28, backgroundColor: '#E2E8F0' }} />

              <div>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#64748B' }}>Total Amount</div>
                <div style={{ fontSize: 19, fontWeight: 900, color: '#080D1A' }}>
                  ${effectivePrice.toFixed(2)} USD
                </div>
              </div>
            </div>

            <button
              onClick={handleProceedToPayment}
              disabled={isProcessing}
              className="zev-checkout-btn"
            >
              {isProcessing ? (
                <>
                  <RefreshCw style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                  <span>Connecting...</span>
                </>
              ) : !profile ? (
                <>
                  <UserCheck style={{ width: 15, height: 15 }} />
                  <span>Select Target</span>
                </>
              ) : (
                <>
                  <Lock style={{ width: 15, height: 15 }} />
                  <span>Pay ${effectivePrice.toFixed(2)} with {getPaymentLabel(selectedPayment)}</span>
                  <ArrowRight style={{ width: 15, height: 15 }} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 4. MOBILE BOTTOM NAVIGATION BAR (4 Buttons) */}
      <nav className="zev-mobile-nav">
        <button
          type="button"
          className={`zev-mobile-nav-item ${activeTab === 'recharge' ? 'active' : ''}`}
          onClick={() => setActiveTab('recharge')}
        >
          <Coins style={{ width: 19, height: 19 }} />
          <span>Recharge</span>
        </button>

        <button
          type="button"
          className={`zev-mobile-nav-item ${activeTab === 'transactions' ? 'active' : ''} ${!authUser ? 'disabled' : ''}`}
          onClick={() => {
            if (!authUser) {
              setTxToast('Please sign in to view your transaction history');
              setTimeout(() => setTxToast(''), 3000);
              setActiveTab('profile');
              return;
            }
            setActiveTab('transactions');
          }}
        >
          <Receipt style={{ width: 19, height: 19 }} />
          <span>Orders</span>
        </button>

        <button
          type="button"
          className={`zev-mobile-nav-item ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          <ShieldCheck style={{ width: 19, height: 19 }} />
          <span>Security</span>
        </button>

        <button
          type="button"
          className={`zev-mobile-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User style={{ width: 19, height: 19 }} />
          <span>{authUser && authProfile ? 'Profile' : 'Sign In'}</span>
        </button>
      </nav>

      {/* Toast Notification */}
      {txToast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(8, 13, 26, 0.92)',
            backdropFilter: 'blur(16px)',
            color: '#FFFFFF',
            padding: '10px 20px',
            borderRadius: 9999,
            fontSize: 12.5,
            fontWeight: 800,
            zIndex: 120,
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Lock style={{ width: 14, height: 14, color: '#00D4FF' }} />
          <span>{txToast}</span>
        </div>
      )}

      {/* 5. SUCCESS MODAL */}
      {checkoutComplete && (
        <div className="zev-modal-backdrop">
          <div className="zev-modal">
            <div className="zev-modal-icon">
              <CheckCircle2 style={{ width: 36, height: 36 }} />
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#080D1A' }}>Recharge Successful!</h3>
            <p style={{ fontSize: 12.5, color: '#718096', marginTop: 4 }}>
              Your ZEV Coins have been successfully deposited directly to your account.
            </p>

            <div style={{ margin: '20px 0', padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#718096' }}>Target Account:</span>
                <strong style={{ color: '#080D1A' }}>@{profile?.username}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#718096' }}>Coins Deposited:</span>
                <strong style={{ color: '#D97706' }}>+{purchasedAmount.toLocaleString()} Coins</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#718096' }}>Delivery Status:</span>
                <strong style={{ color: '#10B981' }}>Instant Credited</strong>
              </div>
            </div>

            <button
              onClick={() => {
                setCheckoutComplete(false);
                window.history.replaceState({}, '', window.location.pathname);
              }}
              className="zev-checkout-btn"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <span>Done</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. PWA INSTALL MODAL */}
      {showInstallModal && (
        <div className="zev-modal-backdrop" onClick={() => setShowInstallModal(false)}>
          <div className="zev-install-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748B',
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>

            <div style={{ width: 64, height: 64, borderRadius: 20, overflow: 'hidden', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(0, 212, 255, 0.25)' }}>
              <Image src="/zev-logo.png" alt="ZEV Pay" width={64} height={64} priority />
            </div>

            <h3 style={{ fontSize: 19, fontWeight: 900, color: '#080D1A', marginBottom: 6 }}>
              Install ZEV Pay App
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20, lineHeight: 1.5 }}>
              Add to your phone&apos;s home screen for fast 1-tap recharges with 0% App Store fees!
            </p>

            {isIOS ? (
              <div style={{ marginBottom: 20 }}>
                <div className="zev-install-step">
                  <div className="zev-install-step-num">1</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#080D1A' }}>Tap the Share icon</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>
                      Tap the <strong>Share</strong> button ( <Share style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle' }} /> ) at the bottom of Safari
                    </div>
                  </div>
                </div>
                <div className="zev-install-step">
                  <div className="zev-install-step-num">2</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#080D1A' }}>Add to Home Screen</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>
                      Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong> ( <PlusSquare style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle' }} /> )
                    </div>
                  </div>
                </div>
                <div className="zev-install-step">
                  <div className="zev-install-step-num">3</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#080D1A' }}>Tap Add</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>
                      Tap <strong>Add</strong> in the top right. Done!
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div className="zev-install-step">
                  <div className="zev-install-step-num">1</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#080D1A' }}>Open Chrome Menu</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>
                      Tap the <strong>3 dots (⋮)</strong> menu in Chrome
                    </div>
                  </div>
                </div>
                <div className="zev-install-step">
                  <div className="zev-install-step-num">2</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#080D1A' }}>Install App</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>
                      Tap <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowInstallModal(false)}
              style={{
                width: '100%',
                padding: '13px 20px',
                borderRadius: 16,
                background: 'linear-gradient(135deg, var(--primary-cyan) 0%, #00B8E6 100%)',
                color: '#080D1A',
                fontWeight: 900,
                fontSize: 14,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(0, 212, 255, 0.35)',
              }}
            >
              Got It!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ZevPayPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
          <RefreshCw style={{ width: 32, height: 32, color: '#00D4FF', animation: 'spin 1s linear infinite' }} />
        </div>
      }
    >
      <ZevPayContent />
    </Suspense>
  );
}
