import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { INFO_PAGES, SUPPORT_TABS } from '@/admin/content/info-pages.js';
import { fetchSupportPages, fetchSupportTabs } from '@/admin/lib/support.js';
import { cleanHtml } from '@/admin/lib/richText.js';
import '@/admin/components/rich-text.css';
import ReturnPortal from '@/components/support/ReturnPortal';

// /support/<tab>: every policy page and the Return & Exchange Portal behind
// one row of tabs. The row (names, order, which show, pages added) and the
// copy come from Admin → Support → Support pages. A tab taken off the row
// still opens at its own address (the footer links to some directly).
export default function Support() {
  const { slug: asked } = useParams();
  const [pages, setPages] = useState(INFO_PAGES);
  const [tabs, setTabs] = useState(() => SUPPORT_TABS.map((t) => ({ ...t, on: true })));
  const [ready, setReady] = useState(false);
  const tabsRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchSupportPages(), fetchSupportTabs()]).then(([{ pages: p }, { tabs: t }]) => {
      if (!alive) return;
      setPages(p);
      setTabs(t);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const row = tabs.filter((t) => t.on !== false);
  const slug = asked || row[0]?.slug || 'refunds';

  // On a phone the row scrolls sideways; keep the open tab in view.
  useEffect(() => {
    const on = tabsRef.current?.querySelector('[aria-current="page"]');
    if (on) tabsRef.current.scrollTo({ left: on.offsetLeft - 16 });
  }, [slug]);

  const page = slug === 'portal' ? null : pages[slug];
  // An address with nothing behind it (a tab since deleted) goes to the
  // first tab — once the admin's tabs are in, so a new tab isn't bounced.
  if (ready && slug !== 'portal' && !page) return <Navigate to="/support" replace />;

  return (
    <div className="px-4 md:px-6 pb-20">
      <nav ref={tabsRef} className="flex gap-5 overflow-x-auto hide-scrollbar border-b border-rule py-3 -mx-4 md:-mx-6 px-4 md:px-6" aria-label="Support">
        {row.map((t) => (
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
              {/* Written in the admin's editor: its formatting, cleaned.
                  Older sections are plain text, as before. */}
              {block.html != null
                ? <div className="rich-text text-[15px]" dangerouslySetInnerHTML={{ __html: cleanHtml(block.html) }} />
                : <p className="text-[15px] leading-relaxed whitespace-pre-line">{block.body}</p>}
            </section>
          );
        })}
      </div>
    </article>
  );
}

