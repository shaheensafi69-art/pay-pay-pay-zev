'use client';

import React, { useEffect, useRef, useState } from 'react';
import { loadStripe, Stripe, StripeElements, StripeExpressCheckoutElement } from '@stripe/stripe-js';
import { Zap, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';

interface StripeExpressCheckoutProps {
  amount: number; // in USD (e.g. 9.49)
  coins: number;
  targetUser: { id: string; username: string; full_name?: string } | null;
  onPaymentStart?: () => void;
  onPaymentError?: (message: string) => void;
  onPaymentSuccess?: (orderId: string) => void;
}

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
let stripePromise: Promise<Stripe | null> | null = null;

function getStripe(): Promise<Stripe | null> {
  if (!stripePromise && stripePublishableKey) {
    stripePromise = loadStripe(stripePublishableKey);
  }
  return stripePromise || Promise.resolve(null);
}

export default function StripeExpressCheckout({
  amount,
  coins,
  targetUser,
  onPaymentStart,
  onPaymentError,
  onPaymentSuccess,
}: StripeExpressCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const expressCheckoutRef = useRef<StripeExpressCheckoutElement | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [hasWallets, setHasWallets] = useState<boolean | null>(null);
  const [walletTypes, setWalletTypes] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep targetUser, amount, coins accessible in callbacks
  const stateRef = useRef({ targetUser, amount, coins });
  useEffect(() => {
    stateRef.current = { targetUser, amount, coins };
  }, [targetUser, amount, coins]);

  // Update amount dynamically in elements whenever package changes
  useEffect(() => {
    if (elementsRef.current && amount > 0) {
      const cents = Math.max(50, Math.round(amount * 100));
      elementsRef.current.update({ amount: cents });
    }
  }, [amount]);

  useEffect(() => {
    let isMounted = true;

    async function initExpressCheckout() {
      if (!stripePublishableKey) {
        if (isMounted) {
          setIsLoading(false);
          setErrorMessage('Stripe Publishable Key missing');
        }
        return;
      }

      try {
        const stripe = await getStripe();
        if (!stripe || !isMounted || !containerRef.current) return;

        const cents = Math.max(50, Math.round(amount * 100));

        // 1. Initialize Stripe Elements with Payment Mode
        const elements = stripe.elements({
          mode: 'payment',
          amount: cents,
          currency: 'usd',
          appearance: {
            theme: 'stripe',
            variables: {
              borderRadius: '16px',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              colorBackground: '#FFFFFF',
              colorPrimary: '#00D4FF',
            },
          },
        });
        elementsRef.current = elements;

        // 2. Create Express Checkout Element
        const expressCheckout = (elements as any).create('expressCheckout', {
          buttonType: {
            applePay: 'buy',
            googlePay: 'buy',
            paypal: 'buynow',
            klarna: 'pay',
          },
          buttonHeight: 48,
          layout: {
            maxColumns: 2,
            maxRows: 1,
            overflow: 'auto',
          },
        });
        expressCheckoutRef.current = expressCheckout as StripeExpressCheckoutElement;

        // 3. Listen for available payment methods (Apple Pay, Google Pay, Link, Amazon Pay, etc.)
        expressCheckout.on('availablepaymentmethodschange', (event: any) => {
          if (!isMounted) return;
          setIsLoading(false);

          const methods = event?.availablePaymentMethods;
          if (methods) {
            const activeList: string[] = [];
            if (methods.applePay) activeList.push('Apple Pay');
            if (methods.googlePay) activeList.push('Google Pay');
            if (methods.link) activeList.push('Link');
            if (methods.paypal) activeList.push('PayPal');
            if (methods.amazonPay) activeList.push('Amazon Pay');
            if (methods.klarna) activeList.push('Klarna');

            setWalletTypes(activeList);
            setHasWallets(activeList.length > 0);
          } else {
            setHasWallets(false);
          }
        });

        // 4. Handle Click Event
        expressCheckout.on('click', (event: any) => {
          if (!stateRef.current.targetUser) {
            alert('Please select or search a recipient ZEV account before proceeding with 1-click payment.');
            return;
          }
          event.resolve();
        });

        // 5. Handle Confirm Event (Customer authorized one-click wallet)
        expressCheckout.on('confirm', async (event: any) => {
          const current = stateRef.current;
          if (!current.targetUser) {
            alert('Recipient account not selected.');
            return;
          }

          onPaymentStart?.();

          try {
            // A. Create PaymentIntent on server
            const res = await fetch('/api/v1/checkout/create-intent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target_user_id: current.targetUser.id,
                target_username: current.targetUser.username,
                coins: current.coins,
                usd_amount: current.amount,
              }),
            });

            const data = await res.json();
            if (!data.success || !data.clientSecret) {
              const err = data.error || 'Failed to create payment intent.';
              setErrorMessage(err);
              onPaymentError?.(err);
              return;
            }

            // B. Confirm payment with Stripe.js
            const origin = window.location.origin;
            const returnUrl = `${origin}/?status=success&orderId=${data.orderId}&uid=${current.targetUser.id}&coins=${current.coins}&gateway=express`;

            const { error } = await stripe.confirmPayment({
              elements,
              clientSecret: data.clientSecret,
              confirmParams: {
                return_url: returnUrl,
              },
            });

            if (error) {
              setErrorMessage(error.message || 'Payment confirmation failed.');
              onPaymentError?.(error.message || 'Payment confirmation failed.');
            } else {
              onPaymentSuccess?.(data.orderId);
            }
          } catch (err: any) {
            const msg = err.message || 'Unexpected payment error occurred.';
            setErrorMessage(msg);
            onPaymentError?.(msg);
          }
        });

        // 6. Mount into DOM container
        if (containerRef.current) {
          expressCheckout.mount(containerRef.current);
        }
      } catch (err: any) {
        if (isMounted) {
          setIsLoading(false);
          setErrorMessage(err.message || 'Stripe initialization failed.');
        }
      }
    }

    initExpressCheckout();

    return () => {
      isMounted = false;
      try {
        if (expressCheckoutRef.current) {
          expressCheckoutRef.current.unmount();
          expressCheckoutRef.current.destroy();
        }
      } catch (_) {}
    };
  }, []);

  // If environment has no supported wallets (e.g. desktop browser with no Apple/Google Pay configured),
  // hide the express box cleanly so it doesn't leave an empty space.
  if (hasWallets === false) {
    return null;
  }

  return (
    <div className="zev-express-checkout-wrapper">
      <div className="zev-express-card">
        {/* Header */}
        <div className="zev-express-header">
          <div className="zev-express-title-row">
            <div className="zev-express-icon-pill">
              <Zap style={{ width: 16, height: 16, color: '#00D4FF' }} />
            </div>
            <div>
              <div className="zev-express-title">
                <span>Express One-Click Checkout</span>
                <span className="zev-express-tag">0% FEE</span>
              </div>
              <div className="zev-express-desc">
                Instant payment via Apple Pay, Google Pay, Link & One-Click Wallets
              </div>
            </div>
          </div>
          <div className="zev-express-security-badge">
            <ShieldCheck style={{ width: 14, height: 14, color: '#10B981' }} />
            <span>Stripe Verified</span>
          </div>
        </div>

        {/* Warning if no user selected */}
        {!targetUser && (
          <div className="zev-express-account-warning">
            <AlertCircle style={{ width: 15, height: 15, color: '#D97706', flexShrink: 0 }} />
            <span>Select target account above to activate 1-click Apple/Google Pay buttons.</span>
          </div>
        )}

        {/* Error notification if any */}
        {errorMessage && (
          <div className="zev-express-error">
            <AlertCircle style={{ width: 15, height: 15, color: '#EF4444', flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Loading placeholder skeleton */}
        {isLoading && (
          <div className="zev-express-skeleton">
            <div className="zev-express-skeleton-btn shimmer">
              <Sparkles style={{ width: 15, height: 15, opacity: 0.6 }} />
              <span>Detecting 1-Click Wallets (Apple Pay, Google Pay)...</span>
            </div>
          </div>
        )}

        {/* The Stripe Express Checkout Element DOM mount target */}
        <div
          ref={containerRef}
          id="express-checkout-element"
          className="zev-express-mount-target"
          style={{ minHeight: isLoading ? 0 : 50 }}
        />

        {/* Available Wallet Pills */}
        {walletTypes.length > 0 && (
          <div className="zev-express-wallet-pills">
            <span className="zev-express-pill-label">Available on your device:</span>
            {walletTypes.map((w) => (
              <span key={w} className="zev-express-pill">
                ✓ {w}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Modern Clearmorphic "OR" Divider */}
      <div className="zev-express-or-divider">
        <div className="zev-express-or-line" />
        <span className="zev-express-or-text">OR CHOOSE OTHER PAYMENT GATEWAYS</span>
        <div className="zev-express-or-line" />
      </div>
    </div>
  );
}
