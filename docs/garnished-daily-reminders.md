# Garnished daily reminders

Safely designed for **internal** daily email digests, never customer outreach.

* Database migration was already applied to Garnished Catering Supabase.
* Edge function `garnished-daily-reminders` was deployed with `verify_jwt=false` **because it checks a private bearer secret itself**. Requests without the secret are rejected.
* GitHub Actions checks hourly and **skips when its secret is missing**.
* The business owner must explicitly opt in, choose an internal recipient, and choose a local-time hour in Business settings. Database default is disabled.
* The same random `GARNISHED_REMINDER_JOB_SECRET` must be provisioned privately in the Supabase Edge Function environment and as a GitHub Actions repository secret. Do not commit or paste it into an issue.
* Supabase must also have `RESEND_API_KEY` and `GARNISHED_FROM_EMAIL` configured with an authenticated sender domain.
* Until these credentials are set, **no scheduled emails can be sent**. An opt-in in the UI only saves preferences.
* Worker counts due tasks and non-paid invoice records (verify payment state before contacting a client), notifies only the configured internal address, and uses a per-business/day database reservation plus Resend idempotency key.
* Failed sends are recorded for manual review and are **not retried automatically**, to prevent duplicate outbound emails.
* Test with a deliberately opted-in noncustomer internal test address and fake due records before enabling business email. Do not email a real customer during the test.
* Production business ID and recipients must not be logged or published externally.
