// supabase/functions/send-status-update/index.ts
//
// Called from AdminOrders.jsx via supabase.functions.invoke('send-status-update', { body: { order_id, status } }).
// Sends a short status-update email to the customer via Brevo when their order status changes.
// Reuses the same Brevo secrets as send-order-confirmation:
//   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, BREVO_REPLY_TO_EMAIL (optional)

import { createClient } from "npm:@supabase/supabase-js@2";

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

const statusMessages: Record<string, { subject: string; heading: string; body: string }> = {
  confirmed: {
    subject: "Order Confirmed",
    heading: "Your order is confirmed",
    body: "Great news — we've confirmed your order and it's now being prepared for shipment.",
  },
  processing: {
    subject: "Order Being Prepared",
    heading: "Your order is being prepared",
    body: "Your order is currently being packed. We'll let you know as soon as it ships.",
  },
  shipped: {
    subject: "Order Shipped",
    heading: "Your order is on its way",
    body: "Your order has been handed over to our courier and is on its way to you.",
  },
  delivered: {
    subject: "Order Delivered",
    heading: "Your order has been delivered",
    body: "Your order has been delivered. Thank you for shopping with SUNDAY — we hope you love it!",
  },
  cancelled: {
    subject: "Order Cancelled",
    heading: "Your order has been cancelled",
    body: "Your order has been cancelled. If this wasn't expected, please reach out to us and we'll help sort it out.",
  },
};

function buildEmailHtml(order: any, message: { heading: string; body: string }, trackingNote?: string): string {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#2b2b2b;">
    <div style="text-align:center;padding:32px 0 16px;">
      <div style="font-size:22px;letter-spacing:3px;font-weight:bold;">SUNDAY</div>
      <div style="font-size:11px;letter-spacing:1px;color:#8a8a8a;margin-top:4px;">PREMIUM MEN'S FASHION — BANGLADESH</div>
    </div>
    <div style="border-top:1px solid #e5c98a;margin:0 0 24px;"></div>

    <p style="font-size:15px;">Hi ${order.full_name},</p>
    <p style="font-size:17px;font-weight:bold;margin:16px 0 8px;">${message.heading}</p>
    <p style="font-size:14px;line-height:1.6;color:#4a4a4a;">${message.body}</p>

    <table style="width:100%;margin:20px 0 8px;font-size:13px;color:#8a8a8a;">
      <tr>
        <td>Order ID</td>
        <td style="text-align:right;font-family:monospace;">${order.order_id}</td>
      </tr>
    </table>

    ${trackingNote ? `
    <div style="margin:20px 0;padding:16px;background:#faf6ee;font-size:13px;color:#4a4a4a;">
      <strong>Tracking Info</strong><br/>
      ${trackingNote}
    </div>` : ""}

    <p style="font-size:13px;color:#8a8a8a;line-height:1.6;margin-top:24px;">
      Track your order anytime at our Order Tracking page using Order ID <strong>${order.order_id}</strong> or your mobile number.
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
    const { order_id, status } = await req.json();
    if (!order_id || !status) {
      return jsonResponse({ error: "order_id and status are required" }, 400);
    }

    const message = statusMessages[status];
    if (!message) {
      return jsonResponse({ skipped: true, reason: `no notification template for status "${status}"` });
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

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      return jsonResponse({ error: "BREVO_API_KEY secret is not configured" }, 500);
    }
    const SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL");
    if (!SENDER_EMAIL) {
      return jsonResponse({ error: "BREVO_SENDER_EMAIL secret is not configured" }, 500);
    }
    const SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || "SUNDAY";
    // Reply-To: where customer replies actually land. Falls back to the sender
    // email if not set, but on Brevo's free tier the sender is often a technical
    // @xxxxxbrevosend.com address, so BREVO_REPLY_TO_EMAIL (e.g. sundayclothin@gmail.com)
    // makes sure replies reach the real inbox. Same secret already used by send-order-confirmation.
    const REPLY_TO_EMAIL = Deno.env.get("BREVO_REPLY_TO_EMAIL") || SENDER_EMAIL;

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: order.email, name: order.full_name }],
        replyTo: { name: SENDER_NAME, email: REPLY_TO_EMAIL },
        subject: `${message.subject} — ${order.order_id} | SUNDAY`,
        htmlContent: buildEmailHtml(order, message, order.tracking_note),
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      return jsonResponse({ error: `Brevo send failed (${brevoRes.status}): ${errText}` }, 502);
    }

    const brevoData = await brevoRes.json();
    return jsonResponse({ success: true, messageId: brevoData.messageId ?? null });
  } catch (err) {
    console.error("send-status-update error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
