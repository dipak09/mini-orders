'use strict';
// Orders service (HTTP) — creates orders and publishes OrderCreated to EventBridge.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
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

exports.handler = async (event) => {
  try {
    switch (event.routeKey) {
      case 'POST /orders': return await createOrder(event);
      case 'GET /orders/{id}': return await getOrder(event);
      default: return json(404, { message: 'Route not found' });
    }
  } catch (err) {
    log('error', 'unhandled error', { error: err.message, requestId: event.requestContext?.requestId });
    return json(500, { message: 'Internal server error' });
  }
};
