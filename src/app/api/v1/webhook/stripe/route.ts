import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { creditUserCoins } from '@/lib/server/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get('stripe-signature');
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // 1. Cryptographic Signature Verification
    if (webhookSecret && sigHeader) {
      try {
        const parts = sigHeader.split(',').reduce((acc: any, part) => {
          const [key, val] = part.split('=');
          acc[key.trim()] = val?.trim();
          return acc;
        }, {});

        const timestamp = parts['t'];
        const signature = parts['v1'];
        const expectedSig = crypto
          .createHmac('sha256', webhookSecret)
          .update(`${timestamp}.${rawBody}`, 'utf8')
          .digest('hex');

        if (signature !== expectedSig) {
          console.error('[Stripe Webhook] Invalid signature match.');
          return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
        }
      } catch (err) {
        console.error('[Stripe Webhook] Verification error:', err);
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 400 });
      }
    }

    const event = JSON.parse(rawBody);

    // 2. Handle Stripe Checkout Session completed
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      // STRICT CHECK: Payment must be fully paid!
      if (session.payment_status !== 'paid') {
        console.warn(`[Stripe Webhook] Checkout completed but payment status is '${session.payment_status}'. No coins credited.`);
        return NextResponse.json({ received: true, credited: false });
      }

      const targetUserId = session.metadata?.target_user_id || session.client_reference_id;
      const coinsToAdd = parseInt(session.metadata?.coins || '0', 10);
      const orderId = session.metadata?.order_id || session.id;

      if (targetUserId && coinsToAdd > 0) {
        const usdAmount = session.amount_total ? session.amount_total / 100 : undefined;
        const buyerUserId = session.metadata?.buyer_user_id || null;
        const result = await creditUserCoins(targetUserId, coinsToAdd, 'Stripe Checkout', orderId, {
          usdAmount,
          buyerUserId,
          metadata: session.metadata,
        });
        if (result.success) {
          return NextResponse.json({ received: true, credited: true, newBalance: result.newBalance });
        }
        return NextResponse.json({ received: true, credited: false, error: result.error });
      }
    }

    // 3. Handle Stripe PaymentIntent succeeded (used by Express Checkout: Apple Pay, Google Pay, Link, Amazon Pay)
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;

      if (pi.status !== 'succeeded') {
        console.warn(`[Stripe Webhook] PaymentIntent received but status is '${pi.status}'. No coins credited.`);
        return NextResponse.json({ received: true, credited: false });
      }

      const targetUserId = pi.metadata?.target_user_id;
      const coinsToAdd = parseInt(pi.metadata?.coins || '0', 10);
      const orderId = pi.metadata?.order_id || pi.id;

      if (targetUserId && coinsToAdd > 0) {
        const usdAmount = pi.amount ? pi.amount / 100 : undefined;
        const buyerUserId = pi.metadata?.buyer_user_id || null;
        const gatewayLabel = pi.metadata?.gateway || 'Stripe One-Click (Apple/Google Pay)';
        const result = await creditUserCoins(targetUserId, coinsToAdd, gatewayLabel, orderId, {
          usdAmount,
          buyerUserId,
          metadata: pi.metadata,
        });
        if (result.success) {
          return NextResponse.json({ received: true, credited: true, newBalance: result.newBalance });
        }
        return NextResponse.json({ received: true, credited: false, error: result.error });
      }
    }

    // Explicitly reject/ignore failed payments without crediting
    if (event.type === 'payment_intent.payment_failed') {
      console.warn('[Stripe Webhook] Payment failed for session. No coins credited.');
      return NextResponse.json({ received: true, credited: false });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Stripe Webhook Handler Error]', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
