// Shared storefront vocabulary: how the database's product categories are
// grouped into the sections shoppers browse by, plus small helpers the
// grid, product page and quick-add all need to agree on.

// Each shop section groups one or more database categories.
export const SECTIONS = [
  { key: 'shirt', label: 'Shirts', categories: ['full_sleeve_shirts', 'half_sleeve_shirts', 'formal_shirts'] },
  { key: 't_shirts', label: 'T-shirts', categories: ['t_shirts'] },
  { key: 'polo', label: 'Polos', categories: ['polo'] },
  { key: 'pant', label: 'Trousers', categories: ['formal_pants', 'cargo', 'jeans'] },
  { key: 'outerwear', label: 'Jackets', categories: ['jackets'] },
  { key: 'accessories', label: 'Accessories', categories: ['bags', 'belts', 'caps', 'shoes', 'accessories'] },
];

export const CATEGORY_LABELS = {
  full_sleeve_shirts: 'Full sleeve shirts',
  half_sleeve_shirts: 'Half sleeve shirts',
  formal_shirts: 'Formal shirts',
  polo: 'Polos',
  t_shirts: 'T-shirts',
  cargo: 'Cargo',
  formal_pants: 'Formal trousers',
  jeans: 'Jeans',
  jackets: 'Jackets',
  bags: 'Bags',
  belts: 'Belts',
  caps: 'Caps',
  shoes: 'Shoes',
  accessories: 'Other accessories',
};

export const COLLECTIONS = [
  { key: 'new_arrival', label: 'New arrivals', column: 'is_new_arrival' },
  { key: 'best_seller', label: 'Best sellers', column: 'is_best_seller' },
];

export const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

// Outside Dhaka also pays Tk 200 up front by bKash (see Checkout).
export const DELIVERY = { insideDhaka: 80, outsideDhaka: 120, outsideAdvance: 200 };

export function sectionFor(category) {
  return SECTIONS.find((s) => s.categories.includes(category));
}

// Per-size stock when the product tracks it, otherwise the overall quantity.
export function isSizeAvailable(product, size) {
  // Sizes switched off by hand in the admin panel, whatever the count says.
  if ((product.sizes_out || []).includes(size)) return false;
  const stock = product.size_stock;
  if (stock && Object.keys(stock).length > 0) return (stock[size] || 0) > 0;
  return (product.quantity || 0) > 0;
}

export function isSoldOut(product) {
  if (product.stock_status === 'out_of_stock') return true;
  return (product.sizes || []).length > 0 && !product.sizes.some((s) => isSizeAvailable(product, s));
}

// "Tk" rather than ৳: the site's typefaces have no taka glyph.
export const formatPrice = (n) => `Tk ${Number(n || 0).toLocaleString('en-IN')}`;
