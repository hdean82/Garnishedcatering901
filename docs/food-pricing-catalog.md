# Garnished Catering Food & Pricing Catalog

Users can maintain reusable food, package, beverage, delivery, staffing and service prices in Studio → Business settings → Food & Pricing Catalog.
Owners and managers may create, edit and archive price-list items. Archived items disappear from invoice selectors but continue to exist; existing invoice lines are unaffected.

**Invoice workflow:** create an invoice or open one and choose **Add one item** or **Add several**. Choose an active saved item in the dropdown: its name, unit label, category and current selling price fill the editable invoice line. Enter the desired quantity. Changes to this invoice do not update the catalog. Changes to the catalog do not retroactively change existing invoices.

**Pricing:** do not preseed prices without owner direction. Each item can have its own selling price and unit (each, pan, dozen, person, tray, package, hour, delivery). Zero-dollar included items remain valid as individual invoice lines. Totals use the existing invoice calculation and payment-tracking functions.

**Security:** the catalog has Supabase RLS; reads and mutations require the workspace owner or manager role. Users never write arbitrary business IDs from the UI. Existing customer and invoice records are unchanged by deployment. No email or customer-visible publication is triggered by catalog updates.

**Important testing:** verify adding one saved menu item and several rows, updating its catalog price without altering an existing invoice, archiving/restoring, and printing the itemized PDF on iPhone Safari and desktop. No authenticated end-to-end production test performed yet.
