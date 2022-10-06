import { BotEvent, Hl7Message } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './sftp-upload';

const medplum = new MockClient();

test('Hello SFTP', async () => {
  const secrets = {};
  const input = '';
  const contentType = 'text/plain';
  const result = await handler(medplum, { input, contentType, secrets } as BotEvent);
  expect(result).toBeDefined();
});
