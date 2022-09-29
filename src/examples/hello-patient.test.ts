import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './hello-patient';

const medplum = new MockClient();

test('Hello world', () => {
  const input = 'Hello';
  const contentType = 'text/plain';
  const secrets = {};
  expect(handler(medplum, { input, contentType, secrets })).resolves.toBe(true);
});
