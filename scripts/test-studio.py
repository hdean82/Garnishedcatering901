"""Browser regression checks against the staged build and fictional records."""
import argparse
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("browser", choices=["chromium", "firefox", "webkit"])
parser.add_argument("--executable")
args = parser.parse_args()

fixture = """() => {
  businessId='sample-business';
  session={user:{id:'sample-owner'}};
  activeBusiness={owner_id:'sample-owner',timezone:'America/Chicago'};
  state={...emptyState(),
    customers:[{id:'customer',name:'Avery Ellis',email:'avery@example.invalid'}],
    garnished_inquiries:[{id:'request',contact_name:'Avery Ellis',event_type:'Dinner',
      created_at:'2026-11-20T18:00:00Z'}],
    events:[{id:'event', source_inquiry_id:'request', title:'Dinner', status:'confirmed',
      event_at:'2026-12-01T03:30:00Z',customer_id:'customer'}],
    invoices:[{id:'invoice',invoice_number:'1042',customer_id:'customer',event_id:'event',status:'partial'},
      {id:'quote',invoice_number:'1042',customer_id:'customer',document_type:'quote',status:'draft'}],
    invoice_items:[{invoice_id:'invoice',quantity:2,unit_price:50,description:'Sample dinner'},
      {invoice_id:'quote',quantity:2,unit_price:50,description:'Sample dinner'}],
    payments:[{invoice_id:'invoice',amount:40}]
  };
  document.getElementById('app').style.display='grid';
  document.getElementById('authBox').style.display='none';
  view='invoices';render();
}"""

with sync_playwright() as playwright:
    browser = getattr(playwright, args.browser).launch(executable_path=args.executable)
    for viewport in [{"width": 1280, "height": 900}, {"width": 390, "height": 844}]:
        context = browser.new_context(viewport=viewport, timezone_id="Asia/Tokyo", locale="en-US")
        context.route("**/*", lambda route: route.continue_()
                      if route.request.url.startswith("http://127.0.0.1:8765/") else route.abort())
        context.tracing.start(screenshots=True, snapshots=True)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        try:
            for path, element in [("/", "#publicLanding"), ("/?contact=1", "#garnishedInquiryForm"),
                                  ("/?client=1", "#login"), ("/?team=1", "#login")]:
                response = page.goto("http://127.0.0.1:8765" + path)
                assert response.ok, path
                expect(page.locator(element)).to_be_visible()
            # First-time invitation and returning-user screens, without sending emails.
            for portal in ("team", "client"):
                page.evaluate("localStorage.clear()")
                page.goto(f"http://127.0.0.1:8765/?{portal}=1&invite=fictional-only")
                expect(page.locator("#firstAccess h1")).to_have_text("Create a password")
                expect(page.locator("#inviteEmail")).to_be_visible()
                page.locator("#existingLogin").click()
                expect(page.locator("#password")).to_be_visible()
                expect(page.locator("#firstAccess")).to_be_hidden()
            page.evaluate("localStorage.clear()")
            page.goto("http://127.0.0.1:8765/?team=1")
            page.locator("#signup").click()
            expect(page.locator("label[for='password']")).to_have_text("Create a password")
            expect(page.locator("#forgotPassword")).to_be_hidden()
            page.locator("#login").click()
            expect(page.locator("label[for='password']")).to_have_text("Password")
            # Mock verified recovery token; do not contact Supabase or alter accounts.
            changes = []
            def fake_auth_user(route):
                cors = {"Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Headers": "authorization,apikey,content-type",
                        "Access-Control-Allow-Methods": "GET,PUT,OPTIONS"}
                if route.request.method == "OPTIONS":
                    route.fulfill(status=204, headers=cors)
                elif route.request.method == "PUT":
                    changes.append("update")
                    if len(changes) == 1:
                        route.fulfill(status=422, headers=cors, content_type="application/json",
                                      body='{"message":"Password rejected by policy"}')
                    else:
                        route.fulfill(status=200, headers=cors, content_type="application/json",
                                      body='{"id":"fictional-user","email":"tester@example.invalid"}')
                else:
                    route.fulfill(status=200, headers=cors, content_type="application/json",
                                  body='{"id":"fictional-user","email":"tester@example.invalid"}')
            page.route("https://vufrlkxftvpouhsqlmpb.supabase.co/auth/v1/user", fake_auth_user)
            page.evaluate("localStorage.clear()")
            page.goto("http://127.0.0.1:8765/?team=1#access_token=fictional-token&refresh_token=fictional-refresh&type=recovery")
            expect(page.locator("#firstAccess h1")).to_have_text("Choose a new password")
            page.locator("#newPassword").fill("fictional-password-123")
            page.locator("#setPasswordForm button[type='submit']").click()
            expect(page.locator("#authError")).to_contain_text("Password rejected by policy")
            expect(page.locator("#newPassword")).to_have_value("fictional-password-123")
            page.locator("#setPasswordForm button[type='submit']").click()
            expect(page.locator("#firstAccess")).to_be_hidden()
            assert len(changes) == 2, changes
            page.unroute("https://vufrlkxftvpouhsqlmpb.supabase.co/auth/v1/user", fake_auth_user)
            page.evaluate("localStorage.clear()")
            page.goto("http://127.0.0.1:8765/?team=1#error=access_denied")
            expect(page.locator("#authError")).to_contain_text("expired or has already been used")
            page.evaluate(fixture)
            search = page.locator("#invoiceSearch")
            search.fill("Quote 1042")
            expect(page.locator(".invoice-search-row:visible")).to_have_count(1)
            page.locator('[data-openinvoice="quote"]').click()
            page.locator("#invoiceActions").click()
            page.locator("#printInvoice").click()
            expect(page.locator("#modalTitle")).to_have_text("Quote preview")
            expect(page.locator("#modalBody")).to_contain_text("Estimated total")
            page.evaluate("closeModal();view='inquiries';render()")
            page.locator('[data-open-inquiry="request"]').click()
            page.locator('[data-inquiry-invoice="invoice"]').click()
            page.locator("#invoiceActions").click()
            page.locator("#printInvoice").click()
            expect(page.locator("#modalTitle")).to_have_text("Invoice preview")
            expect(page.locator("#modalBody")).to_contain_text("$60.00")
            page.evaluate("closeModal();view='planner';calendarCursor=new Date(2026,10,1);render()")
            page.locator('[data-cal-date="2026-11-30"]').click()
            expect(page.locator(".studio-picked-day")).to_contain_text("9:30 PM")
            assert not errors, errors
        except Exception:
            artifacts = Path("qa-artifacts")
            artifacts.mkdir(exist_ok=True)
            name = f"{args.browser}-{viewport['width']}"
            page.screenshot(path=str(artifacts / f"{name}.png"), full_page=True)
            context.tracing.stop(path=str(artifacts / f"{name}.zip"))
            raise
        else:
            context.tracing.stop()
            print(f"{args.browser} {viewport['width']}px passed")
        finally:
            context.close()
    browser.close()
