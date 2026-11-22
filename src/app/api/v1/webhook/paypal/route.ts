import { NextRequest, NextResponse } from 'next/server';
import { creditUserCoins } from '@/lib/server/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const event = JSON.parse(rawBody);
    const eventType = event.event_type;

    // 1. Auto-Capture when Order is Approved
    if (eventType === 'CHECKOUT.ORDER.APPROVED') {
      const order = event.resource;
      const orderId = order.id;

      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      const isLive = process.env.PAYPAL_MODE === 'live';
      const baseUrl = isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

      if (clientId && clientSecret && orderId) {
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

        if (accessToken) {
          const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          const captureData = await captureRes.json();
          console.log('[PayPal Auto-Capture]', captureData.status);

          if (captureData.status === 'COMPLETED') {
            const rawCustom = order.purchase_units?.[0]?.custom_id;
            let targetUserId = '';
            let coinsToAdd = 0;
            if (rawCustom) {
              try {
                const parsed = JSON.parse(rawCustom);
                targetUserId = parsed.target_user_id;
                coinsToAdd = Number(parsed.coins);
              } catch {
                targetUserId = rawCustom;
              }
            }
            if (targetUserId && coinsToAdd > 0) {
              const usdAmount = Number(order.purchase_units?.[0]?.amount?.value) || undefined;
              await creditUserCoins(targetUserId, coinsToAdd, 'PayPal', orderId, {
                usdAmount,
                metadata: captureData,
              });
              return NextResponse.json({ received: true, captured: true, credited: true });
            }
          }
        }
      }
    }

    // 2. STRICT CHECK: Only credit when payment capture is completed
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const resource = event.resource;

      if (resource.status !== 'COMPLETED') {
        console.warn(`[PayPal Webhook] Capture status is '${resource.status}'. No coins credited.`);
        return NextResponse.json({ received: true, credited: false });
      }

      let targetUserId = '';
      let coinsToAdd = 0;
      let orderId = resource.id || `PAYPAL-${Date.now()}`;

      const rawCustom = resource.custom_id || resource.purchase_units?.[0]?.custom_id;
      if (rawCustom) {
        try {
          const parsed = JSON.parse(rawCustom);
          targetUserId = parsed.target_user_id;
          coinsToAdd = Number(parsed.coins);
          if (parsed.order_id) orderId = parsed.order_id;
        } catch {
          targetUserId = rawCustom;
        }
      }

      if (targetUserId && coinsToAdd > 0) {
        const usdAmount = resource.amount?.value ? Number(resource.amount.value) : undefined;
        const result = await creditUserCoins(targetUserId, coinsToAdd, 'PayPal', orderId, {
          usdAmount,
          metadata: resource,
        });
        return NextResponse.json({ received: true, credited: result.success, newBalance: result.newBalance });
      }
    }

    if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      console.warn(`[PayPal Webhook] Payment ${eventType}. Zero coins credited.`);
      return NextResponse.json({ received: true, credited: false });
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[PayPal Webhook Error]', err);
    return NextResponse.json({ error: err.message || 'Webhook error' }, { status: 500 });
  }
}
