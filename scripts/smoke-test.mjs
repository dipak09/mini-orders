// End-to-end smoke test against a deployed stack.
// Usage: API_URL=https://xxxx.execute-api.ap-southeast-2.amazonaws.com node scripts/smoke-test.mjs
const API = (process.env.API_URL || '').replace(/\/$/, '');
if (!API) { console.error('API_URL is required'); process.exit(1); }

const call = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};
const assert = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } console.log(`PASS: ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Catalog
const product = await call('POST', '/products', { name: 'Smoke Test Keyboard', price: 49.99 });
assert(product.status === 201, 'create product returns 201');
const fetched = await call('GET', `/products/${product.data.id}`);
assert(fetched.status === 200 && fetched.data.name === 'Smoke Test Keyboard', 'get product by id');

// 2. Orders (sync path)
const order = await call('POST', '/orders', {
  customerEmail: 'smoke@example.com',
  items: [{ productId: product.data.id, quantity: 2, unitPrice: product.data.price }],
});
assert(order.status === 201 && order.data.status === 'PENDING', 'create order returns PENDING');

// 3. Async path: Orders -> EventBridge -> SQS -> Notifications -> EventBridge -> Orders
let status = 'PENDING';
for (let i = 0; i < 15 && status !== 'CONFIRMED'; i++) {
  await sleep(2000);
  status = (await call('GET', `/orders/${order.data.id}`)).data.status;
}
assert(status === 'CONFIRMED', 'order confirmed asynchronously via events');

// 4. Validation
const bad = await call('POST', '/orders', { customerEmail: 'nope', items: [] });
assert(bad.status === 400, 'invalid order rejected with 400');

console.log('\nAll smoke tests passed');
