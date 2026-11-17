// Edge Function: invoice
//
// The DOWNLOAD INVOICE button in the order confirmation email
// (send-order-confirmation). A plain GET from the customer's browser — no
// login, so "Verify JWT" is off (supabase/config.toml) — that answers with
// the order's invoice as a PDF to save.
//
//   GET /functions/v1/invoice?o=<order id>&t=<token>
//
// The token is the order id signed on the server (_shared/invoice.ts), so
// only the link in that order's own email works; a guessed order number gets
// nothing. Nothing is written anywhere. As on PAUSE.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import * as Sentry from "npm:@sentry/deno@^8";
import { orderInvoicePdf, invoiceTokenOk } from "../_shared/invoice.ts";

Sentry.init({ dsn: Deno.env.get("SENTRY_DSN"), defaultIntegrations: false });

const page = (status: number, text: string) =>
  new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });

Deno.serve(async (req) => {
  if (req.method !== "GET") return page(405, "Not allowed");
  try {
    const url = new URL(req.url);
    const id = String(url.searchParams.get("o") || "").trim().slice(0, 40);
    const token = String(url.searchParams.get("t") || "").trim();
    if (!(await invoiceTokenOk(id, token))) return page(404, "This invoice link is not valid.");

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: order } = await db.from("orders").select("*").eq("order_id", id).maybeSingle();
    if (!order) return page(404, "This order could not be found.");

    const bytes = orderInvoicePdf(order);
    const name = `SUNDAY-invoice-${String(order.invoice_number || order.order_id).replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("[invoice]", (err as Error).message);
    Sentry.captureException(err);
    await Sentry.flush(2000);
    return page(500, "Couldn't make the invoice right now — try again in a minute.");
  }
});
