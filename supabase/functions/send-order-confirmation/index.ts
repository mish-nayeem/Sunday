// supabase/functions/send-order-confirmation/index.ts
//
// Called from Checkout.jsx via supabase.functions.invoke('send-order-confirmation', { body: { order_id } }).
// Fetches the order, builds a PDF invoice (same layout as src/lib/invoicePdf.js),
// and sends a confirmation email with the PDF attached via Brevo's transactional email API.
//
// Required secrets (set with `supabase secrets set KEY=value`):
//   BREVO_API_KEY        - your Brevo API v3 key
//   BREVO_SENDER_EMAIL    - a sender verified in Brevo (e.g. orders@yourdomain.com)
//   BREVO_SENDER_NAME     - display name, defaults to "SUNDAY"
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by the
// Supabase platform for every Edge Function — no need to set them manually.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { jsPDF } from "https://esm.sh/jspdf@4.2.1?target=deno&bundle";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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

// Mirrors src/lib/invoicePdf.js but returns base64 bytes instead of triggering a browser download.
function buildInvoicePdfBase64(invoice: {
  invoice_number: string;
  order_id: string;
  issue_date: string;
  customer_name: string;
  customer_mobile?: string;
  customer_address?: string;
  items: Array<{ name: string; size?: string; quantity: number; price: number }>;
  subtotal: number;
  delivery_charge: number;
  total: number;
}): string {
  const doc = new jsPDF();
  const marginX = 15;
  let y = 20;

  doc.setFontSize(20);
  doc.text("SUNDAY", marginX, y);
  doc.setFontSize(10);
  doc.text("Premium Men's Fashion — Bangladesh", marginX, y + 6);

  y += 20;
  doc.setFontSize(14);
  doc.text(`Invoice ${invoice.invoice_number}`, marginX, y);

  y += 10;
  doc.setFontSize(10);
  doc.text(`Order ID: ${invoice.order_id}`, marginX, y);
  y += 6;
  doc.text(`Date: ${invoice.issue_date}`, marginX, y);
  y += 6;
  doc.text(`Customer: ${invoice.customer_name}`, marginX, y);
  y += 6;
  if (invoice.customer_mobile) {
    doc.text(`Mobile: ${invoice.customer_mobile}`, marginX, y);
    y += 6;
  }
  if (invoice.customer_address) {
    doc.text(`Address: ${invoice.customer_address}`, marginX, y);
    y += 6;
  }

  y += 8;
  doc.setFontSize(11);
  doc.text("Item", marginX, y);
  doc.text("Qty", 130, y);
  doc.text("Price", 155, y);
  doc.text("Total", 180, y);
  y += 4;
  doc.line(marginX, y, 195, y);
  y += 6;

  doc.setFontSize(10);
  (invoice.items || []).forEach((item) => {
    doc.text(`${item.name}${item.size ? " (" + item.size + ")" : ""}`, marginX, y);
    doc.text(String(item.quantity), 130, y);
    doc.text(`Tk ${item.price}`, 155, y);
    doc.text(`Tk ${(item.price * item.quantity).toLocaleString()}`, 180, y);
    y += 7;
  });

  y += 4;
  doc.line(marginX, y, 195, y);
  y += 8;

  doc.text(`Subtotal: Tk ${(invoice.subtotal || 0).toLocaleString()}`, 140, y);
  y += 6;
  doc.text(`Delivery: Tk ${(invoice.delivery_charge || 0).toLocaleString()}`, 140, y);
  y += 6;
  doc.setFontSize(12);
  doc.text(`Total: Tk ${(invoice.total || 0).toLocaleString()}`, 140, y);

  const arrayBuffer = doc.output("arraybuffer") as ArrayBuffer;
  return encodeBase64(new Uint8Array(arrayBuffer));
}

function buildEmailHtml(order: any): string {
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
      Your invoice is attached to this email as a PDF for your records.
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
        <td style="text-align:right;">${order.payment_method === "bkash_advance" ? "bKash (Advance Paid)" : "Cash on Delivery"}</td>
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

    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      return jsonResponse({ error: "BREVO_API_KEY secret is not configured" }, 500);
    }
    const SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL");
    if (!SENDER_EMAIL) {
      return jsonResponse({ error: "BREVO_SENDER_EMAIL secret is not configured" }, 500);
    }
    const SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") || "SUNDAY";

    const pdfBase64 = buildInvoicePdfBase64({
      invoice_number: order.invoice_number,
      order_id: order.order_id,
      issue_date: new Date(order.created_at).toISOString().split("T")[0],
      customer_name: order.full_name,
      customer_mobile: order.mobile,
      customer_address: `${order.address}, ${order.area}, ${order.district}`,
      items: order.items,
      subtotal: order.subtotal,
      delivery_charge: order.delivery_charge,
      total: order.total,
    });

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
        subject: `Order Confirmed — ${order.order_id} | SUNDAY`,
        htmlContent: buildEmailHtml(order),
        attachment: [
          {
            content: pdfBase64,
            name: `${order.invoice_number}.pdf`,
          },
        ],
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      return jsonResponse({ error: `Brevo send failed (${brevoRes.status}): ${errText}` }, 502);
    }

    const brevoData = await brevoRes.json();
    return jsonResponse({ success: true, messageId: brevoData.messageId ?? null });
  } catch (err) {
    console.error("send-order-confirmation error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
