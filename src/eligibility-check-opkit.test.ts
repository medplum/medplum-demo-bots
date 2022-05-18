import { createReference } from '@medplum/core';
import { Coverage, Organization, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './eligibility-check-opkit';


const contentType = 'application/fhir+json';

// To run this test only: npm t -- src/eligibility-check-opkit.test.ts
test('Success', async () => {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name:[{given:['John'],family:'Doe'}],
    birthDate:'1994-07-21',
    gender:'male'
  })

  const org = await medplum.createResource<Organization>({
    resourceType: 'Organization',
    name: 'DMERC - Region B (formerly MR031)'
  });
  const input: Coverage = {
    resourceType: 'Coverage',
    beneficiary: createReference(patient),
    subscriber: createReference(patient),
    payor: [createReference(org)],
    subscriberId: '123456789100',
    status: 'active',
  };
  const result = await handler(medplum, { input, contentType });
  expect(result).toBe(true);
});
