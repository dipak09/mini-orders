const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');

process.env.TABLE_NAME = 'orders-test';
process.env.EVENT_BUS_NAME = 'bus-test';
const ddbMock = mockClient(DynamoDBDocumentClient);
const ebMock = mockClient(EventBridgeClient);
const api = require('../services/orders/api');
const status = require('../services/orders/status');

beforeEach(() => { ddbMock.reset(); ebMock.reset(); });
jest.spyOn(console, 'log').mockImplementation(() => {});

const validOrder = {
  customerEmail: 'dipak@example.com',
  items: [{ productId: 'p1', quantity: 2, unitPrice: 10.5 }, { productId: 'p2', quantity: 1, unitPrice: 4 }],
};

describe('orders api', () => {
  test('POST /orders stores order and publishes OrderCreated', async () => {
    ddbMock.on(PutCommand).resolves({});
    ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0 });

    const res = await api.handler({ routeKey: 'POST /orders', body: JSON.stringify(validOrder) });
    expect(res.statusCode).toBe(201);
    const order = JSON.parse(res.body);
    expect(order).toMatchObject({ status: 'PENDING', total: 25 });

    const entry = ebMock.commandCalls(PutEventsCommand)[0].args[0].input.Entries[0];
    expect(entry).toMatchObject({ EventBusName: 'bus-test', Source: 'mini.orders', DetailType: 'OrderCreated' });
    expect(JSON.parse(entry.Detail).orderId).toBe(order.id);
  });

  test.each([
    [{ ...validOrder, customerEmail: 'bad' }],
    [{ ...validOrder, items: [] }],
    [{ ...validOrder, items: [{ productId: 'p1', quantity: 0, unitPrice: 1 }] }],
  ])('POST /orders validates input %#', async (body) => {
    const res = await api.handler({ routeKey: 'POST /orders', body: JSON.stringify(body) });
    expect(res.statusCode).toBe(400);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  test('GET /orders/{id} returns the order', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 'o1', status: 'CONFIRMED' } });
    const res = await api.handler({ routeKey: 'GET /orders/{id}', pathParameters: { id: 'o1' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('CONFIRMED');
  });

  test('unknown route returns 404', async () => {
    const res = await api.handler({ routeKey: 'PATCH /orders/{id}' });
    expect(res.statusCode).toBe(404);
  });
});

const cursorFor = (key) => Buffer.from(JSON.stringify(key)).toString('base64url');

describe('orders api: list', () => {
  test('GET /orders returns newest first with a cursor for the next page', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { id: 'a', createdAt: '2026-11-13T10:00:00Z' },
        { id: 'b', createdAt: '2026-11-13T11:00:00Z' },
      ],
      LastEvaluatedKey: { id: 'a' },
    });
    const res = await api.handler({ routeKey: 'GET /orders', queryStringParameters: { limit: '2' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.map((o) => o.id)).toEqual(['b', 'a']);
    expect(body.nextCursor).toBe(cursorFor({ id: 'a' }));
    expect(ddbMock.commandCalls(ScanCommand)[0].args[0].input.Limit).toBe(2);
  });

  test('GET /orders passes a valid cursor as ExclusiveStartKey and omits nextCursor on the last page', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [] });
    const res = await api.handler({ routeKey: 'GET /orders', queryStringParameters: { cursor: cursorFor({ id: 'x' }) } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ items: [] });
    expect(ddbMock.commandCalls(ScanCommand)[0].args[0].input.ExclusiveStartKey).toEqual({ id: 'x' });
  });

  test.each([
    [{ cursor: 'not-base64-json' }],
    [{ cursor: cursorFor({ id: 'x', extra: 1 }) }],
    [{ cursor: cursorFor({ id: 42 }) }],
    [{ limit: '0' }],
    [{ limit: '51' }],
    [{ limit: 'abc' }],
  ])('GET /orders rejects bad query %#', async (qs) => {
    const res = await api.handler({ routeKey: 'GET /orders', queryStringParameters: qs });
    expect(res.statusCode).toBe(400);
    expect(ddbMock.commandCalls(ScanCommand)).toHaveLength(0);
  });
});

describe('orders api: delete', () => {
  test('DELETE /orders/{id} deletes conditionally and returns 204', async () => {
    ddbMock.on(DeleteCommand).resolves({});
    const res = await api.handler({ routeKey: 'DELETE /orders/{id}', pathParameters: { id: 'o1' } });
    expect(res.statusCode).toBe(204);
    const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
    expect(input.Key).toEqual({ id: 'o1' });
    expect(input.ConditionExpression).toBe('attribute_exists(id)');
  });

  test('DELETE /orders/{id} returns 404 when the order does not exist', async () => {
    const err = new Error('conditional'); err.name = 'ConditionalCheckFailedException';
    ddbMock.on(DeleteCommand).rejects(err);
    const res = await api.handler({ routeKey: 'DELETE /orders/{id}', pathParameters: { id: 'gone' } });
    expect(res.statusCode).toBe(404);
  });

  test('DELETE /orders/{id} returns 500 on unexpected errors', async () => {
    ddbMock.on(DeleteCommand).rejects(new Error('throttled'));
    const res = await api.handler({ routeKey: 'DELETE /orders/{id}', pathParameters: { id: 'o1' } });
    expect(res.statusCode).toBe(500);
  });
});

describe('orders status consumer', () => {
  test('confirms a pending order with a conditional update', async () => {
    ddbMock.on(UpdateCommand).resolves({});
    await status.handler({ detail: { orderId: 'o1' } });
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ id: 'o1' });
    expect(input.ConditionExpression).toBe('#s = :pending');
  });

  test('is idempotent for duplicate events', async () => {
    const err = new Error('conditional'); err.name = 'ConditionalCheckFailedException';
    ddbMock.on(UpdateCommand).rejects(err);
    await expect(status.handler({ detail: { orderId: 'o1' } })).resolves.toBeUndefined();
  });

  test('ignores NotificationSent for an order that was deleted meanwhile', async () => {
    // DynamoDB fails the `#s = :pending` condition when the item no longer exists.
    const err = new Error('conditional'); err.name = 'ConditionalCheckFailedException';
    ddbMock.on(UpdateCommand).rejects(err);
    await expect(status.handler({ detail: { orderId: 'deleted-order' } })).resolves.toBeUndefined();
  });

  test('rethrows unexpected errors so EventBridge retries', async () => {
    ddbMock.on(UpdateCommand).rejects(new Error('throttled'));
    await expect(status.handler({ detail: { orderId: 'o1' } })).rejects.toThrow('throttled');
  });
});
