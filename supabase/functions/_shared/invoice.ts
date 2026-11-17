// The order's invoice: the PDF (same layout as src/lib/invoicePdf.js) and
// the DOWNLOAD INVOICE link in the confirmation email. The link carries the
// order id signed with a key that never leaves the server (INVOICE_SECRET,
// or the service role key), so a guessed order number opens nothing. As on
// PAUSE.

import { jsPDF } from "https://esm.sh/jspdf@4.2.1?target=deno&bundle";

// The PDF's bytes.
function buildInvoicePdf(invoice: {
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
}): Uint8Array {
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

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}

// An orders row (with its items) as an invoice PDF.
export function orderInvoicePdf(order: any): Uint8Array {
  return buildInvoicePdf({
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
}

async function sign(id: string): Promise<string> {
  const secret = Deno.env.get("INVOICE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("no key to sign invoice links");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`invoice:${id}`)));
  return [...sig.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The link in the email: the invoice function, with this order's token.
export async function invoiceUrl(id: string): Promise<string> {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/invoice?o=${encodeURIComponent(id)}&t=${await sign(id)}`;
}

export async function invoiceTokenOk(id: string, token: string): Promise<boolean> {
  if (!id || !/^[0-9a-f]{32}$/.test(token)) return false;
  const want = await sign(id);
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
