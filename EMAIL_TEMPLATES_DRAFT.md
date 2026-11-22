# Garnished Catering — Email Templates (DRAFT / NOT YET ENABLED)

These are content drafts for Supabase Auth and the Garnished Catering invitation Edge Function. Creating this file does **not** change Supabase's live email templates or send emails. Verify brand assets and redirect links before activation.

## Consistent footer for every template
GARNISH.ED catering
Questions? Contact Garnished Catering at (901) 482-3096.
Didn't receive an expected email? Check your Spam or Junk folder. If you find our email there, mark it as Not Spam to help future messages reach you.

## 1. Confirm account
**Subject:** Confirm your Garnished Catering Manager account

Welcome to Garnished Catering Manager.
Please confirm your email to finish setting up your account.

[Confirm my email] — Supabase confirmation URL placeholder: {{ .ConfirmationURL }}

If you didn't create this account, you can ignore this message.

## 2. Reset password
**Subject:** Reset your Garnished Catering Manager password

We received a request to reset your Garnished Catering Manager password.
[Reset password] — Supabase confirmation URL placeholder: {{ .ConfirmationURL }}

If you didn't request this, you can ignore this message.

## 3. Team invitation — NEW account
**Subject:** You're invited to the Garnished Catering team

You've been invited to a shared Garnished Catering workspace.
Your invitation will explain your assigned access level.
[Accept invitation] — server-generated acceptance link ONLY, not an arbitrary URL.

This invitation expires. If the link no longer works, ask the workspace owner to send a new one.

## 4. Team invitation — EXISTING account
**Subject:** Join the Garnished Catering workspace

The Garnished Catering owner has invited your existing account to join their shared workspace.
Sign in with the invited email address, then open the invitation link to accept your assigned role.
[Open invitation] — server-generated acceptance link ONLY.

No password or sensitive credential should appear in email.

## 5. Client invoice email — FUTURE feature
**Subject:** Garnished Catering invoice {{invoice_number}} for {{event_name}}

Hello {{client_name}},

Thank you for choosing Garnished Catering for {{event_name}} on {{event_date}}.
Your invoice {{invoice_number}} is ready to review.
Balance due: {{balance_due}}
Payment due date: {{due_date}}

[View invoice] — secure, recipient-scoped invoice link ONLY.

Please contact us if you have any questions about your order or invoice.

## Email checklist before enabling
- Confirm actual sender name/email, SPF/DKIM/DMARC, and link destination
- Verify responsive logo renders in Gmail and mobile email
- Test new and existing user invitations separately, with no duplicate accounts
- Test password reset and confirmation links, including expired links
- Check inbox and Spam/Junk delivery, and avoid claims that sending guarantees inbox placement
- Do not invite Justin or send real client invoices until owner approval
