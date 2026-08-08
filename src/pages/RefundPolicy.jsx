import React from 'react';

export default function RefundPolicy() {
  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Refund & Exchange Policy</h1>
        <p className="text-xs text-charcoal/40 mt-2">Last updated: August 2026</p>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 space-y-8 text-sm text-charcoal/70 leading-relaxed">

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Exchange Only — No Cash Refunds</h2>
          <p>SUNDAY offers <strong>exchanges only</strong> (for a different size or a different product of equal value) — we do not offer cash refunds, except where an item is out of stock after an advance bKash payment has already been made (see below).</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Exchange Window</h2>
          <p>You may request an exchange within <strong>3 days of delivery</strong>. Requests made after this window cannot be accepted.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Conditions for Exchange</h2>
          <p>To be eligible, the item must be:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li>Unused, unwashed, and unworn</li>
            <li>In its original condition with all tags attached</li>
            <li>In its original packaging</li>
          </ul>
          <p className="mt-2">Items that are damaged, altered, or worn cannot be exchanged.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">How to Request an Exchange</h2>
          <p>Contact us within 3 days of delivery with your Order ID and the reason for exchange:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li>Email: <a href="mailto:sundayclothin@gmail.com" className="text-wine underline">sundayclothin@gmail.com</a></li>
            <li>Phone/WhatsApp: <a href="tel:01629178834" className="text-wine underline">01629178834</a></li>
          </ul>
          <p className="mt-2">We'll confirm eligibility and arrange pickup or drop-off details with you.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Delivery Charges for Exchange</h2>
          <p>The customer covers the cost of returning the original item to us. SUNDAY covers the delivery cost of sending the replacement item back to you.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Out-of-Stock Advance Payments</h2>
          <p>If you paid a bKash advance for an outside-Dhaka order and the item turns out to be out of stock, you're entitled to a full refund of that advance payment, or store credit toward another item — your choice.</p>
        </section>

      </div>
    </div>
  );
}
