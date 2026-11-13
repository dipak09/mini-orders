'use strict';
// Catalog service — owns products and their data (ProductsTable).
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('node:crypto');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, service: 'catalog', msg, ...extra }));

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
}

async function createProduct(event) {
  let input;
  try {
    input = parseBody(event);
  } catch {
    return json(400, { message: 'Invalid JSON body' });
  }
  const { name, price } = input;
  if (typeof name !== 'string' || !name.trim()) return json(400, { message: 'name is required' });
  if (typeof price !== 'number' || price <= 0) return json(400, { message: 'price must be a positive number' });

  const product = { id: randomUUID(), name: name.trim(), price, createdAt: new Date().toISOString() };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: product }));
  log('info', 'product created', { productId: product.id });
  return json(201, product);
}

async function listProducts() {
  // Scan is fine for a demo catalog; at scale use a GSI + pagination.
  const res = await ddb.send(new ScanCommand({ TableName: TABLE, Limit: 100 }));
  return json(200, { items: res.Items || [] });
}

async function getProduct(event) {
  const id = event.pathParameters && event.pathParameters.id;
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return res.Item ? json(200, res.Item) : json(404, { message: 'Product not found' });
}

exports.handler = async (event) => {
  try {
    switch (event.routeKey) {
      case 'POST /products': return await createProduct(event);
      case 'GET /products': return await listProducts();
      case 'GET /products/{id}': return await getProduct(event);
      default: return json(404, { message: 'Route not found' });
    }
  } catch (err) {
    log('error', 'unhandled error', { error: err.message, requestId: event.requestContext?.requestId });
    return json(500, { message: 'Internal server error' });
  }
};
