/**
 * Calculate the patient's age from birthdate
 * @param birthDate - The patient's birth date string
 * @returns The calculated age
 */import { BotEvent, MedplumClient } from '@medplum/core';
 import { DiagnosticReport, Observation, Patient, RiskAssessment } from '@medplum/fhirtypes';
 import fetch from 'node-fetch';
 
 // Define mapping of test names to LOINC codes and units
 const loincCodeMap: Record<string, { code: string, unit: string }> = {
   'HDL': { code: '2085-9', unit: 'mg/dL' },
   'LDL': { code: '18262-6', unit: 'mg/dL' },
   'CPK': { code: '2157-6', unit: 'U/L' },
   'ΚΡΕΑΤΙΝΙΝΗ': { code: '2160-0', unit: 'mg/dL' }, // Creatinine
   'ΧΟΛΗΣΤΕΡΟΛΗ ΟΛΙΚΗ': { code: '2093-3', unit: 'mg/dL' }, // Total Cholesterol
   'ΛΙΠΟΠΡΩΤΕΙΝΗ-α Lp(a)': { code: '10835-7', unit: 'mg/dL' }, // Lipoprotein a
   'CRP': { code: '1988-5', unit: 'mg/L' }, // C-reactive protein
   '25-ΟΗ ΒΙΤΑΜΙΝΗ D ΟΛΙΚΗ': { code: '35365-6', unit: 'ng/mL' }, // 25-OH Vitamin D Total
   'ΣΑΚΧΑΡΟ': { code: '2339-0', unit: 'mg/dL' }, // Glucose
   'ΤΡΑΝΣΑΜΙΝΑΣΗ (SGPT/ALT)': { code: '1742-6', unit: 'U/L' }, // ALT/SGPT
   'ΓΛΥΚΟΖΥΛΙΩΜΕΝΗ ΑΙΜΟΣΦΑΙΡΙΝΗ HbA1c': { code: '4548-4', unit: '%' }, // HbA1c
   'ΤΡΙΓΛΥΚΕΡΙΔΙΑ': { code: '2571-8', unit: 'mg/dL' }, // Triglycerides
   'ΤΡΑΝΣΑΜΙΝΑΣΗ (SGOT/ AST)': { code: '1920-8', unit: 'U/L' }, // AST/SGOT
   'TSH': { code: '3016-3', unit: 'mIU/L' }, // Thyroid stimulating hormone
   // Default case for any unknown tests
   'unknown': { code: 'unknown', unit: 'unit' }
 };
 
 // Extract LOINC codes from the mapping to create the list of blood test codes we want to handle
 const BLOOD_TEST_CODES = Object.values(loincCodeMap)
   .map(item => item.code)
   .filter(code => code !== 'unknown');
 
 /**
  * Process a single observation and make predictions
  * @param medplum - The Medplum client
  * @param observation - The observation to process
  * @param patient - The patient resource
  * @param age - The calculated patient age
  * @returns Prediction result or error object
  */
 async function processObservation(
   medplum: MedplumClient, 
   observation: Observation, 
   patient: Patient, 
   age: number
 ): Promise<any> {
   // Extract the LOINC code from the observation
   const loincCode = observation.code?.coding?.find(c => c.system === 'http://loinc.org')?.code;
   
   // Check if the LOINC code is in our list of blood test codes
   if (!loincCode || !BLOOD_TEST_CODES.some(code => code === loincCode)) {
     console.log(`LOINC code ${loincCode} is not in the list of monitored blood tests`);
     return {
       skipped: true,
       reason: `LOINC code ${loincCode} is not in the list of monitored blood tests`
     };
   }
   
   // Extract patient reference from the observation
   const patientReference = observation.subject?.reference;
   if (!patientReference) {
     console.log('No patient reference found in observation');
     return {
       error: 'Failed to process observation',
       details: 'No patient reference found in observation'
     };
   }
   
   // Query for all observations of the same type for this patient
   const searchResults = await medplum.search('Observation', {
     patient: patientReference.split('/')[1],
     code: loincCode,
     _sort: '-date'
     // Removed _count to get all observations
   });
   
   const allObservations = searchResults.entry?.map(e => e.resource as Observation) || [];
   
   // Map to lab tests with formatted dates
   const allLabTests = allObservations.map(obs => {
     // Format the date as YYYY-MM-DD
     let formattedDate = '';
     if (obs.effectiveDateTime) {
       // Extract just the date part (YYYY-MM-DD) from the ISO string
       formattedDate = obs.effectiveDateTime.split('T')[0];
     }
     
     return {
       testName: obs.code?.coding?.find(c => c.system === 'http://loinc.org')?.code || '',
       testDate: formattedDate,
       value: obs.valueQuantity?.value || 0,
       unit: obs.valueQuantity?.unit || ''
     };
   });
   
   // Deduplicate by testDate (keeping the first occurrence which would be the most recent due to sort order)
   const dateMap = new Map();
   allLabTests.forEach(test => {
     if (test.testDate && !dateMap.has(test.testDate)) {
       dateMap.set(test.testDate, test);
     }
   });
   
   // Convert back to array and sort by date (newest to oldest)
   const uniqueLabTests = Array.from(dateMap.values());
   uniqueLabTests.sort((a, b) => new Date(b.testDate).getTime() - new Date(a.testDate).getTime());
   
   // Take the 3 most recent tests
   const labTests = uniqueLabTests.slice(0, 3);
   
   // Check if we have at least 3 observations after deduplication
   if (labTests.length < 3) {
     console.log(`Not enough unique observations found. Only ${labTests.length} available after deduplication.`);
     return {
       skipped: true,
       reason: `Not enough unique observations found. Only ${labTests.length} available after deduplication.`
     };
   }
   
   // Sort by date (oldest to newest) for the prediction API
   labTests.sort((a, b) => new Date(a.testDate).getTime() - new Date(b.testDate).getTime());
   
   const requestData = {
     patient: {
       patientId: patient.id || '00000',
       gender: patient.gender || 'unknown',
       age: age
     },
     labTests: labTests
   };
   
   console.log(`Making prediction for ${loincCode}:`);
   console.log(JSON.stringify(requestData, null, 2));
   
   try {
     // Call the prediction API using node-fetch
     const response = await fetch('http://83.212.74.123:8000/predict/', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json'
       },
       body: JSON.stringify(requestData)
     });
     
     if (!response.ok) {
       throw new Error(`API responded with status ${response.status}: ${response.statusText}`);
     }
     
     const responseData = await response.json();
     
     // Parse the response data - response has format:
     // { "predictions": [ { "lab_name": "HDL", "probability": 50.8, "note": "abnormal" } ] }
     let probability = 0.5; // Default value
     
     if (responseData?.predictions && Array.isArray(responseData.predictions) && responseData.predictions.length > 0) {
       // Get the first prediction - there should be only one for this test
       const prediction = responseData.predictions[0];
       
       if (prediction.probability !== undefined) {
         // Get the probability and normalize it
         probability = prediction.probability;
         if (typeof probability === 'string') {
           probability = parseFloat(probability);
         }
         // If probability is on a 0-100 scale, normalize it to 0-1
         if (probability > 1) {
           probability = probability / 100;
         }
       }
       
       console.log(`Extracted probability for ${loincCode}: ${probability} (normalized)`);
     } else {
       console.log(`Warning: No predictions found in response for ${loincCode}. Using default value.`);
     }
     
     // Print the result
     console.log(`Prediction results for ${loincCode}:`);
     console.log(JSON.stringify(responseData, null, 2));
     
     // Return a reformatted prediction object that's easier to work with
     return {
       loincCode,
       prediction: {
         probability: probability,
         rawResponse: responseData
       }
     };
   } catch (error) {
     console.error(`Error making prediction for ${loincCode}:`);
     console.error(error);
 
     let errorMessage = 'Unknown error occurred';
     
     if (error instanceof Error) {
       errorMessage = error.message;
     } else if (typeof error === 'string') {
       errorMessage = error;
     } else if (error && typeof error === 'object' && 'message' in error) {
       errorMessage = String(error.message);
     }
     
     return {
       loincCode,
       error: 'Failed to make prediction',
       details: errorMessage
     };
   }
 }
 
 /**
  * Maps a probability value to a qualitative risk level
  * @param probability - The probability value (0-1)
  * @returns The corresponding risk level
  */
 function mapProbabilityToRiskLevel(probability: number): { code: string; display: string } {
   if (probability < 0.1) {
     return { code: 'negligible', display: 'Negligible' };
   } else if (probability <= 0.5) {
     return { code: 'low', display: 'Low' };
   } else if (probability <= 0.75) {
     return { code: 'moderate', display: 'Moderate' };
   } else {
     return { code: 'high', display: 'High' };
   }
 }
 
 /**
  * Creates a RiskAssessment resource based on prediction results
  * @param medplum - The Medplum client
  * @param diagnosticReport - The diagnostic report
  * @param patient - The patient resource
  * @param predictionResults - Results from all predictions
  * @returns A RiskAssessment resource
  */
 async function createRiskAssessment(
   medplum: MedplumClient,
   diagnosticReport: DiagnosticReport,
   patient: Patient,
   predictionResults: any[]
 ): Promise<RiskAssessment> {
   // Filter out successful predictions (those with a prediction property and no error)
   const validPredictions = predictionResults.filter(
     result => result.prediction && !result.error && !result.skipped
   );
   
   // Get the observations used as basis
   const observationReferences = diagnosticReport.result || [];
   
   // Current date for timestamps
   const currentDate = new Date();
   const formattedDate = currentDate.toISOString();
   
   // Calculate start and end dates for the prediction period (3 months)
   const endDate = new Date(currentDate);
   endDate.setMonth(endDate.getMonth() + 3);
   
   const startDateStr = currentDate.toISOString().split('T')[0];
   const endDateStr = endDate.toISOString().split('T')[0];
   
   // Create prediction elements for the RiskAssessment
   const predictions = validPredictions.map(result => {
     const probability = result.prediction.probability;
     const loincCode = result.loincCode;
     
     // Find the test name from the LOINC code
     let testName = '';
     for (const [key, value] of Object.entries(loincCodeMap)) {
       if (value.code === loincCode) {
         testName = key;
         break;
       }
     }
     
     // Get appropriate risk level
     const riskLevel = mapProbabilityToRiskLevel(probability);
     
     return {
       outcome: {
         coding: [
           {
             system: 'http://loinc.org',
             code: loincCode,
             display: testName
           }
         ],
         text: `Risk of Abnormal ${testName} in Next 3 Months`
       },
       probabilityDecimal: probability,
       qualitativeRisk: {
         coding: [
           {
             system: 'http://terminology.hl7.org/CodeSystem/risk-probability',
             code: riskLevel.code,
             display: riskLevel.display
           }
         ]
       },
       whenPeriod: {
         start: startDateStr,
         end: endDateStr
       },
       rationale: `Based on historical trend analysis of ${testName} values`
     };
   });
   
   // Create note with summary of findings
   const highRiskTests = validPredictions
     .filter(result => result.prediction.probability > 0.5)
     .map(result => {
       // Find the test name from the LOINC code
       for (const [key, value] of Object.entries(loincCodeMap)) {
         if (value.code === result.loincCode) {
           return key;
         }
       }
       return result.loincCode;
     });
   
   let noteText = 'This risk assessment was automatically generated based on machine learning analysis of historical lab values.';
   
   if (highRiskTests.length > 0) {
     noteText += ` The following tests show elevated risk of becoming abnormal: ${highRiskTests.join(', ')}.`;
     
     if (highRiskTests.length > 2) {
       noteText += ' Recommend comprehensive health evaluation.';
     } else {
       noteText += ' Recommend monitoring and lifestyle interventions as appropriate.';
     }
   } else {
     noteText += ' All analyzed tests show low risk of becoming abnormal in the next 3 months.';
   }
   
   // Create the RiskAssessment resource
   const riskAssessment: RiskAssessment = {
     resourceType: 'RiskAssessment',
     status: 'final',
     subject: {
       reference: diagnosticReport.subject?.reference
     },
     encounter: {
       reference: `DiagnosticReport/${diagnosticReport.id}`
     },
     occurrenceDateTime: formattedDate,
     performer: {
       reference: 'Device/lab-prediction-bot',
       display: 'Lab Test Prediction Bot'
     },
     method: {
       coding: [
         {
           system: 'http://terminology.hl7.org/CodeSystem/risk-assessment-method',
           code: 'ASTM-E2552',
           display: 'Machine Learning Prediction'
         }
       ],
       text: 'Time series analysis of lab values using machine learning model'
     },
     basis: observationReferences,
     prediction: predictions,
     note: [
       {
         text: noteText
       }
     ]
   };
   
   // Create the RiskAssessment in the FHIR server
   try {
     const createdRiskAssessment = await medplum.createResource(riskAssessment);
     console.log(`Created RiskAssessment with ID: ${createdRiskAssessment.id}`);
     return createdRiskAssessment;
   } catch (error) {
     console.error('Error creating RiskAssessment:', error);
     // Return the local resource if we couldn't create it
     return riskAssessment;
   }
 }
 function calculateAge(birthDate?: string): number {
   if (!birthDate) {return 0;}
   
   const today = new Date();
   const dob = new Date(birthDate);
   let age = today.getFullYear() - dob.getFullYear();
   const m = today.getMonth() - dob.getMonth();
   if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
     age--;
   }
   return age;
 }
 
 /**
  * Main handler function for the bot
  * @param medplum - The Medplum client
  * @param event - The bot event
  * @returns Array of prediction results
  */
 export async function handler(medplum: MedplumClient, event: BotEvent): Promise<any> {
   // Get the diagnostic report from the event
   const diagnosticReport = event.input as DiagnosticReport;
   
   // Extract patient reference from the diagnostic report
   const patientReference = diagnosticReport.subject?.reference;
   if (!patientReference) {
     console.log('No patient reference found in diagnostic report');
     return {
       error: 'Failed to process diagnostic report',
       details: 'No patient reference found'
     };
   }
   
   // Get patient details
   const patient = await medplum.readReference({ reference: patientReference }) as Patient;
   if (!patient) {
     console.log('Patient not found');
     return {
       error: 'Failed to process diagnostic report',
       details: 'Patient not found'
     };
   }
   
   // Calculate patient age
   const age = calculateAge(patient.birthDate);
   
   // Get all observations referenced in the diagnostic report
   const observationReferences = diagnosticReport.result || [];
   
   if (observationReferences.length === 0) {
     console.log('No observations found in diagnostic report');
     return {
       error: 'Failed to process diagnostic report',
       details: 'No observations found'
     };
   }
   
   console.log(`Processing ${observationReferences.length} observations from diagnostic report ${diagnosticReport.id}`);
   
   // Process each observation in parallel
   const observationPromises = observationReferences.map(async (reference) => {
     try {
       // Get the observation
       const observation = await medplum.readReference({ reference: reference.reference }) as Observation;
       
       if (!observation) {
         return {
           reference: reference.reference,
           error: 'Observation not found'
         };
       }
       
       // Process the observation
       return await processObservation(medplum, observation, patient, age);
     } catch (error) {
       console.error(`Error processing observation ${reference.reference}:`, error);
       
       return {
         reference: reference.reference,
         error: 'Failed to process observation',
         details: error instanceof Error ? error.message : String(error)
       };
     }
   });
   
   // Wait for all observations to be processed
   const results = await Promise.all(observationPromises);
   
   // Create a RiskAssessment resource based on the prediction results
   const riskAssessment = await createRiskAssessment(medplum, diagnosticReport, patient, results);
   
   // Summarize the results
   const summary = {
     diagnosticReportId: diagnosticReport.id,
     patientId: patient.id,
     processedAt: new Date().toISOString(),
     totalObservations: observationReferences.length,
     riskAssessment: {
       id: riskAssessment.id,
       reference: `RiskAssessment/${riskAssessment.id}`
     },
     results: results
   };
   
   console.log('Completed processing diagnostic report');
   console.log(JSON.stringify(summary, null, 2));
   
   return summary;
 }