import { BotEvent, MedplumClient } from '@medplum/core';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  console.log('Hello world');
  console.log(JSON.stringify(event, undefined, 2));
  return true;
}
