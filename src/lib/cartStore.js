// Simple cart + wishlist store using localStorage.
// NOTE: This file was reconstructed from how it's called throughout the app
// (Cart.jsx, Header.jsx, ProductDetail.jsx, Checkout.jsx, ProductCard.jsx,
// Wishlist.jsx) since the original source wasn't available during migration.
// It has no connection to Base44 and needs no further changes.

const CART_KEY = 'sunday_cart';
const WISHLIST_KEY = 'sunday_wishlist';
const RECENT_KEY = 'sunday_recently_viewed';

const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb());
}

export function subscribeCart(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ---------- Cart Drawer (open/close state for the slide-in mini cart) ----------

const drawerListeners = new Set();

export function subscribeCartDrawer(callback) {
  drawerListeners.add(callback);
  return () => drawerListeners.delete(callback);
}

export function openCartDrawer() {
  drawerListeners.forEach((cb) => cb(true));
}

export function closeCartDrawer() {
  drawerListeners.forEach((cb) => cb(false));
}

// ---------- Cart ----------

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  notify();
}

export function addToCart(product, size, quantity = 1) {
  const cart = getCart();
  const existing = cart.find((i) => i.productId === product.id && i.size === size);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      size,
      quantity,
      price: product.price,
      image: product.images?.[0] || '',
      sku: product.sku || '',
    });
  }
  saveCart(cart);
}

export function updateCartItem(productId, size, newQuantity) {
  let cart = getCart();
  if (newQuantity <= 0) {
    cart = cart.filter((i) => !(i.productId === productId && i.size === size));
  } else {
    cart = cart.map((i) =>
      i.productId === productId && i.size === size ? { ...i, quantity: newQuantity } : i
    );
  }
  saveCart(cart);
}

export function removeFromCart(productId, size) {
  const cart = getCart().filter((i) => !(i.productId === productId && i.size === size));
  saveCart(cart);
}

export function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

export function clearCart() {
  saveCart([]);
}

// ---------- Wishlist ----------

export function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
  } catch {
    return [];
  }
}

export function toggleWishlist(productId) {
  let list = getWishlist();
  if (list.includes(productId)) {
    list = list.filter((id) => id !== productId);
  } else {
    list.push(productId);
  }
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
  notify();
  return list.includes(productId);
}

export function isInWishlist(productId) {
  return getWishlist().includes(productId);
}

// ---------- Recently Viewed ----------

export function addRecentlyViewed(productId) {
  try {
    let list = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    list = [productId, ...list.filter((id) => id !== productId)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    localStorage.setItem(RECENT_KEY, JSON.stringify([productId]));
  }
}

export function getRecentlyViewed() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}
