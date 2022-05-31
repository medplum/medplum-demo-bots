# Medplum Demo Bots

This repo contains code for [Medplum Bots](https://docs.medplum.com/app/bots). Bots power many of the integrations you see in Medplum apps.  You can view your deployed bots online on the [Medplum App](https://app.medplum.com).

Bots make heavy use of the [Medplum JS Client Library](https://docs.medplum.com/typedoc/core/index.html).

## Setup

To set up your bot deployment you will need to do the following:

* [Create a Bot](https://app.medplum.com/admin/project) on Medplum and note its `id`. (All Bots in your account can be found [here](https://app.medplum.com/Bot))
* Create a new typescript file (e.g. `my-bot.ts`) and copy the contents of `hello-world.ts` into your new file.
* With the `id` of the Bot `id` in hand, add a line to `package.json` in the `scripts` section like so.

```json
"deploy:my-bot": "medplum deploy-bot dist/my-bot.js <bot-id>"
```

* [Create an ClientApplication](https://app.medplum.com/ClientApplication/new) on Medplum. (All ClientApplications in your account can be found [here](https://app.medplum.com/ClientApplication))
* Create a .env file locally by copying `.env.example` and put the `ClientId` and `ClientSecret` from the `ClientApplication` into the file.
* (Optional) Create an [AccessPolicy]((https://app.medplum.com/AccessPolicy)) on Medplum that can only read/write Bots and add it to the Bot in the [admin panel](https://app.medplum.com/admin/project).

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

Deploy one bot:

```bash
npm run deploy:hello-world
```

## Publishing your Bot

Before your bot runs in production you will need to publish it. Publishing only works from the Medplum app.

* Navigate to the [Bots page](https://app.medplum.com/Bot/)
* Go to the `Editor` tab
* Click on the `Publish` button

After a few seconds your bot will be published and run in production.
