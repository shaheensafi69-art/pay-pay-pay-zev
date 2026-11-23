import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-01-27.acacia' as any,
});

export async function POST(req: NextRequest) {
  try {
    if (!stripeSecretKey) {
      return NextResponse.json(
        { success: false, error: 'Stripe secret key is not configured on server.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const target_user_id = (body.target_user_id || body.userId || '').toString().trim();
    const target_username = (body.target_username || body.username || '').toString().trim();
    const coins = parseInt(body.coins || '0', 10);
    const usd_amount = parseFloat(body.usd_amount || body.amount || '0');

    if (!target_user_id) {
      return NextResponse.json(
        { success: false, error: 'Please select a recipient ZEV account first.' },
        { status: 400 }
      );
    }

    if (!coins || coins <= 0 || !usd_amount || usd_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid coin amount or price specified.' },
        { status: 400 }
      );
    }

    const orderId = `ZEV-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const amountInCents = Math.round(usd_amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      description: `ZEV Coins: ${coins.toLocaleString()} Coins for @${target_username || target_user_id}`,
      metadata: {
        target_user_id,
        target_username,
        coins: coins.toString(),
        order_id: orderId,
        gateway: 'Stripe Express (Apple/Google/Link)',
      },
    });

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      orderId,
      amount: usd_amount,
      coins,
    });
  } catch (err: any) {
    console.error('[Create PaymentIntent Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Payment intent creation failed.' },
      { status: 500 }
    );
  }
}
