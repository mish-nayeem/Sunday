import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Trash2, Loader2, CheckCircle2, ImagePlus } from 'lucide-react';

const categoryLabels = { full_sleeve_shirts: 'Full Sleeve Shirts', half_sleeve_shirts: 'Half Sleeve Shirts', formal_shirts: 'Formal Shirts', polo: 'Polo', t_shirts: 'T-Shirts', cargo: 'Cargo', formal_pants: 'Formal Pants' };
const ALL_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

// Same compression approach as ProductForm.jsx — resize + re-encode as JPEG before upload.
const compressImage = (file, maxDimension = 1600, quality = 0.8) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) { height = Math.round((height * maxDimension) / width); width = maxDimension; }
        else { width = Math.round((width * maxDimension) / height); height = maxDimension; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob
          ? resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
          : reject(new Error('Compression failed')),
        'image/jpeg', quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not load image')); };
    img.src = objectUrl;
  });

const slugify = (name) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36).slice(-4);

let draftIdCounter = 0;

export default function AdminBulkUpload() {
  const [drafts, setDrafts] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState(null); // { success: number, failed: [{name, error}] }

  const handleSelectImages = (e) => {
    const files = Array.from(e.target.files);
    const newDrafts = files.map(file => ({
      id: ++draftIdCounter,
      file,
      previewUrl: URL.createObjectURL(file),
      name: '',
      category: 'full_sleeve_shirts',
      price: '',
      description: '',
      sizes: [],
      stockPerSize: '10',
      is_featured: false,
    }));
    setDrafts(prev => [...prev, ...newDrafts]);
    e.target.value = '';
  };

  const updateDraft = (id, patch) => setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  const removeDraft = (id) => setDrafts(prev => prev.filter(d => d.id !== id));
  const toggleSize = (id, size) => setDrafts(prev => prev.map(d =>
    d.id === id ? { ...d, sizes: d.sizes.includes(size) ? d.sizes.filter(s => s !== size) : [...d.sizes, size] } : d
  ));

  const isDraftValid = (d) => d.name.trim() && d.price && Number(d.price) > 0 && d.sizes.length > 0 && d.description.trim();

  const publishAll = async () => {
    const valid = drafts.filter(isDraftValid);
    if (valid.length === 0) return;
    setPublishing(true);
    let successCount = 0;
    const failed = [];

    for (const draft of valid) {
      try {
        const compressed = await compressImage(draft.file);
        const fileName = `${Date.now()}-${compressed.name}`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, compressed);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);

        const stockPerSize = Number(draft.stockPerSize) || 0;
        const size_stock = {};
        draft.sizes.forEach(s => { size_stock[s] = stockPerSize; });
        const quantity = stockPerSize * draft.sizes.length;

        const { error: insertError } = await supabase.from('products').insert({
          name: draft.name.trim(),
          slug: slugify(draft.name),
          category: draft.category,
          price: Number(draft.price),
          quantity,
          size_stock,
          description: draft.description.trim(),
          images: [urlData.publicUrl],
          sizes: draft.sizes,
          stock_status: quantity > 0 ? 'in_stock' : 'out_of_stock',
          is_featured: draft.is_featured,
        });
        if (insertError) throw insertError;

        successCount++;
        setDrafts(prev => prev.filter(d => d.id !== draft.id));
      } catch (err) {
        failed.push({ name: draft.name || '(untitled)', error: err.message });
      }
    }

    setResults({ success: successCount, failed });
    setPublishing(false);
  };

  const validCount = drafts.filter(isDraftValid).length;

  return (
    <div className="max-w-5xl">
      <p className="text-sm text-obsidian/60 mb-6">
        Select photos for several products at once, fill in the details for each, then publish
        them all together. Each photo becomes one product — you can add a second photo per
        product later from the regular Products tab.
      </p>

      {results && (
        <div className={`border p-4 mb-6 ${results.failed.length ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <p className="text-sm font-medium flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" /> {results.success} product(s) published successfully.
          </p>
          {results.failed.length > 0 && (
            <ul className="text-xs text-amber-800 mt-2 list-disc list-inside">
              {results.failed.map((f, i) => <li key={i}>{f.name}: {f.error}</li>)}
            </ul>
          )}
        </div>
      )}

      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-sand/50 hover:border-wine/50 transition-colors py-10 mb-6 cursor-pointer text-sm text-obsidian/50">
        <ImagePlus size={18} />
        Click to select multiple product photos
        <input type="file" accept="image/*" multiple className="hidden" onChange={handleSelectImages} />
      </label>

      {drafts.length > 0 && (
        <>
          <div className="space-y-4 mb-6">
            {drafts.map(d => (
              <div key={d.id} className="flex gap-4 bg-white border border-sand/30 p-4">
                <img src={d.previewUrl} alt="" className="w-24 h-28 object-cover shrink-0 bg-mist" />
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <input
                    placeholder="Product name *" value={d.name}
                    onChange={e => updateDraft(d.id, { name: e.target.value })}
                    className="border border-sand/40 px-2 py-1.5 text-sm outline-none focus:border-wine"
                  />
                  <select value={d.category} onChange={e => updateDraft(d.id, { category: e.target.value })}
                    className="border border-sand/40 px-2 py-1.5 text-sm outline-none focus:border-wine">
                    {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input
                    type="number" placeholder="Price (৳) *" value={d.price}
                    onChange={e => updateDraft(d.id, { price: e.target.value })}
                    className="border border-sand/40 px-2 py-1.5 text-sm outline-none focus:border-wine"
                  />
                  <input
                    type="number" placeholder="Stock per size" value={d.stockPerSize}
                    onChange={e => updateDraft(d.id, { stockPerSize: e.target.value })}
                    className="border border-sand/40 px-2 py-1.5 text-sm outline-none focus:border-wine"
                  />
                  <textarea
                    placeholder="Short description *" value={d.description} rows={1}
                    onChange={e => updateDraft(d.id, { description: e.target.value })}
                    className="border border-sand/40 px-2 py-1.5 text-sm outline-none focus:border-wine md:col-span-2 resize-none"
                  />
                  <div className="md:col-span-2 flex gap-2 flex-wrap">
                    {ALL_SIZES.map(s => (
                      <button key={s} type="button" onClick={() => toggleSize(d.id, s)}
                        className={`text-xs px-2.5 py-1 border ${d.sizes.includes(s) ? 'bg-wine text-white border-wine' : 'border-sand/40 text-obsidian/60'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <label className="md:col-span-2 flex items-center gap-2 text-xs text-obsidian/60 mt-1">
                    <input
                      type="checkbox" checked={d.is_featured}
                      onChange={e => updateDraft(d.id, { is_featured: e.target.checked })}
                      className="accent-wine"
                    />
                    Show in Featured Collection
                  </label>
                </div>
                <button type="button" onClick={() => removeDraft(d.id)} className="text-red-500 hover:text-red-700 shrink-0 h-fit">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={publishAll}
            disabled={publishing || validCount === 0}
            className="bg-wine text-white text-[11px] tracking-wider uppercase px-6 py-3 hover:bg-wine/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {publishing && <Loader2 size={14} className="animate-spin" />}
            {publishing ? 'Publishing...' : `Publish ${validCount} Product(s)`}
          </button>
          {validCount < drafts.length && (
            <p className="text-xs text-obsidian/40 mt-2">
              {drafts.length - validCount} product(s) still need a name, price, description, and at least one size before they can be published.
            </p>
          )}
        </>
      )}
    </div>
  );
}
