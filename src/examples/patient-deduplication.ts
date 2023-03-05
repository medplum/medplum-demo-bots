import { BotEvent, getDisplayString, getReferenceString, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  //This bot should only be triggered by a Patient resource Subscription only
  const patient = event.input as Patient;
  if (patient.resourceType !== 'Patient') {
    throw new Error('Unexpected input. Expected Patient.');
  }

  const identifier = patient.identifier?.[0].value?.toString();

  const existingPatient = await medplum.searchOne('Patient', 'identifier=' + identifier);

  if (existingPatient) {
    const firstName = patient.name?.[0].given?.[0].toString();
    const lastName = patient.name?.[0].family?.toString();
    const birthDate = patient.birthDate?.toString();

    if (
      firstName === existingPatient.name?.[0].given?.[0].toString() &&
      lastName === existingPatient.name?.[0].family?.toString() &&
      birthDate === existingPatient.birthDate?.toString()
    ) {
      existingPatient.link = [
        {
          type: 'replaces',
          other: {
            reference: getReferenceString(patient),
            display: getDisplayString(patient),
          },
        },
      ];

      //Save the linkage to the existing patient
      medplum.updateResource(existingPatient);

      //Mark the new patient as inactive
      patient.active = false;
      medplum.updateResource(patient);
    } else {
      // This case is only an identifier collision, so this should be handled manually
      console.log('Warning: Potential duplicate identifiers found, alert operator.');
      // Mark the new patient as active to ensure it is not deleted or merged accidentally
      patient.active = true;
      medplum.updateResource(patient);
    }
  }
  return true;
}
