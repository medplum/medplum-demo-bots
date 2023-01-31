import { createReference } from '@medplum/core';
import { DiagnosticReport, Observation, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './finalize-report';

const contentType = 'application/fhir+json';

test('Success', async () => {
  const medplum = new MockClient();
  //Create the Patient
  const patient: Patient = await medplum.createResource({
    resourceType: 'Patient',
    name: [
      {
        family: 'Smith',
        given: ['John'],
      },
    ],
  });

  // Create an observation
  const observation: Observation = await medplum.createResource({
    resourceType: 'Observation',
    status: 'preliminary',
    subject: createReference(patient),
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '39156-5',
          display: 'Body Mass Index',
        },
      ],
      text: 'Body Mass Index',
    },
    valueQuantity: {
      value: 24.5,
      unit: 'kg/m2',
      system: 'http://unitsofmeasure.org',
      code: 'kg/m2',
    },
  });

  // Create the Report
  const report: DiagnosticReport = await medplum.createResource({
    resourceType: 'DiagnosticReport',
    status: 'preliminary',
    result: [createReference(observation)],
  });

  // Invoke the Bot
  await handler(medplum, { input: report, contentType, secrets: {} });

  // Check the output by reading from the 'server'
  // We re-read the report from the 'server' because it may have been modified by the Bot
  const checkReport = await medplum.readResource('DiagnosticReport', report.id as string);
  expect(checkReport.status).toBe('final');

  // Read all the Observations referenced by the modified report
  // for (const observationRef of checkReport.result) {
  // }
});
