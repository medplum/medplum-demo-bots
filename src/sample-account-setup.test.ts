import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './sample-account-setup';

const contentType = 'application/fhir+json';
// To run this test only: npm t -- src/sample-account-setup.test.ts

test('Create data for patient', async () => {
  const medplum = new MockClient();

  const input = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Michael'], family: 'Scott' }],
    telecom: [
      {
        system: 'email',
        value: 'michael@example.com',
      },
    ],
  });

  const result = await handler(medplum, { input, contentType });
  expect(result).toBe(true);

  expect(handler(medplum, { input, contentType })).resolves.toBe(true);
});
