import { BotEvent } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect } from 'vitest';
import { handler } from './sample-account-setup';

test('New patient', async () => {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['John'], family: 'Doe' }],
  });

  const event: BotEvent = { contentType: 'application/fhir+json', input: patient };
  await handler(medplum, event);

  const check = await medplum.readResource('Patient', patient.id as string);
  expect(check.generalPractitioner).toBeDefined();
  expect(check.generalPractitioner).toHaveLength(1);

  const observations = await medplum.searchResources('Observation', 'subject=Patient/' + patient.id);
  expect(observations).toHaveLength(7);
});
