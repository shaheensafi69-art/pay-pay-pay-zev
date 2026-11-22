# pay-pay-pay-zev
# ZEV Pay | Official Virtual Coins Recharge Portal

Official standalone web recharge portal for **ZEV Virtual Coins** with **0% app store fees**, instant delivery, and multi-gateway checkout.

## Features
- **Progressive Web App (PWA):** Installable on iOS (Safari) and Android (Chrome) with offline support and standalone app display.
- **Multiple Payment Gateways:**
  - **Stripe:** Instant Credit/Debit Card checkout (Visa, Mastercard, Amex).
  - **NOWPayments:** Crypto top-ups (BTC, USDT TRC20/ERC20, ETH, TON, SOL & 150+ coins).
  - **PayPal:** International wallet & bank checkout.
- **Real-Time Supabase Integration:**
  - Dynamic coin tier packages fetched from database.
  - Live user search with verified badges.
  - Automatic coin balance crediting upon verified webhook delivery.
  - Automatic order transaction logging (`coin_purchases` table).
- **Claymorphic Luxury Design:**
  - Clean, clutter-free mobile-first UI with top segmented navigation tabs.
  - High-z-index floating search suggestions.
  - Single floating Apple-Pay style bottom checkout pill.

## Live Production
- **Domain:** [https://pay.zevapp.com](https://pay.zevapp.com)
- **Vercel Alias:** [https://zev-pay.vercel.app](https://zev-pay.vercel.app)

## Tech Stack
- **Framework:** Next.js 15 (App Router, React 19)
- **Styling:** Claymorphism CSS3, Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Icons:** Lucide React
