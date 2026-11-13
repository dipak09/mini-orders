'use strict';
// Notifications service — consumes OrderCreated from SQS (fed by EventBridge),
// "sends" the customer notification, then publishes NotificationSent.
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');

const eb = new EventBridgeClient({});
const BUS = process.env.EVENT_BUS_NAME;
const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, service: 'notifications', msg, ...extra }));

async function processRecord(record) {
  const envelope = JSON.parse(record.body); // EventBridge event delivered via SQS
  const { orderId, customerEmail, total } = envelope.detail;

  // Demo hook: emails containing "fail" throw, so you can show retries -> DLQ live.
  if (customerEmail.includes('fail')) throw new Error(`simulated delivery failure for ${orderId}`);

  // In production this would call SES / a provider. Here we just log it.
  log('info', 'notification sent', { orderId, to: customerEmail, total });

  await eb.send(new PutEventsCommand({
    Entries: [{
      EventBusName: BUS,
      Source: 'mini.notifications',
      DetailType: 'NotificationSent',
      Detail: JSON.stringify({ orderId, channel: 'email' }),
    }],
  }));
}

exports.handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (err) {
      log('error', 'failed to process message', { messageId: record.messageId, error: err.message });
      // Partial batch response: only failed messages are retried / sent to the DLQ.
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
