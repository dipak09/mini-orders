'use strict';
// Orders service (HTTP) — creates orders and publishes OrderCreated to EventBridge.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { randomUUID } = require('node:crypto');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const eb = new EventBridgeClient({});
const TABLE = process.env.TABLE_NAME;
const BUS = process.env.EVENT_BUS_NAME;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const noContent = () => ({ statusCode: 204 });

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

// Opaque pagination cursor = DynamoDB LastEvaluatedKey as base64url JSON.
// Decoded cursors are validated so client input is never passed blindly to DynamoDB.
const encodeCursor = (key) => Buffer.from(JSON.stringify(key)).toString('base64url');
function decodeCursor(cursor) {
  try {
    const key = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const keys = key && typeof key === 'object' ? Object.keys(key) : [];
    if (keys.length === 1 && keys[0] === 'id' && typeof key.id === 'string' && key.id) return { id: key.id };
  } catch { /* fall through */ }
  return null;
}
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, service: 'orders', msg, ...extra }));

function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  return JSON.parse(raw);
}

function validate({ customerEmail, items }) {
  if (typeof customerEmail !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(customerEmail)) return 'valid customerEmail is required';
  if (!Array.isArray(items) || items.length === 0) return 'items must be a non-empty array';
  for (const i of items) {
    if (typeof i.productId !== 'string' || !i.productId) return 'each item needs productId';
    if (!Number.isInteger(i.quantity) || i.quantity <= 0) return 'quantity must be a positive integer';
    if (typeof i.unitPrice !== 'number' || i.unitPrice <= 0) return 'unitPrice must be a positive number';
  }
  return null;
}

async function createOrder(event) {
  let input;
  try {
    input = parseBody(event);
  } catch {
    return json(400, { message: 'Invalid JSON body' });
  }
  const error = validate(input);
  if (error) return json(400, { message: error });

  const total = Math.round(input.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100;
  const order = {
    id: randomUUID(),
    customerEmail: input.customerEmail,
    items: input.items,
    total,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: order }));

  // NOTE: write-then-publish is not atomic. Production fix: transactional outbox
  // (DynamoDB Streams -> EventBridge Pipes). Called out in README as a trade-off.
  await eb.send(new PutEventsCommand({
    Entries: [{
      EventBusName: BUS,
      Source: 'mini.orders',
      DetailType: 'OrderCreated',
      Detail: JSON.stringify({ orderId: order.id, customerEmail: order.customerEmail, total }),
    }],
  }));

  log('info', 'order created', { orderId: order.id, total });
  return json(201, order);
}

async function getOrder(event) {
  const id = event.pathParameters && event.pathParameters.id;
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return res.Item ? json(200, res.Item) : json(404, { message: 'Order not found' });
}

async function listOrders(event) {
  const q = event.queryStringParameters || {};
  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined) {
    limit = Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) return json(400, { message: `limit must be an integer 1-${MAX_LIMIT}` });
  }
  let startKey;
  if (q.cursor !== undefined) {
    startKey = decodeCursor(q.cursor);
    if (!startKey) return json(400, { message: 'invalid cursor' });
  }
  // Scan is fine for a demo. At scale: GSI (pk="ORDER", sk=createdAt) + Query, newest first.
  const res = await ddb.send(new ScanCommand({ TableName: TABLE, Limit: limit, ExclusiveStartKey: startKey }));
  const items = (res.Items || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const body = { items };
  if (res.LastEvaluatedKey) body.nextCursor = encodeCursor(res.LastEvaluatedKey);
  return json(200, body);
}

async function deleteOrder(event) {
  const id = event.pathParameters && event.pathParameters.id;
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { id },
      ConditionExpression: 'attribute_exists(id)',
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return json(404, { message: 'Order not found' });
    throw err;
  }
  // A NotificationSent arriving later is a no-op: status.js's conditional update fails on a missing item.
  log('info', 'order deleted', { orderId: id });
  return noContent();
}

exports.handler = async (event) => {
  try {
    switch (event.routeKey) {
      case 'POST /orders': return await createOrder(event);
      case 'GET /orders': return await listOrders(event);
      case 'GET /orders/{id}': return await getOrder(event);
      case 'DELETE /orders/{id}': return await deleteOrder(event);
      default: return json(404, { message: 'Route not found' });
    }
  } catch (err) {
    log('error', 'unhandled error', { error: err.message, requestId: event.requestContext?.requestId });
    return json(500, { message: 'Internal server error' });
  }
};
