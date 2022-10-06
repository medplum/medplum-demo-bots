import { BotEvent, MedplumClient } from '@medplum/core';
import Client from 'ssh2-sftp-client';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  console.log('SFTP test');
  let data: any | undefined = undefined;
  try {
    const sftp = new Client();
    await sftp.connect({
      host: 'test.rebex.net',
      username: 'demo',
      password: 'password',
    });
    data = await sftp.list('.');
    console.log('data', data);
  } catch (err) {
    console.log('error', err);
    return false;
  }
  return data;
}
