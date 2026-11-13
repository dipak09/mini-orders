'use strict';
// Orders service (event consumer) — reacts to NotificationSent and confirms the order.
// Only the orders service writes to OrdersTable (database-per-service).
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, service: 'orders-status', msg, ...extra }));

exports.handler = async (event) => {
  const { orderId } = event.detail || {};
  if (!orderId) {
    log('warn', 'event without orderId, skipping', { eventId: event.id });
    return;
  }
  try {
    // Conditional update = idempotent: duplicate/retried events are a no-op.
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: orderId },
      UpdateExpression: 'SET #s = :confirmed, confirmedAt = :now',
      ConditionExpression: '#s = :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':confirmed': 'CONFIRMED', ':pending': 'PENDING', ':now': new Date().toISOString() },
    }));
    log('info', 'order confirmed', { orderId });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      log('info', 'order already processed, ignoring duplicate', { orderId });
      return;
    }
    throw err; // let EventBridge retry
  }
};
