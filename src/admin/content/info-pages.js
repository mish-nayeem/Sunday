// SUNDAY's support copy. Each entry renders on /support/<slug>; Admin →
// Support → Support pages can rewrite any of them without a deploy (saved
// pages replace these defaults whole — see lib/support.js mergePages).
// Built from the policy pages SUNDAY already had.

export const CONTACT_EMAIL = 'sundayclothin@gmail.com'
export const CONTACT_PHONE = '01629178834'
export const INSTAGRAM = 'https://www.instagram.com/sunday.clothin'
export const FACEBOOK = 'https://www.facebook.com/share/19U1FfCwMY/'

export const INFO_PAGES = {
  contact: {
    title: 'Contact info',
    eyebrow: 'SUPPORT',
    intro: "Questions about an order, a size or a delivery? Message us and we'll get back to you.",
    blocks: [
      {
        type: 'contact',
        items: [
          { label: 'EMAIL', value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}` },
          { label: 'PHONE / WHATSAPP', value: CONTACT_PHONE, href: `tel:${CONTACT_PHONE}` },
          { label: 'INSTAGRAM', value: '@sunday.clothin', href: INSTAGRAM },
        ],
      },
      {
        type: 'text',
        heading: 'About your order',
        body: 'Have your order number ready. It starts with SND and is in your confirmation email and on the order confirmation page.',
      },
    ],
  },

  'size-guide': {
    title: 'Size guide',
    eyebrow: 'SUPPORT',
    intro: 'Measurements are of the garment laid flat, in inches. Measure a piece you already own and compare.',
    blocks: [
      {
        type: 'table',
        heading: 'Tops: shirts, polos, t-shirts',
        head: ['SIZE', 'CHEST', 'LENGTH', 'SHOULDER'],
        rows: [
          ['S', '38', '27', '17'],
          ['M', '40', '28', '17.5'],
          ['L', '42', '29', '18'],
          ['XL', '44', '30', '18.5'],
          ['XXL', '46', '31', '19'],
        ],
      },
    ],
  },

  delivery: {
    title: 'Delivery info',
    eyebrow: 'SUPPORT',
    intro: 'We deliver all over Bangladesh.',
    blocks: [
      {
        type: 'table',
        heading: 'Charges and times',
        head: ['AREA', 'TIME', 'CHARGE', 'PAYMENT'],
        rows: [
          ['Inside Dhaka', '1–3 business days', 'Tk 80', 'Cash on delivery'],
          ['Outside Dhaka', '3–7 business days', 'Tk 200', 'Delivery charge by bKash in advance, the rest in cash'],
        ],
      },
      {
        type: 'text',
        heading: 'bKash advance',
        body: 'For orders outside Dhaka, send the delivery charge by bKash and enter the Transaction ID at checkout. An incorrect or unverifiable Transaction ID may delay or cancel the order.',
      },
      {
        type: 'text',
        heading: 'Delays',
        body: 'Couriers or weather can occasionally delay a delivery. Delivery charges are non-refundable once an order has been dispatched.',
      },
    ],
  },

  refunds: {
    title: 'Return & refund',
    eyebrow: 'SUPPORT',
    intro: 'SUNDAY offers exchanges, not cash refunds, except for an out-of-stock item after a bKash advance.',
    blocks: [
      {
        type: 'text',
        heading: 'Exchange only',
        body: 'We offer exchanges for a different size or another product of equal value. We do not offer cash refunds.',
      },
      {
        type: 'text',
        heading: 'Out-of-stock advance payments',
        body: "If you paid a bKash advance for an outside-Dhaka order and the item turns out to be out of stock, you're entitled to a full refund of that advance, or store credit toward another item. Your choice.",
      },
      {
        type: 'text',
        heading: 'How to ask',
        body: 'Use the Return & Exchange Portal with your order number and the phone or email you ordered with, or contact us within 3 days of delivery.',
      },
    ],
  },

  exchange: {
    title: 'Exchange policy',
    eyebrow: 'SUPPORT',
    intro: 'You can request an exchange within 3 days of delivery.',
    blocks: [
      {
        type: 'text',
        heading: 'Conditions',
        body: 'The item must be unused, unwashed and unworn, in its original condition with all tags attached, and in its original packaging. Damaged, altered or worn items cannot be exchanged.',
      },
      {
        type: 'text',
        heading: 'Delivery charges for an exchange',
        body: 'You cover the cost of returning the original item to us. SUNDAY covers sending the replacement back to you.',
      },
      {
        type: 'text',
        heading: 'Cancelling an order',
        body: 'You can cancel an order before it is dispatched by contacting us. Shipped orders cannot be cancelled, but may be exchanged under this policy.',
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    eyebrow: 'SUPPORT',
    intro: 'What we collect when you order, and what we do with it.',
    blocks: [
      {
        type: 'text',
        heading: 'Information we collect',
        body: 'When you place an order we collect your name, email address, mobile number, delivery address and order details. If you pay by bKash we also record the Transaction ID for verification.',
      },
      {
        type: 'text',
        heading: 'How we use it',
        body: 'To process, confirm and deliver your order; to send your confirmation email and invoice; to contact you about your order; to send occasional emails about new arrivals and offers (you can unsubscribe any time); and to run advertising on Facebook and Instagram. We never sell your information.',
      },
      {
        type: 'text',
        heading: 'Services we use',
        body: 'Supabase stores our order and customer database, Brevo sends order emails, and Meta (Facebook/Instagram) is used for advertising.',
      },
      {
        type: 'text',
        heading: 'Your bag and browser storage',
        body: 'Your bag is kept in your browser on your device until you check out.',
      },
      {
        type: 'text',
        heading: 'Your rights',
        body: `We keep order information for accounting and support. To get a copy, correct it or ask us to delete it, email ${CONTACT_EMAIL}.`,
      },
    ],
  },

  terms: {
    title: 'Terms of service',
    eyebrow: 'SUPPORT',
    intro: 'The terms for ordering from SUNDAY.',
    blocks: [
      {
        type: 'text',
        heading: 'Orders and pricing',
        body: "Prices are in Bangladeshi Taka and include applicable taxes. We may change prices, descriptions and availability without notice. If an item is out of stock after you order, we'll offer an alternative, store credit, or a full refund of any advance paid.",
      },
      {
        type: 'text',
        heading: 'Payment',
        body: 'Inside Dhaka: cash on delivery for the full amount. Outside Dhaka: the delivery charge in advance by bKash, the rest in cash on delivery.',
      },
      {
        type: 'text',
        heading: 'Intellectual property',
        body: 'The SUNDAY name, logo, product photography and descriptions belong to SUNDAY and may not be copied or reused without permission.',
      },
      {
        type: 'text',
        heading: 'Liability',
        body: 'SUNDAY is not liable for delays caused by couriers, payment processors or events outside our control. Our liability for any claim is limited to the amount paid for the order.',
      },
      {
        type: 'text',
        heading: 'Governing law',
        body: 'These terms are governed by the laws of Bangladesh.',
      },
    ],
  },
}

export const SUPPORT_TABS = [
  { slug: 'refunds', label: 'Return & Refund' },
  { slug: 'exchange', label: 'Exchange Policy' },
  { slug: 'delivery', label: 'Delivery Info' },
  { slug: 'size-guide', label: 'Size Guide' },
  { slug: 'contact', label: 'Contact Info' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'terms', label: 'Terms of Service' },
  { slug: 'portal', label: 'Return & Exchange Portal' },
]
