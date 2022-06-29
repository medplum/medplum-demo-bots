import { BotEvent, MedplumClient, createReference, getDisplayString } from '@medplum/core';
import { AccessPolicy, DiagnosticReport, Observation, Patient, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;

  //Create access policy for patient
  const patientAccessPolicy = await medplum.createResource<AccessPolicy>({
    resourceType: 'AccessPolicy',
    name: 'Example Access Policy',
    compartment: {
      reference: createReference(patient).reference,
      display: getDisplayString(patient) + ' Access Policy',
    },
  });

  //Create a practitioner if if isn't already created
  const practitioner = await medplum.createResourceIfNoneExist<Practitioner>(
    {
      resourceType: 'Practitioner',
      name: [
        {
          given: ['Alice'],
          family: 'Smith',
        },
      ],
      photo: [
        {
          contentType: 'image/png',
          url: 'https://docs.medplum.com/img/cdc-femaledoc.png',
        },
      ],
    },
    'Practitioner/123'
  );

  patient.generalPractitioner = [createReference(practitioner)];
  medplum.updateResource(patient);

  //Create a schedule for the practitioner
  const schedule = await medplum.createResourceIfNoneExist<Schedule>(
    {
      resourceType: 'Schedule',
      id: '123',
      actor: [
        {
          reference: createReference(practitioner).reference,
          display: getDisplayString(practitioner),
        },
      ],
    },
    'Schedule/123'
  );

  //Populate the schedule with slots
  const result: Slot[] = [];
  const slotDate = new Date();
  for (let day = 0; day < 60; day++) {
    for (const hour of [9, 10, 11, 13, 14, 15]) {
      slotDate.setHours(hour, 0, 0, 0);
      const slot = await medplum.createResourceIfNoneExist<Slot>(
        {
          resourceType: 'Slot',
          id: `slot-${day}-${hour}`,
          start: slotDate.toISOString(),
          schedule: createReference(schedule),
        },
        'Slot/slot-' + day + '-' + hour
      );
      result.push(slot);
    }
    slotDate.setDate(slotDate.getDate() + 1);
  }

  //Create observations for DiagnosticReport
  const observation1 = await medplum.createResource<Observation>({
    resourceType: 'Observation',
    subject: {
      reference: createReference(patient).reference,
      display: getDisplayString(patient),
    },
    code: {
      text: 'Hemoglobin A1c',
    },
    valueQuantity: {
      value: 5.4,
      unit: 'mmol/L',
    },
    referenceRange: [
      {
        high: {
          value: 7.0,
        },
      },
    ],
  });

  //Create observations for DiagnosticReport
  const observation2 = await medplum.createResource<Observation>({
    resourceType: 'Observation',
    subject: {
      reference: createReference(patient).reference,
      display: getDisplayString(patient),
    },
    code: {
      text: 'LDL',
    },
    valueQuantity: {
      value: 99,
      unit: 'mg/dL',
    },
    referenceRange: [
      {
        high: {
          value: 100,
        },
      },
    ],
  });
  //Create a diagnostic report for the patient
  const diagnosticReport = await medplum.createResource<DiagnosticReport>({
    resourceType: 'DiagnosticReport',
    subject: {
      reference: createReference(patient).reference,
      display: getDisplayString(patient),
    },
    resultsInterpreter: [
      {
        reference: createReference(practitioner).reference,
        display: getDisplayString(practitioner),
      },
    ],
    result: [
      { reference: createReference(observation1).reference },
      { reference: createReference(observation2).reference },
    ],
  });

  return true;
}
