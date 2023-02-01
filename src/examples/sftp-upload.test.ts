import { handler } from './sftp-upload';

test('Hello SFTP', async () => {
  const result = await handler();
  expect(result).toBeDefined();
});
