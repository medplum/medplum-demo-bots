import { BotEvent, MedplumClient, createReference, getDisplayString } from '@medplum/core';
import {
  CarePlan,
  DiagnosticReport,
  Immunization,
  Communication,
  MedicationRequest,
  Observation,
  Patient,
  Practitioner,
  Reference,
  Schedule,
  Slot
} from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
  const patient = event.input as Patient;

  const date = new Date();

  const getPreviousDay = (date = new Date()): Date => {
    const previous = new Date(date.getTime());
    previous.setDate(date.getDate() - 1);

    return previous;
  };

  const subject: Reference<Patient> = {
    reference: createReference(patient).reference,
    display: getDisplayString(patient),
  };

  //Create a practitioner if if isn't already created
  const practitioner = await medplum.createResourceIfNoneExist<Practitioner>(
      {
        resourceType: 'Practitioner',
        id: 'practitioner',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
        photo: [
          {
            contentType: 'image/png',
            url: 'https://docs.medplum.com/img/cdc-femaledoc.png',
          },
        ],
      },
      'Practitioner/practitioner'
  );

  patient.generalPractitioner = [createReference(practitioner)];
  await medplum.updateResource(patient);

  //Create a schedule for the practitioner
  const schedule = await medplum.createResourceIfNoneExist<Schedule>(
      {
        resourceType: 'Schedule',
        id: 'schedule',
        actor: [
          {
            reference: createReference(practitioner).reference,
            display: getDisplayString(practitioner),
          },
        ],
      },
      'Schedule/schedule'
  );

  //Populate the schedule with slots
  const slots: Slot[] = [];
  const slotDate = new Date();
  for (let day = 0; day < 60; day++) {
    for (const hour of [9, 10, 11, 13, 14, 15]) {
      slotDate.setHours(hour, 0, 0, 0);
      const slot = await medplum.createResourceIfNoneExist<Slot>(
          {
            resourceType: 'Slot',
            id: `slot-${day}-${hour}`,
            start: slotDate.toISOString(),
            schedule: createReference(schedule),
          },
          'Slot/slot-' + day + '-' + hour
      );
      slots.push(slot);
    }
    slotDate.setDate(date.getDate() + 1);
  }

  //Create observations for DiagnosticReport if not exits
  const hemoglobinA1c = await medplum.createResourceIfNoneExist<Observation>(
      {
        resourceType: 'Observation',
        id: 'hemoglobinA1c',
        subject,
        code: {
          text: 'Hemoglobin A1c',
        },
        valueQuantity: {
          value: 5.4,
          unit: 'mmol/L',
        },
        referenceRange: [
          {
            high: {
              value: 7.0,
            },
          },
        ],
      },
      `Observation/hemoglobinA1c`
  );

  //All of these resources are created in the same transaction if they don't exist

  //Add CarePlan - create 2, 1 active and one completed
  const activeCarePlan = await medplum.createResourceIfNoneExist<CarePlan>(
      {
        resourceType: 'CarePlan',
        status: 'active',
        intent: 'order',
        id: 'active-care-plan',
        activity: [
          {
            detail: {
              code: {
                text: 'Antenatal education',
              },
              location: {
                display: 'FOOMEDICAL HOSPITAL AND MEDICAL CENTERS'
              },
              status: 'in-progress'
            }
          },
        ],
        title: 'Routine antenatal care',
        period: {
          start: date.toISOString(),
        },
        category: [
          {
            text: 'Routine antenatal care',
          }
        ],
        subject,
      },
      'CarePlan/active-care-plan'
  );

  const completedCarePlan = await medplum.createResourceIfNoneExist<CarePlan>(
      {
        resourceType: 'CarePlan',
        status: 'completed',
        intent: 'order',
        id: 'completed-care-plan',
        activity: [
          {
            detail: {
              code: {
                text: 'Recommendation to avoid exercise',
              },
              location: {
                display: 'FOOMEDICAL HOSPITAL AND MEDICAL CENTERS'
              },
              status: 'completed'
            }
          },
        ],
        title: 'Respiratory therapy',
        period: {
          start: getPreviousDay().toISOString(),
          end: date.toISOString(),
        },
        category: [
          {
            text: 'Respiratory therapy',
          }
        ],
        subject,
      },
      'CarePlan/completed-care-plan'
  );

  //Add Task and assign to patient

  //Add DiagnosticReport with Observations (Lab Result)
  const diagnosticReport = await medplum.createResourceIfNoneExist<DiagnosticReport>(
      {
        resourceType: 'DiagnosticReport',
        status: 'final',
        id: 'diagnostic-report',
        code: {
          text: 'Hemoglobin A1c',
        },
        subject,
        result: [
          {
            reference: createReference(hemoglobinA1c).reference,
            display: getDisplayString(hemoglobinA1c),
          }
        ]
      },
      'DiagnosticReport/diagnostic-report'
  );

  //Add Medications
  const activeMedication = await medplum.createResourceIfNoneExist<MedicationRequest>(
      {
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        priority: 'routine',
        id: 'active-medication',
        subject,
        requester: {
          reference: createReference(practitioner).reference,
          display: getDisplayString(practitioner),
        },
        dosageInstruction: [
          {
            text: 'Every six hours (qualifier value)\\n',
            sequence: 1,
            timing: {
              repeat: {
                frequency: 4,
                period: 1,
                periodUnit: 'd',
              }
            }
          },
        ],
        authoredOn: date.toISOString(),
        medicationCodeableConcept: {
          text: '72 HR Fentanyl 0.025 MG/HR Transdermal System',
        },
      },
      'MedicationRequest/123'
  );

  const stoppedMedication = await medplum.createResourceIfNoneExist<MedicationRequest>(
      {
        resourceType: 'MedicationRequest',
        status: 'stopped',
        intent: 'order',
        priority: 'routine',
        id: 'stopped-medication',
        subject,
        requester: {
          reference: createReference(practitioner).reference,
          display: getDisplayString(practitioner),
        },
        dosageInstruction: [
          {
            text: 'Every seventy two hours as needed (qualifier value)\\n',
            sequence: 1,
            timing: {
              repeat: {
                frequency: 1,
                period: 3,
                periodUnit: 'd',
              }
            }
          },
        ],
        authoredOn: date.toISOString(),
        medicationCodeableConcept: {
          text: 'Acetaminophen 325 MG / Oxycodone Hydrochloride 10 MG Oral Tablet [Percocet]',
        },
      },
      'MedicationRequest/stopped-medication'
  );

  //Add Immunizations
  const completedImmunization = await medplum.createResourceIfNoneExist<Immunization>(
      {
        resourceType: 'Immunization',
        status: 'completed',
        id: 'completed-immunization',
        patient: subject,
        location: {
          display: 'FOOMEDICAL HOSPITAL AND MEDICAL CENTERS'
        },
        occurrenceDateTime: date.toISOString(),
        vaccineCode: {
          text: 'SARS-COV-2 (COVID-19) vaccine, mRNA, spike protein, LNP, preservative free, 100 mcg/0.5mL dose',
        },
      },
      'Immunization/completed-immunization'
  );

  const notDoneImmunization = await medplum.createResourceIfNoneExist<Immunization>(
      {
        resourceType: 'Immunization',
        status: 'not-done',
        id: 'not-done-immunization',
        patient: subject,
        location: {
          display: 'FOOMEDICAL HOSPITAL AND MEDICAL CENTERS'
        },
        vaccineCode: {
          text: 'Influenza, seasonal, injectable, preservative free',
        },
      },
      'Immunization/not-done-immunization'
  );

  //Add Vitals - Blood Pressure, height, weight, respiratory rate, temperature, etc.
  const bloodPressure = await medplum.createResourceIfNoneExist<Observation>(
      {
        resourceType: 'Observation',
        id: 'blood-pressure',
        subject,
        code: {
          coding: [
            {
              code: '85354-9',
              display: 'Blood Pressure',
              system: 'http://loinc.org',
            },
          ],
          text: 'Blood Pressure',
        },
        component: [
          {
            code: {
              coding: [
                {
                  code: '8462-4',
                  display: 'Diastolic Blood Pressure',
                  system: 'http://loinc.org',
                },
              ],
              text: 'Diastolic Blood Pressure',
            },
            valueQuantity: {
              code: 'mm[Hg]',
              system: 'http://unitsofmeasure.org',
              unit: 'mm[Hg]',
              value: 80,
            },
          },
          {
            code: {
              coding: [
                {
                  code: '8480-6',
                  display: 'Systolic Blood Pressure',
                  system: 'http://loinc.org',
                },
              ],
              text: 'Systolic Blood Pressure',
            },
            valueQuantity: {
              code: 'mm[Hg]',
              system: 'http://unitsofmeasure.org',
              unit: 'mm[Hg]',
              value: 120,
            },
          },
        ],
        effectiveDateTime: date.toISOString(),
        status: 'final',
      },
      'Observation/blood-pressure'
  );

  const bodyTemperature = await medplum.createResourceIfNoneExist<Observation>(
      {
        resourceType: 'Observation',
        id: 'body-temperature',
        subject,
        code: {
          coding: [
            {
              code: '8310-5',
              display: 'Body temperature',
              system: 'http://loinc.org',
            },
            {
              code: '8331-1',
              display: 'Oral temperature',
              system: 'http://loinc.org',
            },
          ],
          text: 'Body temperature',
        },
        valueQuantity: {
          code: 'Cel',
          system: 'http://unitsofmeasure.org',
          unit: 'Cel',
          value: 36.6,
        },
        effectiveDateTime: date.toISOString(),
        status: 'final',
      },
      'Observation/body-temperature'
  );

  const height = await medplum.createResourceIfNoneExist<Observation>(
      {
        resourceType: 'Observation',
        id: 'height',
        subject,
        code: {
          coding: [
            {
              code: '8302-2',
              display: 'Body Height',
              system: 'http://loinc.org',
            },
          ],
          text: 'Body Height',
        },
        valueQuantity: {
          code: 'cm',
          system: 'http://unitsofmeasure.org',
          unit: 'cm',
          value: 175,
        },
        effectiveDateTime: date.toISOString(),
        status: 'final',
      },
      'Observation/height'
  );

  const respiratoryRate = await medplum.createResourceIfNoneExist<Observation>(
      {
        resourceType: 'Observation',
        id: 'respiratory-rate',
        subject,
        code: {
          coding: [
            {
              code: '9279-1',
              display: 'Respiratory rate',
              system: 'http://loinc.org',
            },
          ],
          text: 'Respiratory rate',
        },
        valueQuantity: {
          code: '/min',
          system: 'http://unitsofmeasure.org',
          unit: '/min',
          value: 15,
        },
        effectiveDateTime: date.toISOString(),
        status: 'final',
      },
      'Observation/respiratory-rate'
  );

  const heartRate = await medplum.createResourceIfNoneExist<Observation>(
      {
        resourceType: 'Observation',
        id: 'heart-rate',
        subject,
        code: {
          coding: [
            {
              code: '8867-4',
              display: 'Heart rate',
              system: 'http://loinc.org',
            },
          ],
          text: 'Heart rate',
        },
        valueQuantity: {
          code: '/min',
          system: 'http://unitsofmeasure.org',
          unit: '/min',
          value: 80,
        },
        effectiveDateTime: date.toISOString(),
        status: 'final',
      },
      'Observation/heart-rate'
  );

  const weight = await medplum.createResourceIfNoneExist<Observation>(
      {
        resourceType: 'Observation',
        id: 'weight',
        subject,
        code: {
          coding: [
            {
              code: '29463-7',
              display: 'Body Weight',
              system: 'http://loinc.org',
            },
          ],
          text: 'Body Weight',
        },
        valueQuantity: {
          code: 'kg',
          system: 'http://unitsofmeasure.org',
          unit: 'kg',
          value: 70,
        },
        effectiveDateTime: date.toISOString(),
        status: 'final',
      },
      'Observation/weight'
  );

  //Make a default message "Hello and welcome to our practice"
  const message = await medplum.createResourceIfNoneExist<Communication>(
      {
        resourceType: 'Communication',
        id: 'welcome-message',
        subject,
        sender: subject,
        payload: [
          {
            contentString: 'Hello and welcome to our practice',
          },
        ],
      },
      'Communication/welcome-message'
  );

  return {
    patient,
    practitioner,
    schedule,
    slots,
    hemoglobinA1c,
    activeCarePlan,
    completedCarePlan,
    diagnosticReport,
    activeMedication,
    stoppedMedication,
    completedImmunization,
    notDoneImmunization,
    bloodPressure,
    bodyTemperature,
    height,
    respiratoryRate,
    heartRate,
    weight,
    message
  };
}
