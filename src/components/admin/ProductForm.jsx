import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Upload, X } from 'lucide-react';

const categoryLabels = { full_sleeve_shirts: 'Full Sleeve Shirts', half_sleeve_shirts: 'Half Sleeve Shirts', formal_shirts: 'Formal Shirts', polo: 'Polo', t_shirts: 'T-Shirts', cargo: 'Cargo', formal_pants: 'Formal Pants' };

export default function ProductForm({ onCreated, product = null, onCancel }) {
  const isEditing = !!product;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || 'full_sleeve_shirts',
    price: product?.price ?? '',
    original_price: product?.original_price ?? '',
    cost_price: product?.cost_price ?? '',
    quantity: product?.quantity ?? '',
    description: product?.description || '',
    details: product?.details || '',
    fabric: product?.fabric || '',
    care_instructions: product?.care_instructions || '',
    sizes: product?.sizes?.length ? product.sizes.join(', ') : 'S, M, L, XL, XXL',
    colors: product?.colors?.length ? product.colors.join(', ') : '',
    is_featured: product?.is_featured || false,
    is_new_arrival: product?.is_new_arrival || false,
    is_best_seller: product?.is_best_seller || false
  });
  const [images, setImages] = useState(product?.images || []);

  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const MAX_IMAGES = 2;

  // Resizes to a max dimension and re-encodes as JPEG before upload, so a
  // 8-10MB phone photo becomes a few hundred KB without a visible quality drop.
  const compressImage = (file, maxDimension = 1600, quality = 0.8) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Image compression failed'));
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not load image'));
      };
      img.src = objectUrl;
    });

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files).slice(0, MAX_IMAGES - images.length);
    if (files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        const fileName = `${Date.now()}-${compressed.name}`;
        const { error } = await supabase.storage.from('product-images').upload(fileName, compressed);
        if (!error) {
          const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
          setImages(prev => [...prev, data.publicUrl]);
        } else {
          console.error('Upload failed:', error);
        }
      } catch (err) {
        console.error('Compression/upload failed:', err);
      }
    }
    setUploading(false);
  };

  const removeImage = (idx) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const sizes = form.sizes.split(',').map(s => s.trim()).filter(Boolean);
    const colors = form.colors.split(',').map(c => c.trim()).filter(Boolean);
    const qty = Number(form.quantity) || 0;
    const sizeStock = {};
    const perSize = Math.floor(qty / sizes.length);
    sizes.forEach((s, i) => { sizeStock[s] = i === 0 ? qty - perSize * (sizes.length - 1) : perSize; });

    const payload = {
      name: form.name,
      slug: slugify(form.name),
      category: form.category,
      price: Number(form.price),
      original_price: Number(form.original_price) || 0,
      cost_price: Number(form.cost_price) || 0,
      quantity: qty,
      size_stock: sizeStock,
      description: form.description,
      details: form.details,
      images,
      sizes,
      colors,
      stock_status: qty > 0 ? 'in_stock' : 'out_of_stock',
      is_featured: form.is_featured,
      is_new_arrival: form.is_new_arrival,
      is_best_seller: form.is_best_seller,
      fabric: form.fabric,
      care_instructions: form.care_instructions,
    };

    if (isEditing) {
      await supabase.from('products').update(payload).eq('id', product.id);
    } else {
      await supabase.from('products').insert({ ...payload, sku: '', sort_order: 0 });
    }

    setSaving(false);
    onCreated();
  };

  const fields = [
    { key: 'name', label: 'Product Name *', type: 'text', required: true },
    { key: 'price', label: 'Price (৳) *', type: 'number', required: true },
    { key: 'original_price', label: 'Original Price (৳)', type: 'number' },
    { key: 'cost_price', label: 'Cost Price (৳)', type: 'number' },
    { key: 'quantity', label: 'Quantity *', type: 'number', required: true },
    { key: 'sizes', label: 'Sizes (comma-separated)', type: 'text' },
    { key: 'colors', label: 'Colors (comma-separated)', type: 'text' },
    { key: 'fabric', label: 'Fabric', type: 'text' },
    { key: 'care_instructions', label: 'Care Instructions', type: 'text' },
  ];

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gold/20 p-6 mb-6">
      <h3 className="text-[11px] tracking-[0.2em] uppercase font-medium mb-6">
        {isEditing ? `Edit Product — ${product.name}` : 'Add New Product'}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">{f.label}</label>
            <input
              type={f.type}
              required={f.required}
              value={form[f.key]}
              onChange={e => setForm({ ...form, [f.key]: e.target.value })}
              className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine"
            />
          </div>
        ))}
        <div>
          <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Category *</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine">
            {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Description *</label>
          <textarea required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine resize-none" />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-1">Details</label>
          <textarea value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} rows={2} className="w-full border border-gold/20 px-3 py-2 text-sm outline-none focus:border-wine resize-none" />
        </div>
      </div>

      <div className="mt-4">
        <label className="text-[10px] tracking-wider uppercase text-charcoal/50 block mb-2">Product Images ({images.length}/{MAX_IMAGES})</label>
        <div className="flex gap-3 flex-wrap">
          {images.map((url, i) => (
            <div key={i} className="relative w-20 h-24 group">
              <img src={url} alt="" className="w-full h-full object-cover border border-gold/20" />
              <button type="button" onClick={() => removeImage(i)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <label className="w-20 h-24 border border-dashed border-gold/30 flex items-center justify-center cursor-pointer hover:border-wine transition-colors">
              {uploading ? <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" /> : <Upload size={18} className="text-charcoal/30" />}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            </label>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-6">
        {[
          { key: 'is_featured', label: 'Featured' },
          { key: 'is_new_arrival', label: 'New Arrival' },
          { key: 'is_best_seller', label: 'Best Seller' }
        ].map(f => (
          <label key={f.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.checked })} className="w-4 h-4 accent-wine" />
            {f.label}
          </label>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" disabled={saving} className="bg-wine text-white text-[11px] tracking-wider uppercase px-6 py-2 hover:bg-wine/90 transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Product'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-[11px] tracking-wider uppercase px-6 py-2 border border-gold/30 hover:border-obsidian transition-colors">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
