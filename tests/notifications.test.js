const { mockClient } = require('aws-sdk-client-mock');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');

process.env.EVENT_BUS_NAME = 'bus-test';
const ebMock = mockClient(EventBridgeClient);
const { handler } = require('../services/notifications/index');

beforeEach(() => ebMock.reset());
jest.spyOn(console, 'log').mockImplementation(() => {});

const sqsRecord = (messageId, detail) => ({
  messageId,
  body: JSON.stringify({ source: 'mini.orders', 'detail-type': 'OrderCreated', detail }),
});

describe('notifications service', () => {
  test('publishes NotificationSent for each message', async () => {
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
    const res = await handler({ Records: [sqsRecord('m1', { orderId: 'o1', customerEmail: 'a@b.com', total: 10 })] });
    expect(res.batchItemFailures).toEqual([]);
    const entry = ebMock.commandCalls(PutEventsCommand)[0].args[0].input.Entries[0];
    expect(entry).toMatchObject({ Source: 'mini.notifications', DetailType: 'NotificationSent' });
  });

  test('reports only failed messages (partial batch response)', async () => {
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });
    const res = await handler({
      Records: [
        sqsRecord('ok-1', { orderId: 'o1', customerEmail: 'a@b.com', total: 1 }),
        sqsRecord('bad-1', { orderId: 'o2', customerEmail: 'fail@b.com', total: 1 }),
      ],
    });
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: 'bad-1' }]);
    expect(ebMock.commandCalls(PutEventsCommand)).toHaveLength(1);
  });
});
