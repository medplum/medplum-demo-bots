import { BotEvent, MedplumClient } from '@medplum/core';
import fetch from 'node-fetch';
import FormData from 'form-data';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Create the PDF
  const binary = await medplum.createPdf({
    content: ['Hello Medplum'],
  });
  console.log('Binary result', JSON.stringify(binary, null, 2));

  if (!binary.url) {
    throw new Error('Binary is missing');
  }

  // Download the PDF
  const pdfData = await medplum.download(binary.url);
  const pdfStream = await pdfData.stream();

  // Create a multipart form body
  const form = new FormData();
  form.append('otherValue', 'hello medplum');
  form.append('testPdf', pdfStream);

  // Post the form
  const response = await fetch('https://httpbin.org/post', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  // Show the JSON response
  const json = await response.json();
  console.log('response', json);
  return json;
}
