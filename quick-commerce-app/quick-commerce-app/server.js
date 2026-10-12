const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Demo data. In production, persist these records in PostgreSQL/Redis.
const products = [
  { id: 'P101', name: 'Fresh Milk', category: 'Dairy', price: 30, unit: '500 ml', emoji: '🥛' },
  { id: 'P102', name: 'Brown Bread', category: 'Bakery', price: 45, unit: '400 g', emoji: '🍞' },
  { id: 'P103', name: 'Eggs', category: 'Dairy', price: 72, unit: '6 pcs', emoji: '🥚' },
  { id: 'P104', name: 'Bananas', category: 'Fruits', price: 40, unit: '6 pcs', emoji: '🍌' },
  { id: 'P105', name: 'Basmati Rice', category: 'Staples', price: 120, unit: '1 kg', emoji: '🍚' },
  { id: 'P106', name: 'Tomatoes', category: 'Vegetables', price: 35, unit: '500 g', emoji: '🍅' }
];
const stores = [
  { id: 'S101', name: 'Green Basket - Central', distanceKm: 1.2, eta: '10–15 min' },
  { id: 'S102', name: 'Daily Needs - West', distanceKm: 2.4, eta: '15–20 min' }
];
const stock = {
  'S101': { P101: 18, P102: 8, P103: 12, P104: 20, P105: 6, P106: 0 },
  'S102': { P101: 5, P102: 14, P103: 4, P104: 9, P105: 11, P106: 16 }
};
const carts = new Map();
const orders = new Map();
const deliveryPartners = [
  { id: 'DP01', name: 'Arun', vehicle: 'Bike' },
  { id: 'DP02', name: 'Priya', vehicle: 'Scooter' },
  { id: 'DP03', name: 'Kavin', vehicle: 'Bike' }
];
const cache = new Map();
const events = [];
let orderCounter = 1000;
function cached(key, ttlMs, build) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return { value: hit.value, cache: 'HIT' };
  const value = build(); cache.set(key, { value, expires: now + ttlMs });
  return { value, cache: 'MISS' };
}
function emit(type, payload) { events.push({ type, payload, at: new Date().toISOString() }); }
function getCart(cartId) {
  if (!carts.has(cartId)) carts.set(cartId, { cartId, items: [] });
  return carts.get(cartId);
}

// API Gateway-style routing: all REST APIs enter this Express application.
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'quick-commerce-api-gateway' }));
app.get('/api/products/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  const result = cached('search:' + q, 15000, () => products.filter(p => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
  res.set('X-Cache', result.cache); res.json(result.value);
});
app.get('/api/inventory/nearby', (req, res) => {
  const productId = String(req.query.productId || '');
  if (!products.some(p => p.id === productId)) return res.status(404).json({ error: 'Product not found' });
  // Short-lived cache is only for display; order placement always checks live stock.
  const result = cached('inventory:' + productId, 2000, () => stores.map(s => ({ ...s, productId, available: stock[s.id][productId] || 0, inStock: (stock[s.id][productId] || 0) > 0 })));
  res.set('X-Cache', result.cache); res.json(result.value);
});
app.get('/api/carts/:cartId', (req, res) => res.json(getCart(req.params.cartId)));
app.post('/api/carts/:cartId/items', (req, res) => {
  const { productId, quantity, storeId } = req.body || {};
  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) return res.status(400).json({ error: 'Quantity must be an integer from 1 to 50' });
  const chosenStore = storeId || stores[0].id;
  if (!stock[chosenStore] || stock[chosenStore][productId] === undefined) return res.status(400).json({ error: 'Invalid store for this product' });
  if (stock[chosenStore][productId] < quantity) return res.status(409).json({ error: 'Not enough stock at selected store', available: stock[chosenStore][productId] });
  const cart = getCart(req.params.cartId);
  const existing = cart.items.find(i => i.productId === productId && i.storeId === chosenStore);
  if (existing) existing.quantity += quantity;
  else cart.items.push({ productId, name: product.name, price: product.price, quantity, storeId: chosenStore, storeName: stores.find(s => s.id === chosenStore).name });
  res.status(201).json({ message: 'Product added to cart', ...cart, totalAmount: cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0) });
});
app.delete('/api/carts/:cartId/items/:productId', (req, res) => {
  const cart = getCart(req.params.cartId);
  cart.items = cart.items.filter(i => i.productId !== req.params.productId);
  res.json(cart);
});
app.post('/api/orders', (req, res) => {
  const { cartId, address } = req.body || {};
  const cart = carts.get(cartId);
  if (!cart || !cart.items.length) return res.status(400).json({ error: 'Cart is empty' });
  if (!address || !String(address).trim()) return res.status(400).json({ error: 'Delivery address is required' });
  // Validate all items before changing any stock, so the demo avoids partial reservations.
  for (const item of cart.items) {
    if ((stock[item.storeId][item.productId] || 0) < item.quantity) return res.status(409).json({ error: `Insufficient stock for ${item.name}` });
  }
  for (const item of cart.items) stock[item.storeId][item.productId] -= item.quantity;
  cache.clear(); // inventory changed: invalidate cached product/inventory views
  const id = 'ORD' + (++orderCounter);
  const partner = deliveryPartners[(orderCounter - 1001) % deliveryPartners.length];
  const total = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const order = { orderId: id, items: cart.items.map(i => ({ ...i })), totalAmount: total, address: String(address).trim(), status: 'OUT_FOR_DELIVERY', storeId: cart.items[0].storeId, deliveryPartner: partner, eta: '15–25 min', createdAt: new Date().toISOString() };
  orders.set(id, order); carts.set(cartId, { cartId, items: [] });
  emit('OrderPlaced', { orderId: id, total });
  emit('StockReserved', { orderId: id, items: order.items.map(i => ({ productId: i.productId, quantity: i.quantity })) });
  emit('DeliveryAssigned', { orderId: id, partnerId: partner.id });
  emit('NotificationQueued', { orderId: id, status: order.status });
  res.status(201).json({ message: 'Order placed and delivery partner assigned', ...order });
});
app.get('/api/orders/:orderId/delivery-status', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ orderId: order.orderId, status: order.status, deliveryPartner: order.deliveryPartner, eta: order.eta, lastUpdated: order.createdAt });
});
app.get('/api/demo/events', (_req, res) => res.json(events.slice(-20).reverse()));
app.get('/api/demo/architecture', (_req, res) => res.json({ gateway: 'Express.js', routes: { users: 'Future User Service + PostgreSQL', products: 'Product Service + PostgreSQL/OpenSearch', inventory: 'Inventory Service + PostgreSQL; short Redis cache', carts: 'Cart Service + Redis', orders: 'Order Service + PostgreSQL', delivery: 'Delivery Service + PostgreSQL', messaging: 'Kafka/RabbitMQ in production', notifications: 'Notification Service consumes events' }, scaling: ['Load balancer and horizontal service replicas', 'Redis cache for popular products/search', 'Atomic transactional stock reservation', 'Durable message broker with retries and idempotent consumers', 'Database indexes, replication and partitioning'] }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });
app.listen(PORT, () => console.log(`Quick Commerce demo running at http://localhost:${PORT}`));
