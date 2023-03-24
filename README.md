# CDC Medpmorph

This repository shows reference material related to CDC Electronic Case Reporting (eCR) for cancer registry. The reference material uses [Medplum Bots](https://www.medplum.com/docs/bots/bot-basics) to synchronize the FHIR resource bundles to the registry.

## Setup

To set up your bot deployment you will need to do the following:

- [Create a Bot](https://app.medplum.com/admin/project) on Medplum, call it `medmorph-bot` and note its `id`. (All Bots in your account can be found [here](https://app.medplum.com/Bot))
- With the `id` of the Bot `id` in hand, add a section to `medplum.config.json` like so

```json
{
  "name": "medmorph-bot",
  "id": "aa3a0383-a97b-4172-b65d-430f6241646f",
  "source": "src/examples/medmorph-bot.ts",
  "dist": "dist/medmorph-bot.js"
}
```

- [Create an ClientApplication](https://app.medplum.com/ClientApplication/new) on Medplum. (All ClientApplications in your account can be found [here](https://app.medplum.com/ClientApplication))
- Create a .env file locally by copying `.env.example` and put the `ClientId` and `ClientSecret` from the `ClientApplication` into the file.
- (Optional) Create an [AccessPolicy](https://app.medplum.com/AccessPolicy) on Medplum that can only read/write Bots and add it to the Bot in the [admin panel](https://app.medplum.com/admin/project).

## Installation

To run and deploy your Bot do the following steps:

Install:

```bash
npm i
```

Build:

```bash
npm run build
```

Test:

```bash
npm t
```

Deploy medmorph bot:

```bash
npx medplum deploy-bot medmorph-bot
```

You will see the following in your command prompt if all goes well:

```bash
Update bot code.....
Success! New bot version: 7fcbc375-4192-471c-b874-b3f0d4676226
Deploying bot...
Deploy result: All OK
```

## Setting up your Subscription

Once your bot is in place, you'll want to set up a subscription so that each new FHIR Bundle that is created gets validated and sent to the correct system. Create a [Subscription](https://app.medplum.com/Subscription/new) in the Medplum app and name it `medmorph-bundle`.

TODO: Complete this section

## Importing Bundles

## Sending Data to the Registry

## Related Reading

- [MedMorph Data Flow](https://build.fhir.org/ig/HL7/fhir-medmorph/usecases.html#interactions-between-medmorph-actors-and-systems) Diagram, this repo represents the Data Health Exchange App
- [MedMorph Specification Bundle](https://build.fhir.org/ig/HL7/fhir-medmorph/StructureDefinition-us-ph-specification-bundle.html)
