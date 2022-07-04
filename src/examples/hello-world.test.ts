import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './hello-world';

const medplum = new MockClient();

test('Hello world', () => {
  const input = 'Hello';
  const contentType = 'text/plain';
  expect(handler(medplum, { input, contentType })).resolves.toBe(true);
});
