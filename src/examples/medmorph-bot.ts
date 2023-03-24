import { BotEvent, MedplumClient } from '@medplum/core';
import { Bundle } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Bundle>): Promise<any> {
  // Get all of the answers from the questionnaire response

  console.log(event.input);

  return true;
}
