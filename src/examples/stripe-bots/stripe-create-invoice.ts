import { BotEvent, createReference, MedplumClient } from '@medplum/core';
import { Account, Invoice, InvoiceLineItem } from '@medplum/fhirtypes';
import type Stripe from 'stripe';

export async function handler(medplum: MedplumClient, event: BotEvent<Record<string, any>>): Promise<any> {
  const input = event.input;
  const stripeInvoice = input['data']['object'] as Stripe.Invoice | undefined;

  if (stripeInvoice?.object !== 'invoice') {
    console.log('Not an invoice');
    return false;
  }

  const id = stripeInvoice.id;

  if (!id) {
    console.log('No object id found');
    return false;
  }

  const stripeInvoiceStatus = stripeInvoice.status;

  // Attempt to find the invoice if it already exists

  let invoice = (await medplum.searchOne('Invoice', 'identifier=' + id)) as Invoice;

  if (!invoice) {
    console.log('No invoice found, creating new invoice');
    invoice = await medplum.createResource<Invoice>({
      resourceType: 'Invoice',
      identifier: [
        // Create Stripe Invoice Identifier
        {
          system: 'https://stripe.com/invoice/id',
          value: id,
        },
      ],
      status: getInvoiceStatus(stripeInvoiceStatus),
      totalGross: {
        value: stripeInvoice.amount_due / 100,
        currency: stripeInvoice.currency.toUpperCase(),
      },
      totalNet: {
        value: stripeInvoice.amount_paid / 100,
        currency: stripeInvoice.currency.toUpperCase(),
      },
      lineItem: stripeInvoice.lines.data.map((line): InvoiceLineItem => {
        return {
          id: line.id,
          extension: [
            {
              url: 'https://stripe.com/line_item/description',
              valueString: line.description as string,
            },
          ],
          priceComponent: [
            {
              amount: {
                value: line.amount / 100,
                currency: line.currency.toUpperCase(),
              },
            },
          ],
        };
      }),
    });
    console.log('Created invoice');
  } else {
    invoice.status = getInvoiceStatus(stripeInvoiceStatus);
    invoice = await medplum.updateResource(invoice);
  }

  const accountId = stripeInvoice.customer as string;
  const account = (await medplum.searchOne('Account', 'identifier=' + accountId)) as Account;

  //If there is an account in the system with that identifier, link the invoice to the account
  if (account) {
    invoice.account = createReference(account);
    await medplum.updateResource(invoice);
  }

  return true;
}

// These are the standard FHIR invoice statuses
enum InvoiceStatus {
  Draft = 'draft',
  Balanced = 'balanced',
  Issued = 'issued',
  Cancelled = 'cancelled',
}

function getInvoiceStatus(input: Stripe.Invoice.Status | null): InvoiceStatus {
  switch (input) {
    case 'paid':
      return InvoiceStatus.Balanced;
    case 'open':
      return InvoiceStatus.Issued;
    case 'uncollectible':
    case 'void':
      return InvoiceStatus.Cancelled;
    default:
      return InvoiceStatus.Draft;
  }
}
