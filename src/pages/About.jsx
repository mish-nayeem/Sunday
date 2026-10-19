import React, { useEffect, useState } from 'react';
import { imgUrl } from '@/lib/storage';
import { fetchAboutBlocks } from '@/admin/lib/about.js';
import attentionImage from '@/assets/attention.jpeg';

// The built-in page, used until the first block is added in Admin → About us.
const DEFAULT_BLOCKS = [
  {
    id: 'default',
    image_url: attentionImage,
    heading: 'About SUNDAY',
    description:
      "SUNDAY is a men's fashion brand from Bangladesh, making shirts, polos, cargo and formal trousers for everyday wear.\n\nWe deliver all over Bangladesh, with cash on delivery inside Dhaka.",
  },
];

// A stack of photo + words blocks, rewritten and reshot from the admin panel
// without a deploy.
export default function About() {
  const [blocks, setBlocks] = useState(null);

  useEffect(() => {
    fetchAboutBlocks().then(({ blocks: rows }) => setBlocks(rows?.length ? rows : DEFAULT_BLOCKS));
  }, []);

  if (!blocks) return <div className="min-h-[60vh]" />;

  return (
    <div className="px-4 md:px-6 pt-8 md:pt-12 pb-20 space-y-16 md:space-y-24">
      {blocks.map((b, i) => (
        <section key={b.id} className={`md:grid md:grid-cols-12 md:gap-8 md:items-end ${i % 2 ? 'md:[&>div:first-child]:order-2' : ''}`}>
          <div className="md:col-span-7 bg-stone overflow-hidden">
            <img
              src={b.id === 'default' ? b.image_url : imgUrl(b.image_url, 1400)}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              className="w-full h-auto"
            />
          </div>
          <div className="md:col-span-5 pt-6 md:pt-0 max-w-md">
            {b.heading && (
              i === 0
                ? <h1 className="font-heading text-[30px] md:text-[40px] leading-tight mb-4">{b.heading}</h1>
                : <h2 className="font-heading text-[26px] md:text-[32px] leading-tight mb-4">{b.heading}</h2>
            )}
            {b.description && (
              <div className="text-[15px] leading-relaxed text-graphite space-y-4">
                {b.description.split(/\n{2,}/).map((para) => <p key={para}>{para}</p>)}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
