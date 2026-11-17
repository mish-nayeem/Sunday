// supabase/functions/send-order-confirmation/index.ts
//
// Called from Checkout.jsx via supabase.functions.invoke('send-order-confirmation', { body: { order_id } }).
// Fetches the order and sends a confirmation email via Brevo's transactional
// email API. The email ends with a DOWNLOAD INVOICE button: a signed link to
// the invoice function, which makes the PDF when tapped (_shared/invoice.ts).
//
// Required secrets (set with `supabase secrets set KEY=value`):
//   BREVO_API_KEY        - your Brevo API v3 key
//   BREVO_SENDER_EMAIL    - a sender verified in Brevo (or BREVO_FROM_EMAIL, as the marketing function names it)
//   BREVO_SENDER_NAME     - display name, defaults to "SUNDAY"
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by the
// Supabase platform for every Edge Function — no need to set them manually.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { isAdminRequest } from "../_shared/admin.ts";
import { invoiceUrl } from "../_shared/invoice.ts";
import { fetchWithTimeout } from '../_shared/http.ts'
import * as Sentry from 'npm:@sentry/deno@^8'

// Errors reach Sentry when the SENTRY_DSN secret is set (audit MEDIUM-5);
// without it every call is a safe no-op. defaultIntegrations: false — the
// Deno SDK doesn't instrument Deno.serve, so scope from one request can't
// bleed into another if the isolate is reused.
Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), defaultIntegrations: false })

// How the order is paid, in words: bKash up front and the rest on delivery,
// all by bKash, or all cash on delivery.
function paymentText(order: any): string {
  const total = Number(order.total) || 0;
  const advance = order.advance_amount != null
    ? Number(order.advance_amount) || 0
    : order.payment_method === "bkash_advance" ? Number(order.delivery_charge) || 0 : 0;
  if (order.payment_method === "bkash_full" || (advance > 0 && advance >= total)) return `Paid in full by bKash (৳${total})`;
  if (advance > 0) return `৳${advance} paid by bKash · ৳${total - advance} on delivery`;
  return "Cash on Delivery";
}

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

