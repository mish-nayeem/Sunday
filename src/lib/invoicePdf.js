import { jsPDF } from 'jspdf';

export function generateInvoicePDF(invoice) {
  const doc = new jsPDF();
  const marginX = 15;
  let y = 20;

  doc.setFontSize(20);
  doc.text('SUNDAY', marginX, y);
  doc.setFontSize(10);
  doc.text('Premium Men\'s Fashion — Bangladesh', marginX, y + 6);

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
  if (invoice.customer_mobile) { doc.text(`Mobile: ${invoice.customer_mobile}`, marginX, y); y += 6; }
  if (invoice.customer_address) { doc.text(`Address: ${invoice.customer_address}`, marginX, y); y += 6; }

  y += 8;
  doc.setFontSize(11);
  doc.text('Item', marginX, y);
  doc.text('Qty', 130, y);
  doc.text('Price', 155, y);
  doc.text('Total', 180, y);
  y += 4;
  doc.line(marginX, y, 195, y);
  y += 6;

  doc.setFontSize(10);
  (invoice.items || []).forEach(item => {
    doc.text(`${item.name}${item.size ? ' (' + item.size + ')' : ''}`, marginX, y);
    doc.text(String(item.quantity), 130, y);
    doc.text(`৳${item.price}`, 155, y);
    doc.text(`৳${(item.price * item.quantity).toLocaleString()}`, 180, y);
    y += 7;
  });

  y += 4;
  doc.line(marginX, y, 195, y);
  y += 8;

  doc.text(`Subtotal: ৳${(invoice.subtotal || 0).toLocaleString()}`, 140, y);
  y += 6;
  doc.text(`Delivery: ৳${(invoice.delivery_charge || 0).toLocaleString()}`, 140, y);
  y += 6;
  doc.setFontSize(12);
  doc.text(`Total: ৳${(invoice.total || 0).toLocaleString()}`, 140, y);

  doc.save(`${invoice.invoice_number}.pdf`);
}
