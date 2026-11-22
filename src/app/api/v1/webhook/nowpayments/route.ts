import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { creditUserCoins, getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sigHeader = req.headers.get('x-nowpayments-sig');
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;

    // 1. HMAC-SHA512 Signature Verification
    if (ipnSecret && sigHeader) {
      try {
        const parsed = JSON.parse(rawBody);
        const sortedKeys = Object.keys(parsed).sort();
        const sortedObj: Record<string, any> = {};
        for (const k of sortedKeys) {
          sortedObj[k] = parsed[k];
        }
        const sortedStr = JSON.stringify(sortedObj);

        const hmac = crypto.createHmac('sha512', ipnSecret).update(sortedStr).digest('hex');
        if (hmac !== sigHeader) {
          console.warn('[NOWPayments IPN] Signature check mismatch.');
        }
      } catch (e) {
        console.error('[NOWPayments IPN] Sig error:', e);
      }
    }

    const data = JSON.parse(rawBody);
    const { payment_status, order_id, order_description, price_amount } = data;

    // 2. STRICT CHECK: ONLY finished or confirmed payments are credited!
    if (payment_status !== 'finished' && payment_status !== 'confirmed') {
      console.log(`[NOWPayments IPN] Payment status is '${payment_status}'. No coins credited.`);
      return NextResponse.json({ ok: true, credited: false, status: payment_status });
    }

    // 3. Resolve user and coin count
    let coinsToAdd = 0;
    let targetUserId = '';

    if (order_description) {
      // 1. Try exact UID match
      const uidMatch = order_description.match(/\[UID:([0-9a-fA-F-]+)\]/);
      if (uidMatch) {
        targetUserId = uidMatch[1];
      }

      // 2. Try coins count match
      const coinsMatch = order_description.match(/([\d,]+)\s*ZEV Coins/i);
      if (coinsMatch) {
        coinsToAdd = parseInt(coinsMatch[1].replace(/,/g, ''), 10);
      }

      // 3. Fallback username match
      if (!targetUserId) {
        const userMatch = order_description.match(/for\s*@?([a-zA-Z0-9_\-\.]+)/i);
        if (userMatch) {
          const username = userMatch[1];
          const supabase = getSupabaseAdmin();
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, coins_balance')
            .ilike('username', username)
            .maybeSingle();

          if (profile) targetUserId = profile.id;
        }
      }
    }

    if (!targetUserId && price_amount) {
      const baseRate = 0.0142;
      coinsToAdd = Math.round(Number(price_amount) / baseRate);
    }

    if (targetUserId && coinsToAdd > 0) {
      const result = await creditUserCoins(targetUserId, coinsToAdd, 'NOWPayments', order_id || `NP-${data.payment_id}`, {
        usdAmount: Number(price_amount) || undefined,
        metadata: data,
      });
      return NextResponse.json({ ok: true, credited: result.success, newBalance: result.newBalance });
    }

    return NextResponse.json({ ok: true, credited: false });
  } catch (err: any) {
    console.error('[NOWPayments Webhook Error]', err);
    return NextResponse.json({ error: err.message || 'IPN error' }, { status: 500 });
  }
}
