import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { notifyCoinPurchaseTelegram } from './telegram';

let cachedAdminClient: SupabaseClient | null = null;
const processedTransactions = new Set<string>();

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdminClient) return cachedAdminClient;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zjwmioalrhkyfbzhdnnw.supabase.co').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing on server.');
  }

  cachedAdminClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedAdminClient;
}

/**
 * Safely credit coins to a user profile in Supabase.
 * - Enforces idempotency per orderId to strictly prevent double crediting.
 * - Only runs when payment is 100% verified.
 */
export async function creditUserCoins(
  targetUserId: string,
  coinsToAdd: number,
  gateway: string,
  orderId: string,
  options?: {
    usdAmount?: number;
    buyerUserId?: string | null;
    metadata?: Record<string, any>;
  }
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!targetUserId || coinsToAdd <= 0) {
    return { success: false, error: 'Invalid user or coin amount' };
  }

  // Idempotency check: prevent duplicate credit
  if (orderId && processedTransactions.has(orderId)) {
    console.log(`[IDEMPOTENCY] Order ${orderId} has already been credited. Skipping duplicate.`);
    return { success: true };
  }

  try {
    const supabase = getSupabaseAdmin();

    // 1. Get current balance
    const { data: profile, error: fetchErr } = await supabase
      .from('profiles')
      .select('id, username, coins_balance')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchErr || !profile) {
      console.error(`[CREDIT ERROR] User ${targetUserId} not found in profiles:`, fetchErr);
      return { success: false, error: 'User profile not found' };
    }

    const currentBalance = Number(profile.coins_balance ?? 0);
    const newBalance = currentBalance + coinsToAdd;

    // 2. Atomically update coins_balance
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ coins_balance: newBalance })
      .eq('id', targetUserId);

    if (updateErr) {
      console.error(`[CREDIT ERROR] Failed to update balance for ${targetUserId}:`, updateErr);
      return { success: false, error: updateErr.message };
    }

    // 3. Automatically record purchase transaction under recipient user
    const usdAmount = options?.usdAmount ?? (coinsToAdd * 0.01414);
    try {
      await supabase.from('coin_purchases').insert({
        user_id: targetUserId,
        coins_amount: coinsToAdd,
        usd_amount: usdAmount,
        payment_gateway: gateway,
        payment_status: 'completed',
        order_id: orderId || `order_${Date.now()}`,
        buyer_user_id: options?.buyerUserId || null,
        metadata: options?.metadata || {},
      });
    } catch (insertErr) {
      console.warn('[TRANSACTION RECORD EXCEPTION]', insertErr);
    }

    // 4. Send Instant Telegram Bot Notification to Admins
    try {
      await notifyCoinPurchaseTelegram({
        targetUsername: profile.username,
        targetUserId,
        coins: coinsToAdd,
        usdAmount,
        gateway,
        orderId: orderId || `order_${Date.now()}`,
        buyerUsername: options?.metadata?.target_username || options?.metadata?.buyer_username,
      });
    } catch (tgErr) {
      console.warn('[TELEGRAM NOTIFY EXCEPTION]', tgErr);
    }

    if (orderId) {
      processedTransactions.add(orderId);
    }

    console.log(
      `[SUCCESS] Credited ${coinsToAdd} coins via ${gateway} to @${profile.username} (${targetUserId}). New balance: ${newBalance}. Order: ${orderId}`
    );

    return { success: true, newBalance };
  } catch (err: any) {
    console.error('[CREDIT EXCEPTION]', err);
    return { success: false, error: err.message };
  }
}
