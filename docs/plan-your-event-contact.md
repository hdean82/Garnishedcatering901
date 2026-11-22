# Garnished Plan Your Event contact & inquiry flow

Research basis (Nov 2026): catering inquiry examples from Dexter, Catering form examples, Enjoy Culinary, Santa Monica College, and catering website UX guides support collecting name/contact, date or flexibility, occasion, approximate guest count, venue, service style, budget, menu/dietary needs and optional logistics.

## Customer page
- Public URL `/contact` (also supports `/?contact=1`).
- Homepage **Let's plan your event** and header/footer **Plan an event** links open the page.
- Lilac-free Garnished sage, botanical, warm ivory brand styling; responsive desktop/mobile, field labels and validation.
- Requires name, email, event type, estimated headcount, and either a proposed date or flexible-date checkbox.
- Optional phone, organization, service time, venue, service style, budget range, menu ideas, relevant dietary needs, special notes and preferred reply method.
- Confirmation explicitly says inquiry received, **not a booking**. Never collect payment or medical records.

## Data and security
- Supabase table `public.garnished_inquiries` was deployed on Nov 22, 2026.
- Public writes route only through Edge Function `submit-garnished-inquiry` (deployed active, JWT disabled because inquiry is public). RLS gives no anonymous select/insert/update permissions on the table; server uses privileged insert after validation, origin allowlist, honeypot and three-per-hour fingerprint limit.
- The first-party business owner and managers can see submitted inquiries in **Team Studio → Inquiries** and update statuses NEW, CONTACTED, QUOTED, BOOKED, CLOSED.
- Inquiry submissions **do not** automatically create customer accounts, invoices, events, client logins or send emails.
- Contact details must not be shared publicly. Review all inquiry text before copying it into other records.
- Existing Garnished business records, invoices and customer data were not changed.

## Verification needed
- Confirm `/contact` renders correctly on mobile Safari and desktop browsers after deployment.
- Submit a consented test inquiry using non-real details, verify it appears once in the owner inbox, and confirm no customer account or invoice was created.
- Verify required field errors, flexible-date flow, status changes, and the no-email behavior.
- Monitor suspected spam and add CAPTCHA if needed; initial low-volume limit is only a first defense.
