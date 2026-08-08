import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Terms & Conditions</h1>
        <p className="text-xs text-charcoal/40 mt-2">Last updated: August 2026</p>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 space-y-8 text-sm text-charcoal/70 leading-relaxed">

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Orders & Pricing</h2>
          <p>All prices on SUNDAY are listed in Bangladeshi Taka (৳) and include applicable taxes. We reserve the right to change prices, product descriptions, and availability at any time without prior notice. Placing an order does not guarantee stock availability — if an item is out of stock after you order, we'll contact you to offer an alternative, store credit, or a full refund of any advance payment made.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Payment</h2>
          <p>We currently accept two payment methods:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li><strong>Cash on Delivery (Inside Dhaka):</strong> Pay the full order amount in cash when your order is delivered.</li>
            <li><strong>bKash Advance Payment (Outside Dhaka):</strong> Pay the delivery charge in advance via bKash and provide the Transaction ID at checkout. The remaining amount is paid in cash on delivery.</li>
          </ul>
          <p className="mt-2">Providing an incorrect or unverifiable bKash Transaction ID may result in your order being delayed or cancelled.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Delivery</h2>
          <p>We aim to deliver within Dhaka in 1–3 business days and outside Dhaka in 3–7 business days, though delays can occasionally happen due to courier or weather conditions. Delivery charges are non-refundable once your order has been dispatched.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Order Cancellation</h2>
          <p>You may cancel an order before it has been dispatched by contacting us directly. Orders that have already been shipped cannot be cancelled, but may be eligible for exchange under our{' '}
            <Link to="/refund-policy" className="text-wine underline">Refund & Exchange Policy</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Returns & Exchanges</h2>
          <p>See our full{' '}
            <Link to="/refund-policy" className="text-wine underline">Refund & Exchange Policy</Link>{' '}
            for eligibility, timeframes, and how to request an exchange.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Intellectual Property</h2>
          <p>All content on this site — including the SUNDAY name, logo, product photography, and descriptions — is the property of SUNDAY and may not be copied or reused without permission.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Limitation of Liability</h2>
          <p>SUNDAY is not liable for delays or issues caused by third-party couriers, payment processors, or events outside our reasonable control. Our liability for any claim is limited to the amount you paid for the relevant order.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Governing Law</h2>
          <p>These terms are governed by the laws of Bangladesh.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Contact Us</h2>
          <p>Questions about these terms? Reach us at{' '}
            <a href="mailto:sundayclothin@gmail.com" className="text-wine underline">sundayclothin@gmail.com</a> or{' '}
            <a href="tel:01629178834" className="text-wine underline">01629178834</a>.
          </p>
        </section>

      </div>
    </div>
  );
}
