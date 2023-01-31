import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './hello-patient';

const medplum = new MockClient();

test('Hello world', async () => {
  const input = { resourceType: 'Patient', name: [{ family: 'Zero', given: ['Patient'] }] } as Patient;
  const contentType = 'application/fhir+json';
  const secrets = {};
  const result = await handler(medplum, { input, contentType, secrets });
  expect(result).toBe(true);
});
