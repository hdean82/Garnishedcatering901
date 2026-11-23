# Invoice fulfillment: Pickup / Delivery

- Invoice create/edit has a top-level **Pickup or delivery** section.
- Choose Not decided, Pickup, or Delivery.
- For Delivery, enter an optional delivery venue name and choose **Use saved order or customer address** (event address first, customer address second), or **Deliver to a different address**. The saved address is shown explicitly for review.
- A different address is stored only on that invoice. Customer and event addresses are never overwritten.
- If no saved address exists, choose a different address and enter it; saving as Delivery with neither is blocked.
- Delivery fee remains an independently priced invoice line, not inferred from the fulfillment choice. Selecting Delivery does not automatically bill the customer.
- Both authenticated team previews and the printable invoice show the selected destination. The client portal Edge Function uses the customer/event linkage to resolve the destination for that client's own invoices.
- The create_garnished_invoice_with_items transactional RPC was updated in the live Garnished database to validate and write fulfillment fields atomically with invoice creation. Existing authentication and item validation were preserved.
- Existing invoices remain Not decided until deliberately edited. No existing customer address, delivery address or pricing has been backfilled or guessed.
- A physical Safari/browser test of selecting customer, changing delivery, saving a draft and printing has not been performed. Run one fictional end-to-end test before relying on it.

## Wilson Air — November 26, 2026
Two separate Thanksgiving Dinner events are now recorded at 11:00 AM and 4:00 PM America/Chicago. Both belong to David Peacock / Wilson Air. The combined $600 invoice GFC2025 remains linked to the first event, and the second event refers to the same invoice; no new invoice was created. Delivery location for each is unconfirmed, and customer billing address is not assumed to be the delivery destination. The invoice status was left unchanged.
