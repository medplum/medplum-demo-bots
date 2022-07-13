import { BotEvent, MedplumClient, createReference, getDisplayString } from '@medplum/core';
import { AccessPolicy, DiagnosticReport, Observation, Patient, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;

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

  //Create observations for DiagnosticReport if not exits
  const observation1 = await medplum.createResourceIfNoneExist<Observation>(
    {
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
    },
    'Observation/patient-' + patient.id + '-observation-1'
  );

  //All of these resources are created in the same transaction if they don't exist

  //Add CarePlan - create 2, 1 active and one completed
  //Add Task and assign to patient
  //Add DiagnosticReport with Observations (Lab Result)
  //Add Medications
  //Add Immunizations
  //Add Vitals - Blood Pressure, height, weight, respiratory rate, temperature, etc.
  //Make a default message "Hello and welcome to our practice"

  return true;
}
