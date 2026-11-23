# Garnished Catering invoice previews, client messages and approvals

## Invoice and quote previews
- Single compact botanical Garnished logo (49px), correctly sized wordmark.
- Four concise columns: Description, Qty, Unit Price, Amount.
- One lightweight divider between food rows, smaller padding.
- Client, dates, fulfillment, totals, and a single **Order Details** section. The editable Order Details field maps to `invoices.notes`.
- Historical `event_service_notes` data is retained in the database and shown in Order Details only when `notes` is empty, so old information is not silently deleted.
- Existing payment terms and payment methods remain separate from Order Details.
- Use **Order details for the customer** when creating or editing a document to include delivery or setup instructions in the customer portal and its PDF. The existing Order Details field is still populated from the inquiry and is excluded from the portal.
- Deploy this change in order. Apply the `garnished_customer_order_details` migration, deploy the `garnished-client-portal-data` Edge Function using its existing settings, then release the website.
- The same template supports PDF print and team preview, including the quote/invoice distinction.

## Customer portal and email access
- Existing client portal: `https://garnishedcatering.com/?client=1`.
- Invoices and quotes marked customer-visible are displayed only to clients with `garnished_client_access` to the matching customer.
- Owner action in the invoice preview or Team Studio → Client reviews: **Email client portal link**. Explicit confirmation is required. Sends an invitation email referencing the shared quote or invoice; the link opens the client's secure portal on the Quotes & Invoices tab.
- No emails are sent merely by creating/editing an invoice, saving a reply, or changing a quote.
- New or pending client invitations follow existing security and spam limits; a pending invitation may require the owner to copy the existing link from Team access.

## Client review
- Client opens quote/invoice, sees an itemized total and can submit a message to the Garnished team.
- Manager/owner sees the message in Studio → Client reviews, can reply without sending email.
- Approval button is available for customer-visible, non-paid quotes or invoices only, and only once business owner has entered terms in **Business Settings → Client approval terms & conditions**.
- Client must check explicit terms acceptance and confirm approval. Backend verifies signed-in and email-verified account ownership, shared invoice/customer association, non-empty live terms, and current invoice status.
- Approval transaction snapshots the document details, line items, payment records and exact terms, along with the user's account email and timestamp. Snapshot remains fixed even if the current invoice is changed later; later edits are not covered by the previous approval.
- Quotes do not count as outstanding invoice balance on client dashboard.
- The user must supply and review their own legal terms before enabling client approval. No legal terms are invented or prefilled.

## Safety and tests
- No real customer invitations, approvals, invoice edits or messages were initiated as part of setup.
- RLS restricts approval history and conversations to authorized clients and Garnished owners/managers. Backend RPC is executable only by authenticated users and checks access before writing.
- Database migration and Edge Functions are deployed; the web UI must be deployed and tested on mobile Safari/desktop with a fictional customer.
- Future: add formal quote-to-invoice revision conversion, email update alerts and version-aware reapproval if desired. These are not part of this first release.
