// Core imports from Medplum package
import {
  BotEvent,
  getCodeBySystem,
  getIdentifier,
  getReferenceString,
  ICD10,
  MedplumClient,
} from '@medplum/core';

// FHIR resource types from Medplum package
import {
  Address,
  Encounter,
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';

// Importing node-fetch for HTTP requests
import fetch from 'node-fetch';

// Candid API Base URL
const CANDID_API_URL = 'https://api-staging.joincandidhealth.com/api/';

/**
 * Main handler function to process the Encounter event.
 * @param medplum - Medplum client instance
 * @param event - The bot event containing the Encounter
 * @returns A promise resolving to the result of the processing
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<any> {
  const encounter = event.input;

  // Validate and retrieve Patient from Encounter
  if (!encounter.subject) {
    throw new Error('Missing Patient');
  }
  const patient: Patient = await medplum.readReference(encounter.subject as Reference<Patient>);

  // Validate and retrieve the service provider Organization
  if (!encounter.serviceProvider) {
    throw new Error('Missing Service Provider');
  }
  const serviceFacility: Organization = await medplum.readReference(encounter.serviceProvider);

  // Validate and retrieve the primary provider from the Encounter participants
  if (!encounter?.participant || encounter.participant.length === 0) {
    throw new Error('Missing provider');
  }
  const providerRef = encounter.participant.find(
      (participant) =>
          participant?.type?.[0] &&
          getCodeBySystem(participant.type[0], 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType') === 'PPRF'
  )?.individual as Reference<Practitioner>;
  const provider: Practitioner = await medplum.readReference(providerRef);

  // Validate and retrieve Coverage information for the Patient
  const coverage = await medplum.searchOne('Coverage', `subscriber=${getReferenceString(patient)}`);
  if (!coverage) {
    throw new Error('Missing Coverage');
  }

  // Construct the Candid CodedEncounter object
  const candidCodedEncounter = {
    // Omitting the external_id key from patient conversion
    patient: convertPatient(patient),
    billing_provider: {
      // Extracting first and last names, address, tax_id, and npi for billing provider
      first_name: provider.name?.[0]?.given?.[0],
      last_name: provider.name?.[0]?.family,
      address: convertAddress(provider.address?.[0]),
      tax_id: getIdentifier(provider, 'http://hl7.org/fhir/sid/us-ssn'),
      npi: getIdentifier(provider, 'http://hl7.org/fhir/sid/us-npi'),
    },
    // Reusing billing provider details for rendering provider
    rendering_provider: {
      first_name: provider.name?.[0]?.given?.[0],
      last_name: provider.name?.[0]?.family,
      address: convertAddress(provider.address?.[0]),
      npi: getIdentifier(provider, 'http://hl7.org/fhir/sid/us-npi'),
    },
    diagnoses: convertDiagnoses(encounter),
    place_of_service_code: '10',
    external_id: getReferenceString(encounter),
    date_of_service: extractDate(encounter.period?.start),
    patient_authorized_release: true,
    benefits_assigned_to_provider: true,
    provider_accepts_assignment: true,
    billable_status: 'BILLABLE',
    responsible_party: 'INSURANCE_PAY',
    // Additional optional fields for the Encounter object
    end_date_of_service: extractDate(encounter.period?.end),
    appointment_type: encounter.type?.[0]?.coding?.[0]?.display || null,
    service_facility: {
      organization_name: serviceFacility.name,
      address: convertAddress(serviceFacility.address?.[0]),
    },
    pay_to_address: convertAddress(serviceFacility.address?.[0]),
    synchronicity: 'Synchronous',
  };

  // Submit the encounter data to Candid and log the response
  const result = await submitCandidEncounter(
      candidCodedEncounter,
      event.secrets['CANDID_API_KEY'].valueString as string,
      event.secrets['CANDID_API_SECRET'].valueString as string
  );

  console.log('Received Response from Candid:\n', JSON.stringify(result, null, 2));
  return result;
}

/**
 * Authenticates into the Candid Health API using API key and API secret, and posts the CodedEncounter object to
 * Candid's /v1/coded_encounters endpoint
 * @param candidCodedEncounter - A JS representation of the CodedEncounter object
 * @param apiKey - Candid Health API Key
 * @param apiSecret - Candid Health API Secret
 * @returns The Candid Health API response
 */
async function submitCandidEncounter(candidCodedEncounter: any, apiKey: string, apiSecret: string): Promise<any> {
  // Get a Bearer Token
  const authResponse = await fetch(CANDID_API_URL + 'auth/v2/token', {
    method: 'post',
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
    }),
    headers: { 'Content-Type': 'application/json' },
  });

  const bearerToken = ((await authResponse.json()) as any).access_token;

  // Send the CodedEncounter
  const encounterResponse = await fetch(CANDID_API_URL + 'encounters/v4', {
    method: 'post',
    body: JSON.stringify(candidCodedEncounter),
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${bearerToken}` },
  });

  const candidEncounterResult = await encounterResponse.json();
  return candidEncounterResult;
}

/**
 * Converts a FHIR patient to a Candid Health patient
 * @param patient - The FHIR patient.
 * @returns The Candid Health patient.
 */
function convertPatient(patient: Patient | undefined): any {
  if (!patient) {
    return undefined;
  }

  return {
    first_name: patient.name?.[0]?.given?.[0],
    last_name: patient.name?.[0]?.family,
    gender: convertGender(patient.gender),
    external_id: getReferenceString(patient),
    date_of_birth: patient.birthDate,
    address: convertAddress(patient.address?.[0]),
  };
}

// Read the diagnosis from the Encounter.reasonCode field.
// Assume that the diagnosis is represented as a Cove
function convertDiagnoses(encounter: Encounter): any[] {
  const result: any[] = [];

  if (!encounter.reasonCode) {
    return result;
  }

  for (const reason of encounter.reasonCode) {
    const code = reason.coding?.find((c) => c.system === ICD10);
    if (code) {
      result.push({
        code_type: 'ABK',
        code: code.code,
        name: code.display || '',
      });
    }
  }
  return result;
}

/* Data Type Conversions */

function convertAddress(address: Address | undefined): object | undefined {
  if (!address) {
    return undefined;
  }
  return {
    address1: address?.line?.[0],
    address2: address?.line?.[1] || '',
    city: address?.city,
    state: address?.state,
    zip_code: address?.postalCode?.split('-')?.[0],
    zip_plus_four_code: address?.postalCode?.split('-')?.[1],
  };
}

function convertGender(fhirGender: Patient['gender'] | undefined): string {
  if (!fhirGender) {
    return 'not_given';
  }
  return fhirGender;
}

// Extract the date part of an ISO formatted date string
function extractDate(date: string | undefined): string | undefined {
  if (!date) {
    return undefined;
  }
  return date.split('T')[0];
}