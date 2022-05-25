import { createReference } from '@medplum/core';
import { Coverage, CoverageEligibilityRequest, Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './eligibility-check-opkit';

const contentType = 'application/fhir+json';

// To run this test only: npm t -- src/eligibility-check-opkit.test.ts
test('Success', async () => {
  const medplum = new MockClient();

  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Michael'], family: 'Scott' }],
    birthDate: '01-01-2000',
    gender: 'male',
    telecom: [
      {
        system: 'email',
        value: 'michael@example.com',
      },
    ],
  });

  const org = await medplum.createResource<Organization>({
    resourceType: 'Organization',
    name: 'THE OFFICE INSURANCE COMPANY',
    identifier: [
      {
        system: 'https://docs.opkit.co/reference/getpayers',
        value: 'dcc25e45-9110-4f39-9a56-2306b5430bd0',
      },
    ],
  });

  const practioner = await medplum.createResource<Practitioner>({
    resourceType: 'Practitioner',
    name: [
      {
        given: ['Given Name'],
        family: 'Family Name',
      },
    ],
    identifier: [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: 'NPI',
            },
          ],
        },
        system: 'http://hl7.org/fhir/sid/us-npi',
        value: '123456789',
      },
    ],
  });

  const coverage = await medplum.createResource<Coverage>({
    resourceType: 'Coverage',
    subscriber: createReference(patient),
    payor: [createReference(org)],
    subscriberId: '123',
    status: 'active',
  });

  const input: CoverageEligibilityRequest = {
    id: '83230953-5283-48e6-ae7f-57363a142d8a',
    resourceType: 'CoverageEligibilityRequest',
    provider: createReference(practioner),
    patient: createReference(patient),
    insurer: createReference(org),
    insurance: [createReference(coverage)],
  };

  const result = await handler(medplum, { input, contentType });
  expect(result).toBe(true);
});
