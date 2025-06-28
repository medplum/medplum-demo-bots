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
  Coverage,
  CoverageClass,
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
  const coverage = await medplum.searchOne('Coverage', `beneficiary=${getReferenceString(patient)}`);
  if (!coverage) {
    throw new Error('Missing Coverage');
  }

  // Construct the Candid CodedEncounter object
  const { external_id: individual_id, ...subscriber } = convertPatient(patient);
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
    subscriber_primary: {
      ...subscriber,
      individual_id: individual_id,
      // '18' - 'Self' (see Candid Health API docs)
      patient_relationship_to_subscriber_code: '18',
      insurance_card: convertInsuranceCard(coverage),
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

function convertInsuranceCard(coverage: Coverage | undefined): object | undefined {
  if (!coverage) {
    return undefined;
  }
  return {
    insurance_card_id: '',
    member_id: coverage.identifier?.[0]?.value,
    payer_name: 'string',
    payer_id: '00019',
    rx_bin: findCoverageClass(coverage, 'rxbin')?.value,
    rx_pcn: findCoverageClass(coverage, 'rxpcn')?.value,
    image_url_front: 'string',
    image_url_back: 'string',
    group_number: findCoverageClass(coverage, 'group')?.value,
    plan_name: findCoverageClass(coverage, 'group')?.name,
    plan_type: convertCoverageType(coverage.type),
  };
}

// https://www.nahdo.org/sites/default/files/2020-12/SourceofPaymentTypologyVersion9_2%20-Dec%2011_2020_Final2.pdf
// https://build.fhir.org/ig/HL7/US-Core/Coverage-coverage-example.json.html

// Convert the Coverage.type field to the Candid Health Source of Payment code
// Assume the that coverage is the in the standard [NAHDO Source of Payment Typology](https://www.nahdo.org/sopt)
function convertCoverageType(coverageType: Coverage['type'] | undefined): string {
  if (!coverageType) {
    return 'not_given';
  }
  const code = getCodeBySystem(coverageType, 'https://nahdo.org/sopt');
  if (!code) {
    return 'not_given';
  }

  // Self-pay
  if (code === '81') {
    return '09';
  }
  // 11 - Other Non-Federal Programs

  // 12 - Preferred Provider Organization (PPO)
  if (code === '512') {
    return '12';
  }
  // 13 - Point of Service (POS)
  if (code === '513') {
    return '13';
  }
  // 14 - Exclusive Provider Organization (EPO)
  // 15 - Indemnity Insurance
  if (code.startsWith('52') || code.startsWith('53')) {
    return '15';
  }

  // 16 - Health Maintenance Organization (HMO) Medicare Risk
  if (code === '111') {
    return '16';
  }

  // 17 - Dental Maintenance Organization
  if (['561', '517'].includes(code)) {
    return '17';
  }

  // AM - Automobile Medical
  if (code === '96') {
    return '13';
  }

  // BL - Blue Cross/Blue Shield
  if (code.startsWith('6')) {
    return 'BL';
  }

  // CH - CHAMPUS
  if (code.startsWith('311')) {
    return 'CH';
  }

  // CI - Commercial Insurance Co.

  // DS - Disability
  if (code === '93') {
    return 'DS';
  }

  // FI - Federal Employees Program
  if (code === '391') {
    return 'FI';
  }

  // HM - Health Maintenance Organization (HMO)
  if (code === '511') {
    return 'HM';
  }

  // LM - Liability Medical
  if (code === '97') {
    return 'LM';
  }

  // MA - Medicare Part A

  // MB - Medicare Part B

  // MC - Medicaid
  if (code.startsWith('2')) {
    return 'MC';
  }

  // OF - Other Federal Program

  // TV - Title V
  if (code === '341') {
    return 'MC';
  }

  // VA - Veterans Affairs Plan
  if (code.startsWith('32')) {
    return 'VA';
  }

  // WC - Workers' Compensation Health Claim
  if (code.startsWith('95')) {
    return 'VA';
  }

  // ZZ - Mutually Defined
  return 'not_given';
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

// Find the first value of a Coverage's classification with a given class type
// The Coverage.class field contains a suite of underwriter specific classifiers, including: group, plan, rxbin, etc.
function findCoverageClass(coverage: Coverage, type: string): CoverageClass | undefined {
  return coverage.class?.find(
      (klass) =>
          klass.type && getCodeBySystem(klass.type, 'http://terminology.hl7.org/CodeSystem/coverage-class') === type
  );
}