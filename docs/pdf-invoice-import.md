# Garnished Catering: PDF invoice import

## User flow
Studio → Invoices → **Import invoice PDF** (or Import invoice CSV).
Select a local PDF (maximum 12 MB and 8 pages); read text with Mozilla PDF.js 4.10.38 in-browser, with Tesseract.js 5.1.1 OCR fallback for image-only pages.
Preview extracted fields and raw text; edit all invoice fields and line items, add or remove lines, confirm review, and explicitly save.

## Data and privacy
- PDF file bytes are processed in the browser and never submitted to Garnished or stored as an attachment.
- PDF.js and OCR scripts (and OCR language assets) are downloaded from public CDNs on demand. PDF file content is not intentionally transmitted to those providers.
- The existing `import_garnished_invoices` transaction RPC saves only reviewed invoice number, customer name/email, issue/due dates, descriptions, quantities, prices, tax, discount, requested deposit and typed notes. The underlying invoice is created as **draft**.
- No messages, emails, payment records, or client-portal visibility changes are triggered.
- Existing duplicate invoice-number and owner/manager permission checks remain enforced in the database transaction. The UI separately checks duplicates as early feedback.
- Missing values remain blank (except the database's issue date defaults to today; the UI warns before proceeding).
- Scanned PDF OCR, irregular layouts, and mixed tables can misread fields: user review is mandatory. A mismatch between detected PDF total and computed total is highlighted.
- PDF importer is not suitable for PDFs whose content cannot be decoded or recognized with OCR; do not infer missing content.

## Technical checks
- Inline app JavaScript and PDF reader module parse successfully.
- Sample text fixture tests verified simple invoices, line items and missing-field behavior.
- The Cloudflare release script includes `assets/garnished-invoice-pdf.mjs`.
- Physical iPhone Safari / authenticated production PDF import is not yet verified; test with a fictional invoice PDF before any real import.
- The existing CSV importer is unchanged.

## Dependences
Mozilla PDF.js and Tesseract.js CDN resources are pinned to exact versions. If CDN access is restricted, the UI reports a load error rather than silently importing guessed details.
