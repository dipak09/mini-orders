const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

process.env.TABLE_NAME = 'products-test';
const ddbMock = mockClient(DynamoDBDocumentClient);
const { handler } = require('../services/catalog/index');

beforeEach(() => ddbMock.reset());
jest.spyOn(console, 'log').mockImplementation(() => {});

describe('catalog service', () => {
  test('POST /products creates a product', async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await handler({ routeKey: 'POST /products', body: JSON.stringify({ name: 'Keyboard', price: 49.99 }) });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ name: 'Keyboard', price: 49.99 });
    expect(body.id).toBeDefined();
    expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.TableName).toBe('products-test');
  });

  test('POST /products rejects invalid price', async () => {
    const res = await handler({ routeKey: 'POST /products', body: JSON.stringify({ name: 'X', price: -1 }) });
    expect(res.statusCode).toBe(400);
  });

  test('POST /products rejects malformed JSON', async () => {
    const res = await handler({ routeKey: 'POST /products', body: '{bad' });
    expect(res.statusCode).toBe(400);
  });

  test('GET /products lists items', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ id: '1', name: 'A', price: 1 }] });
    const res = await handler({ routeKey: 'GET /products' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).items).toHaveLength(1);
  });

  test('GET /products/{id} returns 404 when missing', async () => {
    ddbMock.on(GetCommand).resolves({});
    const res = await handler({ routeKey: 'GET /products/{id}', pathParameters: { id: 'nope' } });
    expect(res.statusCode).toBe(404);
  });

  test('returns 500 on DynamoDB failure', async () => {
    ddbMock.on(ScanCommand).rejects(new Error('boom'));
    const res = await handler({ routeKey: 'GET /products' });
    expect(res.statusCode).toBe(500);
  });
});
