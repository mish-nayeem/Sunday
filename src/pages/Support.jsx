import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { INFO_PAGES, SUPPORT_TABS } from '@/admin/content/info-pages.js';
import { fetchSupportPages } from '@/admin/lib/support.js';
import ReturnPortal from '@/components/support/ReturnPortal';

// /support/<tab>: every policy page and the Return & Exchange Portal behind
// one row of tabs. The copy comes from Admin → Support → Support pages.
export default function Support() {
  const { slug = 'refunds' } = useParams();
  const tab = SUPPORT_TABS.find((t) => t.slug === slug);
  const [pages, setPages] = useState(INFO_PAGES);
  const tabsRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetchSupportPages().then(({ pages: p }) => alive && setPages(p));
    return () => { alive = false; };
  }, []);

  // On a phone the row scrolls sideways; keep the open tab in view.
  useEffect(() => {
    const on = tabsRef.current?.querySelector('[aria-current="page"]');
    if (on) tabsRef.current.scrollTo({ left: on.offsetLeft - 16 });
  }, [slug]);

  if (!tab) return <Navigate to="/support" replace />;
  const page = slug === 'portal' ? null : pages[slug];

  return (
    <div className="px-4 md:px-6 pb-20">
      <nav ref={tabsRef} className="flex gap-5 overflow-x-auto hide-scrollbar border-b border-rule py-3 -mx-4 md:-mx-6 px-4 md:px-6" aria-label="Support">
        {SUPPORT_TABS.map((t) => (
          <Link
            key={t.slug}
            to={`/support/${t.slug}`}
            aria-current={t.slug === slug ? 'page' : undefined}
            className={`shrink-0 text-[13px] pb-1 border-b ${t.slug === slug ? 'border-ink' : 'border-transparent text-graphite hover:text-ink'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {slug === 'portal' ? <ReturnPortal /> : page && <InfoBody page={page} />}
    </div>
  );
}

function InfoBody({ page }) {
  return (
    <article className="max-w-2xl pt-8 md:pt-12">
      <h1 className="font-heading text-[32px] md:text-[44px] leading-tight">{page.title}</h1>
      {page.intro && <p className="mt-3 text-[15px] leading-relaxed text-graphite">{page.intro}</p>}

      <div className="mt-10 space-y-10">
        {page.blocks.map((block, i) => {
          if (block.type === 'contact') {
            return (
              <div key={i} className="grid sm:grid-cols-3 gap-px bg-rule border border-rule">
                {(block.items || []).map((item) => (
                  <a key={item.label} href={item.href || undefined} className="bg-white p-4 hover:bg-stone">
                    <p className="text-[12px] text-graphite">{item.label[0] + item.label.slice(1).toLowerCase()}</p>
                    <p className="text-[14px] mt-1 break-words">{item.value}</p>
                  </a>
                ))}
              </div>
            );
          }
          if (block.type === 'table') {
            return (
              <section key={i}>
                {block.heading && <h2 className="font-heading text-[22px] mb-3">{block.heading}</h2>}
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-ink">
                        {(block.head || []).map((h) => (
                          <th key={h} className="text-left font-normal py-2 pr-4 text-graphite">{h[0] + h.slice(1).toLowerCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(block.rows || []).map((row, ri) => (
                        <tr key={ri} className="border-b border-rule">
                          {row.map((cell, ci) => <td key={ci} className="py-2 pr-4 align-top">{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          }
          return (
            <section key={i}>
              {block.heading && <h2 className="font-heading text-[22px] mb-2">{block.heading}</h2>}
              <p className="text-[15px] leading-relaxed">{block.body}</p>
            </section>
          );
        })}
      </div>
    </article>
  );
}

