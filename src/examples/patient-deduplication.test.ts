import { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './patient-deduplication';

describe('Link Patient', async () => {
  test('Success', async () => {
    const medplum = new MockClient();
    //Create an original Patient
    const patient1: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'DL',
                display: "Driver's License",
              },
            ],
            text: "Driver's License",
          },
          system: 'urn:oid:2.16.840.1.113883.4.3.25',
          value: 'S99985931',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    medplum.createResource(patient1);

    const patient2: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    medplum.createResource(patient2);

    const contentType = 'application/fhir+json';

    await handler(medplum, { input: patient2, contentType, secrets: {} });

    const mergedPatient = await medplum.readResource('Patient', patient1.id as string);
    console.log(JSON.stringify(mergedPatient));
    //expect(mergedPatient.link?.[0].type).toBe('replaces');
  });

  test('Warning', async () => {
    const medplum = new MockClient();
    //Create an original Patient
    const patient1: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'DL',
                display: "Driver's License",
              },
            ],
            text: "Driver's License",
          },
          system: 'urn:oid:2.16.840.1.113883.4.3.25',
          value: 'S99985931',
        },
      ],
      birthDate: '1948-07-01',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    medplum.createResource(patient1);

    //Create the data
    const patient2: Patient = await medplum.createResource({
      resourceType: 'Patient',
      identifier: [
        {
          type: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
                code: 'SS',
                display: 'Social Security Number',
              },
            ],
            text: 'Social Security Number',
          },
          system: 'http://hl7.org/fhir/sid/us-ssn',
          value: '999-47-5984',
        },
      ],
      name: [
        {
          family: 'Smith',
          given: ['Jane'],
        },
      ],
    });

    const contentType = 'application/fhir+json';
    await handler(medplum, { input: patient2, contentType, secrets: {} });

    console.log(JSON.stringify(patient2));
    //expect(patient2.active).toBe(true);
    console.log(patient2.active);
  });
});
