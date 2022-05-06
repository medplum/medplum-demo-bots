import { MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, input: Resource): Promise<any> {
  console.log('Hello world');
  console.log(JSON.stringify(input, undefined, 2));
}
