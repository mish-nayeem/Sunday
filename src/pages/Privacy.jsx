import React from 'react';

export default function Privacy() {
  return (
    <div className="min-h-screen">
      <div className="bg-mist py-16 md:py-20 px-5 md:px-10 text-center">
        <h1 className="text-3xl md:text-4xl font-light tracking-wide">Privacy Policy</h1>
        <p className="text-xs text-charcoal/40 mt-2">Last updated: August 2026</p>
      </div>
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-16 md:py-24 space-y-8 text-sm text-charcoal/70 leading-relaxed">

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Information We Collect</h2>
          <p>When you place an order, we collect your name, email address, mobile number, delivery address, and order details (items, size, and payment method). If you pay via bKash, we also record the transaction ID you provide for verification.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-1.5">
            <li>To process, confirm, and deliver your order</li>
            <li>To send an order confirmation email with your PDF invoice</li>
            <li>To contact you about your order if there's an issue (delivery, stock, payment)</li>
            <li>To send occasional updates about new arrivals, offers, or promotions by email — you can unsubscribe from these anytime</li>
            <li>To run advertising campaigns (e.g., on Facebook and Instagram) to reach existing customers with relevant offers</li>
          </ul>
          <p className="mt-2">Email is required at checkout because it's how we send your order confirmation and invoice, and how we keep you updated on offers. We will never sell your information to unrelated third parties.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Third-Party Services We Use</h2>
          <p>We use trusted service providers to run SUNDAY, who process your data only to provide their service to us:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2">
            <li><strong>Supabase</strong> — securely stores our order and customer database</li>
            <li><strong>Brevo</strong> — sends your order confirmation emails and invoices</li>
            <li><strong>Meta (Facebook/Instagram)</strong> — used for advertising, which may involve matching your email to run targeted campaigns</li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Cart & Local Storage</h2>
          <p>Your shopping cart is stored in your browser's local storage on your device so it's saved between visits. This data stays on your device and isn't sent to us until you check out.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Data Retention & Your Rights</h2>
          <p>We keep your order information for as long as needed for accounting, warranty, and customer support purposes. You can request a copy of your data, ask us to correct it, or request deletion (subject to any records we're legally required to keep) by contacting us below.</p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-charcoal mb-2 tracking-wide">Contact Us</h2>
          <p>For any privacy questions or requests, reach us at{' '}
            <a href="mailto:sundayclothin@gmail.com" className="text-wine underline">sundayclothin@gmail.com</a> or{' '}
            <a href="tel:01629178834" className="text-wine underline">01629178834</a>.
          </p>
        </section>

      </div>
    </div>
  );
}
