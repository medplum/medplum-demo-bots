import { BotEvent, createReference, MedplumClient } from '@medplum/core';
import { Coverage, Organization, Patient, Reference } from '@medplum/fhirtypes';
import fetch from 'node-fetch';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  // Because this bot is triggered by a subscription, the resource that comes in is a Coverage object
  const coverage = event.input as Coverage;
  const patient = await medplum.readReference(coverage.subscriber as Reference<Patient>);
  const organization = await medplum.readReference(coverage.payor?.[0] as Reference<Organization>);

  if (!coverage) {
    console.log('No coverage object found');
    return true;
  }

  if (!patient) {
    console.log('No patient found');
    return true;
  }

  if (!organization) {
    console.log('No payor found');
    return true;
  }

  const providerNpi = '1235137563'; // Surprised this is an NPI and not some kind of org identifier
  const serviceTypes = ['health_benefit_plan_coverage'];
  const opkitKey = '<opkit-api-key>';

  const opkitRequest = {
    provider_npi: providerNpi,
    payer_id: organization.identifier?.find(
      (identifier) => identifier.system === 'https://docs.opkit.co/reference/getpayers'
    )?.value,
    subscriber: {
      first_name: patient.name?.[0]?.given?.[0],
      last_name: patient.name?.[0]?.family,
      member_id: coverage.subscriberId,
      date_of_birth: patient.birthDate,
      email: 'test@opkit.co',
    },
    services: serviceTypes,
  };
  console.log(JSON.stringify(opkitRequest, null, 2));

  const result = await fetch('https://api.opkit.co/v1/eligibility_inquiries', {
    method: 'POST',
    body: JSON.stringify(opkitRequest),
    headers: {
      Authorization: 'Basic ' + opkitKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }).then((response) => response.json());
  console.log(JSON.stringify(result));

  const serviceToCategoryDisplayMap: Record<string, string> = {
    health_benefit_plan_coverage: 'Health Benefit Plan Coverage',
  };

  const serviceToCategoryCodeMap: Record<string, string> = {
    health_benefit_plan_coverage: '30',
  };

  const networkToCode: Record<string, string> = {
    out_of_network: 'out',
    in_network: 'in',
  };

  const generateItem = (opkitResponse: any) => {
    const item: any = [];
    const benefits = opkitResponse.plan.benefits;
    const networkSet = new Set<string>(benefits.map((benefit: any) => benefit.network));
    const unitSet = new Set<string>(benefits.map((benefit: any) => benefit.coverage));
    const categorySet = new Set<string>(benefits.map((benefit: any) => benefit.service as string));

    categorySet.forEach((category: string) => {
      networkSet.forEach((network: string) => {
        unitSet.forEach((unit: string) => {
          const fhirBenefit = [];
          const filteredRemainingDeductible = benefits.find(
            (benefit: any) =>
              benefit.network === network &&
              benefit.service === category &&
              benefit.coverage === unit &&
              benefit.type === 'deductible' &&
              benefit.period === 'remaining'
          );

          const filteredDeductible = benefits.find(
            (benefit: any) =>
              benefit.network === network &&
              benefit.service === category &&
              benefit.coverage === unit &&
              benefit.type === 'deductible' &&
              benefit.period === 'service_year'
          );

          if (filteredDeductible && filteredRemainingDeductible) {
            fhirBenefit.push({
              type: {
                coding: [
                  {
                    code: 'deductible',
                  },
                ],
              },
              allowedMoney: {
                value: filteredDeductible.values[0].value || 0,
                currency: 'USD',
              },
              usedMoney: {
                value: filteredRemainingDeductible.values[0].value || 0,
                currency: 'USD',
              },
            });
          }

          item.push({
            category: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/ex-benefitcategory',
                  code: serviceToCategoryCodeMap[category],
                  display: serviceToCategoryDisplayMap[category],
                },
              ],
            },
            network: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/benefit-network',
                  code: networkToCode[network],
                },
              ],
            },
            unit: {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/benefit-unit',
                  code: unit,
                },
              ],
            },
            benefit: fhirBenefit,
          });
        });
      });
    });

    return item;
  };

  const coverageEligibilityRequest = await medplum.createResource({
    resourceType: 'CoverageEligibilityRequest',
    identifier: [{
        system: 'www.opkit.co/id', //You should choose this
        value: 'opkit-identifier1234' //Ideally something like opkitRequest.subscriber?
    }],
    insurer: createReference(organization),
    patient: createReference(patient),
    insurance: [
      {
        focal: true,
        coverage: createReference(coverage),
        businessArrangement: 'opkit-identifier1234' //If there is some kind of contract number?
      }
    ],
    item: generateItem(result)
  });

  const coverageEligibilityResponse = await medplum.createResource({
    resourceType: 'CoverageEligibilityResponse',
    status: 'active',
    outcome: 'complete',
    purpose: ['validation', 'benefits'],
    request: createReference(coverageEligibilityRequest),
    disposition: 'Policy is currently in-force.', //Won't this come from opkit?
    patient: createReference(patient),
    insurer: createReference(organization),
    insurance: [
      {
        coverage: createReference(coverage),
        inforce: true, //Won't this come from Opkit as well?
        item: generateItem(result),
      },
    ],
  });

  console.log(
    JSON.stringify({
      coverageEligibilityResponse,
    })
  );
}
