import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './medmorph-bot';

const contentType = 'application/fhir+json';
// npm t src/examples/medmorph-bot.test.ts
test('Success', async () => {
  const medplum = new MockClient();
  const input = await medplum.createResource({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: {
          resourceType: 'DiagnosticReport',
          id: '123456',
          status: 'final',
          category: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
                  code: 'LAB',
                  display: 'Laboratory',
                },
              ],
            },
          ],
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: '789-8',
                display: 'Complete blood count (hemogram) panel - Blood by Automated count',
              },
            ],
            text: 'Complete Blood Count',
          },
          subject: {
            reference: 'Patient/1234',
            display: 'Jane Doe',
          },
          effectiveDateTime: '2023-03-23T10:30:00-04:00',
          issued: '2023-03-23T10:45:00-04:00',
          performer: [
            {
              reference: 'Organization/4567',
              display: 'ABC Laboratory',
            },
          ],
          result: [
            {
              reference: 'Observation/789',
            },
            {
              reference: 'Observation/1011',
            },
            {
              reference: 'Observation/1213',
            },
          ],
        },
        request: {
          method: 'POST',
          url: 'DiagnosticReport',
        },
      },
    ],
  });

  const result = await handler(medplum, { input, contentType, secrets: {} });
  expect(result).toBe(true);
});
