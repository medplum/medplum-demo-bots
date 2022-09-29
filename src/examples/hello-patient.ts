import { BotEvent, MedplumClient } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;
  const name = patient.name?.[0];
  console.log(`Hello ${name?.given?.[0]} ${name?.family}!`);
  return true;
}