function buildEmailHtml(order: any, invoiceLink: string): string {
  const itemsHtml = (order.items || [])
    .map(
      (item: any) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#2b2b2b;">
            ${item.name}${item.size ? ` (${item.size})` : ""}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#2b2b2b;text-align:center;">
            ${item.quantity}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#2b2b2b;text-align:right;">
            &#2547;${(item.price * item.quantity).toLocaleString()}
          </td>
        </tr>`
    )
    .join("");

  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#2b2b2b;">
    <div style="text-align:center;padding:32px 0 16px;">
      <div style="font-size:22px;letter-spacing:3px;font-weight:bold;">SUNDAY</div>
      <div style="font-size:11px;letter-spacing:1px;color:#8a8a8a;margin-top:4px;">PREMIUM MEN'S FASHION — BANGLADESH</div>
    </div>
    <div style="border-top:1px solid #e5c98a;margin:0 0 24px;"></div>

    <p style="font-size:15px;">Hi ${order.full_name},</p>
    <p style="font-size:14px;line-height:1.6;color:#4a4a4a;">
      Thank you for your order! We've received it and it's now being prepared.
    </p>

    <table style="width:100%;margin:20px 0 8px;font-size:13px;color:#8a8a8a;">
      <tr>
        <td>Order ID</td>
        <td style="text-align:right;font-family:monospace;">${order.order_id}</td>
      </tr>
      <tr>
        <td>Invoice No.</td>
        <td style="text-align:right;font-family:monospace;">${order.invoice_number}</td>
      </tr>
      <tr>
        <td>Payment</td>
        <td style="text-align:right;">${paymentText(order)}</td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr>
          <th style="text-align:left;font-size:11px;letter-spacing:1px;color:#8a8a8a;padding-bottom:8px;border-bottom:2px solid #2b2b2b;">ITEM</th>
          <th style="text-align:center;font-size:11px;letter-spacing:1px;color:#8a8a8a;padding-bottom:8px;border-bottom:2px solid #2b2b2b;">QTY</th>
          <th style="text-align:right;font-size:11px;letter-spacing:1px;color:#8a8a8a;padding-bottom:8px;border-bottom:2px solid #2b2b2b;">TOTAL</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table style="width:100%;font-size:14px;margin-top:8px;">
      <tr>
        <td style="padding:4px 0;">Subtotal</td>
        <td style="padding:4px 0;text-align:right;font-family:monospace;">&#2547;${(order.subtotal || 0).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;">Delivery</td>
        <td style="padding:4px 0;text-align:right;font-family:monospace;">&#2547;${(order.delivery_charge || 0).toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:10px 0 4px;font-weight:bold;border-top:1px solid #2b2b2b;">Total</td>
        <td style="padding:10px 0 4px;text-align:right;font-family:monospace;font-weight:bold;border-top:1px solid #2b2b2b;">&#2547;${(order.total || 0).toLocaleString()}</td>
      </tr>
    </table>

    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${invoiceLink}" target="_blank" style="display:inline-block;padding:12px 26px;background:#2b2b2b;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:2px;font-family:Arial,Helvetica,sans-serif;">DOWNLOAD INVOICE</a>
    </div>

    <div style="margin:28px 0;padding:16px;background:#faf6ee;font-size:13px;color:#4a4a4a;">
      <strong>Delivery Address</strong><br/>
      ${order.address}, ${order.area}, ${order.district}<br/>
      Mobile: ${order.mobile}
    </div>

    <p style="font-size:13px;color:#8a8a8a;line-height:1.6;">
      Questions about your order? Just reply to this email or reach us on WhatsApp.
    </p>

    <div style="text-align:center;padding:24px 0 8px;font-size:11px;color:#b0b0b0;letter-spacing:1px;">
      SUNDAY &middot; Dhaka, Bangladesh
    </div>
  </div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return jsonResponse({ error: "order_id is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("order_id", order_id)
      .single();

    if (orderError || !order) {
      return jsonResponse({ error: `Order not found: ${orderError?.message ?? order_id}` }, 404);
    }

    if (!order.email) {
      return jsonResponse({ skipped: true, reason: "no email on order" });
    }

    // Anyone can call this without logging in (checkout does, right after
    // the order), so it mails a new order once, in its first half hour —
    // never the same customer's invoice again and again on request. The
    // admin (bKash check, manual orders) can send it whenever.
    const admin = await isAdminRequest(req, supabase);
    let claimed = false;
    // Paid by bKash (outside Dhaka's advance, or the whole order): nothing
    // goes out at checkout. The admin checks the TrxID in Orders → bKash
    // check, and that sends this email.
    const paidByBkash = order.payment_method === "bkash_advance" || order.payment_method === "bkash_full" ||
      Number(order.advance_amount) > 0;
    if (!admin && paidByBkash && !order.advance_verified_at) {
      return jsonResponse({ skipped: true, reason: "waiting for the bKash check" });
    }
    if (!admin) {
      const fresh = Date.now() - new Date(order.created_at).getTime() < 30 * 60 * 1000;
      if (!fresh) return jsonResponse({ skipped: true, reason: "not a new order" });
      const { data: claim } = await supabase
        .from("orders")
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq("order_id", order.order_id)
        .is("confirmation_sent_at", null)
        .select("order_id");
      if (!claim?.length) return jsonResponse({ skipped: true, reason: "already sent" });
      claimed = true;
    }
    // Not sent after all: free the claim, so it can be tried again.
    const release = async () => {
      if (claimed) await supabase.from("orders").update({ confirmation_sent_at: null }).eq("order_id", order.order_id);
    };

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      await release();
      return jsonResponse({ error: "BREVO_API_KEY secret is not configured" }, 500);
    }
    const SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") || Deno.env.get("BREVO_FROM_EMAIL");
    if (!SENDER_EMAIL) {
      await release();
      return jsonResponse({ error: "BREVO_SENDER_EMAIL (or BREVO_FROM_EMAIL) secret is not configured" }, 500);
    }
    const SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || Deno.env.get("BREVO_FROM_NAME") || "SUNDAY";

    const link = await invoiceUrl(order.order_id);

    const brevoRes = await fetchWithTimeout("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: order.email, name: order.full_name }],
        subject: `Order Confirmed — ${order.order_id} | SUNDAY`,
        htmlContent: buildEmailHtml(order, link),
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      await release();
      return jsonResponse({ error: `Brevo send failed (${brevoRes.status}): ${errText}` }, 502);
    }

    const brevoData = await brevoRes.json();
    return jsonResponse({ success: true, messageId: brevoData.messageId ?? null });
  } catch (err) {
    Sentry.captureException(err)
    await Sentry.flush(2000)
    console.error("send-order-confirmation error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
