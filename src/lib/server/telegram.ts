import { getSupabaseAdmin } from './supabaseAdmin';

const DEFAULT_COIN_BOT_TOKEN = '9014717072:AAHz57zf5Kv5mbqVeENNTWtR-ZNhGw9TgM0';
const DEFAULT_PAYOUT_BOT_TOKEN = '9230056079:AAF-BC37YODbYF-EyK_f2ImYm2dEWw32x6w';

/**
 * Send a Telegram notification to all registered admin chat IDs and bot tokens.
 */
export async function sendTelegramNotification({
  botType,
  message,
}: {
  botType: 'coin_bot' | 'payout_bot';
  message: string;
}): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sentCount = 0;

  try {
    const supabase = getSupabaseAdmin();

    // 1. Fetch active bot tokens
    let tokens: string[] = [];
    try {
      const { data: configs } = await supabase
        .from('telegram_bot_configs')
        .select('bot_token')
        .eq('bot_type', botType)
        .eq('is_active', true);

      if (configs && configs.length > 0) {
        tokens = configs.map((c) => c.bot_token.trim()).filter(Boolean);
      }
    } catch (e) {
      console.warn('[Telegram] Could not fetch tokens from DB:', e);
    }

    if (tokens.length === 0) {
      tokens = [botType === 'coin_bot' ? DEFAULT_COIN_BOT_TOKEN : DEFAULT_PAYOUT_BOT_TOKEN];
    }

    // 2. Fetch active subscriber chat IDs
    let chatIds: string[] = [];
    try {
      const { data: subs } = await supabase
        .from('telegram_bot_subscribers')
        .select('chat_id')
        .eq('bot_type', botType)
        .eq('is_active', true);

      if (subs && subs.length > 0) {
        chatIds = subs.map((s) => s.chat_id.trim()).filter(Boolean);
      }
    } catch (e) {
      console.warn('[Telegram] Could not fetch subscribers from DB:', e);
    }

    // Check environment variables as well
    const envChatIds = (
      botType === 'coin_bot'
        ? process.env.TELEGRAM_COIN_CHAT_IDS || process.env.TELEGRAM_CHAT_IDS
        : process.env.TELEGRAM_PAYOUT_CHAT_IDS || process.env.TELEGRAM_CHAT_IDS
    )
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (envChatIds) {
      chatIds = Array.from(new Set([...chatIds, ...envChatIds]));
    }

    // 3. Check for any recent /start updates from Telegram if subscribers table is currently empty
    if (chatIds.length === 0) {
      for (const token of tokens) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-10`, {
            cache: 'no-store',
          });
          const updateData = await res.json();
          if (updateData.ok && Array.isArray(updateData.result)) {
            for (const upd of updateData.result) {
              const msg = upd.message || upd.channel_post;
              const cid = msg?.chat?.id?.toString();
              if (cid && !chatIds.includes(cid)) {
                chatIds.push(cid);
                // Save to database for permanence
                await supabase.from('telegram_bot_subscribers').upsert(
                  {
                    bot_type: botType,
                    chat_id: cid,
                    username: msg?.chat?.username || msg?.from?.username || null,
                    first_name: msg?.chat?.first_name || msg?.from?.first_name || 'Admin',
                    is_active: true,
                  },
                  { onConflict: 'bot_type,chat_id' }
                );
              }
            }
          }
        } catch (fetchErr) {
          console.warn('[Telegram] getUpdates check error:', fetchErr);
        }
      }
    }

    if (chatIds.length === 0) {
      console.log(`[Telegram] No chat IDs configured yet for ${botType}. Message queued.`);
      return { sent: 0, errors: ['No chat IDs registered yet. Please send /start to the Telegram bot.'] };
    }

    // 4. Broadcast to each token and chat ID
    for (const token of tokens) {
      for (const chatId of chatIds) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'HTML',
              disable_web_page_preview: true,
            }),
          });
          const resJson = await res.json();
          if (resJson.ok) {
            sentCount++;
          } else {
            errors.push(`Chat ${chatId}: ${resJson.description || 'Failed'}`);
          }
        } catch (err: any) {
          errors.push(`Chat ${chatId}: ${err.message || 'Network error'}`);
        }
      }
    }
  } catch (outerErr: any) {
    errors.push(outerErr.message || 'General error');
  }

  return { sent: sentCount, errors };
}

/**
 * Format and send Coin Purchase Telegram Notification
 */
export async function notifyCoinPurchaseTelegram({
  targetUsername,
  targetUserId,
  coins,
  usdAmount,
  gateway,
  orderId,
  buyerUsername,
}: {
  targetUsername?: string;
  targetUserId: string;
  coins: number;
  usdAmount: number;
  gateway: string;
  orderId: string;
  buyerUsername?: string;
}) {
  const timeStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const userTag = targetUsername ? `@${targetUsername}` : `User (${targetUserId.substring(0, 8)})`;
  const buyerTag = buyerUsername ? `@${buyerUsername}` : 'Direct Web Checkout';

  const text = `🪙 <b>NEW ZEV COIN PURCHASE</b> 🪙
━━━━━━━━━━━━━━━━━━━━━
👤 <b>Recipient:</b> ${userTag}
🆔 <b>User ID:</b> <code>${targetUserId}</code>
💰 <b>Coins Credited:</b> <b>+${coins.toLocaleString()} Coins</b>
💵 <b>Amount Paid:</b> <b>$${usdAmount.toFixed(2)} USD</b>
💳 <b>Gateway:</b> <b>${gateway.toUpperCase()}</b>
🧾 <b>Order ID:</b> <code>${orderId}</code>
🛒 <b>Payer / Source:</b> ${buyerTag}
⏱ <b>Time:</b> ${timeStr}
━━━━━━━━━━━━━━━━━━━━━
✅ <i>Coins deposited immediately with 0% platform fee.</i>`;

  return sendTelegramNotification({
    botType: 'coin_bot',
    message: text,
  });
}
