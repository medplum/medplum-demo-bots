import { BotEvent, createReference, MedplumClient } from '@medplum/core';
import { Account, Invoice } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<Record<string, any>>): Promise<any> {
  const input = event.input;
  const id = input['object']['id'];

  if (!id) {
    console.log('No obhect id found');
    return false;
  }

  const objectType = input['object']['object'];

  if (objectType != 'invoice') {
    console.log('Not an invoice');
    return false;
  }

  const stripeInvoiceStatus = input['status'];
  const stripeInvoiceObject = input['object'];
  const stripeInvoiceNote = [
    {
      id: 'hosted_invoice_url',
      text: 'This invoice was created by Stripe [invoice](' + stripeInvoiceObject['hosted_invoice_url'] + ')',
    },
    {
      id: 'invoice_pdf',
      text: 'Stripe invoice PDF [invoice](' + stripeInvoiceObject['invoice_pdf'] + ')',
    },
  ];

  // Attempt to find the invoice if it already exists

  let invoice = (await medplum.searchOne('Invoice', 'identifier=' + id)) as Invoice;

  if (!invoice) {
    invoice = await medplum.createResource({
      resourceType: 'Invoice',
      identifier: [
        // Create Stripe Invoice Identifier
        {
          system: 'https://stripe.com/invoice/id',
          value: id,
        },
      ],
      status: getInvoiceStatus(stripeInvoiceStatus),
      issued: new Date().toISOString(),
      totalGross: {
        value: stripeInvoiceObject['amount_due'] / 100,
        currency: stripeInvoiceObject['currency'],
      },
      totalNet: {
        value: stripeInvoiceObject['amount_paid'] / 100,
        currency: stripeInvoiceObject['currency'].toUpperCase(),
      },
      note: stripeInvoiceNote,
      lineItem: stripeInvoiceObject.lines.data.map((line) => {
        return {
          sequence: line.id,
          priceComponent: [
            {
              code: 'base',
              factor: line.quantity,
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
  }

  const accountId = stripeInvoiceObject['customer'];
  const account = (await medplum.searchOne('Account', 'identifier=' + accountId)) as Account;

  //If there is an account in the system with that identifier, link the invoice to the account
  if (account) {
    invoice.account = createReference(account);
    await medplum.updateResource(invoice);
  }

  return true;
}

enum InvoiceStatus {
  Draft = 'draft',
  Balanced = 'balanced',
  Issued = 'issued',
  Cancelled = 'cancelled',
}

function getInvoiceStatus(input: string): InvoiceStatus {
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
