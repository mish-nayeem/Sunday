// supabase/functions/notify-telegram-order/index.ts
//
// Fires automatically whenever a new row is inserted into `orders`, via a
// Supabase Database Webhook (Dashboard → Database → Webhooks). Sends a
// message to your Telegram via the Bot API so you get notified instantly,
// even if you never open the admin panel that day.
//
// This does NOT need to be called from the frontend — the database webhook
// calls it directly with the new order row, so it fires even if the
// customer closes their browser right after placing the order.
//
// Required secrets (set with `supabase secrets set KEY=value`):
//   TELEGRAM_BOT_TOKEN   - token from @BotFather
//   TELEGRAM_CHAT_ID     - your personal/group chat id (see setup steps)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
    if (!botToken || !chatId) {
      console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID secret");
      return jsonResponse({ error: "Telegram not configured" }, 500);
    }

    // Database Webhooks send the payload as { type, table, record, old_record }
    const payload = await req.json();
    const order = payload.record ?? payload; // fall back if called manually with just the order

    const itemsList = Array.isArray(order.items)
      ? order.items.map((it: any) => `  • ${it.name} (${it.size ?? "-"}) × ${it.quantity} — ৳${it.price}`).join("\n")
      : "-";

    const paymentLine = order.payment_method === "bkash_advance"
      ? `bKash Advance (TrxID: ${order.bkash_transaction_id ?? "-"})`
      : "Cash on Delivery";

    const text =
      `🛍️ *New Order — ${order.order_id}*\n\n` +
      `👤 ${order.full_name}\n` +
      `📞 ${order.mobile}\n` +
      `📍 ${order.area ?? ""}, ${order.district ?? ""}\n\n` +
      `${itemsList}\n\n` +
      `Subtotal: ৳${order.subtotal}\n` +
      `Delivery: ৳${order.delivery_charge}\n` +
      `*Total: ৳${order.total}*\n\n` +
      `💳 ${paymentLine}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!tgRes.ok) {
      const errBody = await tgRes.text();
      console.error("Telegram API error:", errBody);
      return jsonResponse({ error: "Telegram send failed", detail: errBody }, 502);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("notify-telegram-order failed:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
