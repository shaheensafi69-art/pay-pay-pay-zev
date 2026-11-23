import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Support both snake_case and camelCase for maximum compatibility
    const target_user_id = (body.target_user_id || body.userId || body.targetUserId || '').toString().trim();
    const target_username = (body.target_username || body.username || body.targetUsername || '').toString().trim();
    const coins = parseInt(body.coins || body.coins_amount || body.coinsAmount || '0', 10);
    const usd_amount = parseFloat(body.usd_amount || body.usdAmount || body.amount || '0');
    const gateway = (body.gateway || body.paymentMethod || body.payment_gateway || 'stripe').toString().toLowerCase().trim();

    if (!target_user_id) {
      return NextResponse.json(
        { success: false, error: 'Please search and select a recipient ZEV account first.' },
        { status: 400 }
      );
    }

    if (!coins || coins <= 0) {
      return NextResponse.json(
        { success: false, error: 'Please select a valid coin package or amount.' },
        { status: 400 }
      );
    }

    if (!usd_amount || usd_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment amount specified.' },
        { status: 400 }
      );
    }

    const host = req.headers.get('host') || 'pay.zevapp.com';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const origin = `${proto}://${host}`;

    const orderId = `ZEV-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const returnUrl = `${origin}/?status=success&orderId=${orderId}&uid=${target_user_id}&coins=${coins}`;
    const cancelUrl = `${origin}/?status=cancelled&uid=${target_user_id}`;

    // 1. CARDS & WALLETS (Debit & Credit Card, Apple Pay, Google Pay, Samsung Pay, Amazon Pay)
    const isCardOrWallet = ['stripe', 'card', 'cards', 'apple_pay', 'applepay', 'google_pay', 'googlepay', 'samsung_pay', 'samsungpay', 'amazon_pay', 'amazonpay', 'link'].includes(gateway);
    const isCrypto = ['nowpayments', 'crypto', 'cryptocurrency', 'usdt', 'btc'].includes(gateway);
    const isPayPal = ['paypal'].includes(gateway);

    if (isCardOrWallet) {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        return NextResponse.json({ success: false, error: 'Stripe configuration missing on server.' }, { status: 500 });
      }

      const params = new URLSearchParams();
      params.append('line_items[0][price_data][currency]', 'usd');
      params.append('line_items[0][price_data][product_data][name]', `ZEV Coins: ${coins.toLocaleString()} Coins`);
      params.append('line_items[0][price_data][product_data][description]', `Official recharge for @${target_username || target_user_id}`);
      params.append('line_items[0][price_data][unit_amount]', Math.round(usd_amount * 100).toString());
      params.append('line_items[0][quantity]', '1');
      params.append('mode', 'payment');
      params.append('success_url', returnUrl);
      params.append('cancel_url', cancelUrl);
      params.append('client_reference_id', target_user_id);
      params.append('metadata[target_user_id]', target_user_id);
      params.append('metadata[target_username]', target_username || '');
      params.append('metadata[coins]', coins.toString());
      params.append('metadata[order_id]', orderId);

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const session = await stripeRes.json();
      if (session.url) {
        return NextResponse.json({
          success: true,
          redirect_url: session.url,
          redirectUrl: session.url,
          order_id: orderId,
          orderId: orderId,
        });
      }
      return NextResponse.json({ success: false, error: session.error?.message || 'Stripe initialization failed.' }, { status: 500 });
    }

    // 2. CRYPTO CURRENCY (USDT TRC-20, BTC, ETH, TON, Solana & 100+ coins)
    if (isCrypto) {
      const apiKey = process.env.NOWPAYMENTS_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ success: false, error: 'Crypto payment configuration missing on server.' }, { status: 500 });
      }

      const invoiceRes = await fetch('https://api.nowpayments.io/v1/invoice', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          price_amount: usd_amount,
          price_currency: 'usd',
          order_id: orderId,
          order_description: `${coins.toLocaleString()} ZEV Coins for @${target_username || ''} [UID:${target_user_id}]`,
          ipn_callback_url: `${origin}/api/v1/webhook/nowpayments`,
          success_url: returnUrl,
          cancel_url: cancelUrl,
        }),
      });

      const invoice = await invoiceRes.json();
      if (invoice.invoice_url) {
        return NextResponse.json({
          success: true,
          redirect_url: invoice.invoice_url,
          redirectUrl: invoice.invoice_url,
          order_id: orderId,
          orderId: orderId,
        });
      }
      return NextResponse.json({ success: false, error: invoice.message || 'NOWPayments initialization failed.' }, { status: 500 });
    }

    // 3. PAYPAL (Instant Pay & Pay in 4)
    if (isPayPal) {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      const isLive = process.env.PAYPAL_MODE === 'live';

      if (!clientId || !clientSecret) {
        return NextResponse.json({ success: false, error: 'PayPal credentials missing on server.' }, { status: 500 });
      }

      const baseUrl = isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

      // 1. Get OAuth token
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        return NextResponse.json({ success: false, error: 'PayPal authorization failed.' }, { status: 500 });
      }

      // 2. Create Order
      const customPayload = JSON.stringify({ target_user_id, target_username, coins, order_id: orderId });
      const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: orderId,
              description: `${coins.toLocaleString()} ZEV Coins`,
              custom_id: customPayload,
              amount: {
                currency_code: 'USD',
                value: usd_amount.toFixed(2),
              },
            },
          ],
          application_context: {
            brand_name: 'ZEV Platform',
            return_url: returnUrl,
            cancel_url: cancelUrl,
            user_action: 'PAY_NOW',
          },
        }),
      });

      const orderData = await orderRes.json();
      const approveLink = orderData.links?.find((l: any) => l.rel === 'approve')?.href;

      if (approveLink) {
        return NextResponse.json({
          success: true,
          redirect_url: approveLink,
          redirectUrl: approveLink,
          order_id: orderId,
          orderId: orderId,
        });
      }
      return NextResponse.json({ success: false, error: 'Failed to create PayPal approval link.' }, { status: 500 });
    }

    return NextResponse.json({ success: false, error: 'Unsupported payment gateway.' }, { status: 400 });
  } catch (err: any) {
    console.error('Checkout error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
