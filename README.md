# Excel Online `TODAY()` — end-to-end test

An end-to-end test, written in **TypeScript** with **Playwright**, that opens
**Excel for the web** in **Chrome**, signs in with a Microsoft account, enters
`=TODAY()` in cell **A2** and verifies that the returned value is the date on
which the test is performed.

```
Chrome  ->  excel.new  ->  Microsoft sign-in  ->  new workbook
        ->  A2 = TODAY()  ->  read A2  ->  assert it is today
```

---

## 1. Quick start

```bash
npm ci                       # install dependencies
npx playwright install chrome  # only if Chrome is not on the machine already

cp .env.example .env         # then fill in MS_EMAIL / MS_PASSWORD

npm test                     # unit tests + sign-in + the end-to-end test
npm run report               # open the HTML report (video included)
```

Useful variants:

| Command                                                 | What it does                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `npm run test:unit`                                     | Pure date logic. No browser, no account, runs anywhere.         |
| `npm run test:e2e`                                      | The Excel test only (signs in first if needed).                 |
| `npm run test:headed`                                   | Same, with a visible browser window.                            |
| `npm run test:debug`                                    | Playwright Inspector, step by step.                             |
| `npm run auth:manual`                                   | Sign in **by hand** once and save the session (MFA workaround). |
| `npm run auth:reset`                                    | Throw away the cached session and sign in again.                |
| `npm run lint` / `npm run typecheck` / `npm run format` | Static checks.                                                  |

Requirements: Node 20+, Google Chrome, and a Microsoft account that can use
Excel for the web.

---

## 2. Configuration

All configuration lives in **`.env`**, which is git-ignored; `.env.example` is
the committed template. Values are validated with `zod` at start-up, so a typo
fails immediately with a readable message instead of an `undefined` halfway
through a test.

| Variable                   | Default             | Purpose                                                    |
| -------------------------- | ------------------- | ---------------------------------------------------------- |
| `MS_EMAIL`, `MS_PASSWORD`  | —                   | **Required.** The Microsoft test account.                  |
| `EXCEL_TARGET_CELL`        | `A2`                | Cell that receives the formula.                            |
| `EXCEL_NEW_WORKBOOK_URL`   | `https://excel.new` | Shortcut that creates a blank workbook.                    |
| `BROWSER_CHANNEL`          | `chrome`            | `chrome`, `chrome-beta`, `msedge` or `chromium`.           |
| `HEADLESS`                 | `true`              | Set to `false` to watch the run.                           |
| `SLOW_MO_MS`               | `0`                 | Slows every action down — handy when recording a demo.     |
| `STORAGE_STATE_PATH`       | `.auth/user.json`   | Where the signed-in session is cached.                     |
| `TIMEZONE_ID`              | `UTC`               | Browser clock; the expected date is computed in this zone. |
| `LOCALE`                   | `en-US`             | Browser/UI language, which drives Excel's date format.     |
| `ALLOW_MIDNIGHT_TOLERANCE` | `false`             | Also accept yesterday/tomorrow (clock skew).               |
| `APP_LOAD_TIMEOUT_MS`      | `90000`             | Excel for the web is a big app on a cold start.            |
| `ACTION_TIMEOUT_MS`        | `20000`             | Per-action timeout.                                        |

Credentials are read **only** by the sign-in step, so `lint`, `typecheck` and
the unit tests all run on a machine that has no `.env` at all.

---

## 3. How it is put together

```
src/
  config/env.ts               # .env -> validated, typed configuration
  pages/
    microsoft-login.page.ts   # login.microsoftonline.com
    excel-workbook.page.ts    # a workbook open in Excel for the web
    excel.selectors.ts        # every Excel selector, in one place
  utils/
    date.ts                   # "what is today" + "what did Excel render"
    locators.ts               # small shared locator helpers
tests/
  auth.setup.ts               # signs in once, caches the session
  e2e/today.spec.ts           # the test from the assignment
  unit/date.spec.ts           # unit tests for the date logic
playwright.config.ts          # three projects: unit -> setup -> excel-chrome
```

Four decisions are worth explaining.

**Sign-in is a separate project, not part of the test.**
Playwright's `setup` project signs in once and writes cookies and local storage
to `.auth/user.json`; the actual test starts from that state. The test then reads
as what it is about — a formula — instead of being half login code. It also
keeps the number of real sign-ins low, which matters because Microsoft throttles
and CAPTCHA-guards repeated automated logins. The step is idempotent: with a
valid cached session it simply confirms the editor opens.

**The page objects expose intent, not markup.**
`selectCell`, `enterFormula`, `getFormula`, `getDisplayedValue` — the spec never
touches a selector. Cells are selected through the **Name Box** (type `A2`,
press Enter) rather than by clicking coordinates, so the test does not care
about scroll position, zoom, or window size.

**The value of a cell is read via the clipboard.**
Excel for the web paints the grid on a `<canvas>`. There is an accessibility
layer over it, but its markup is undocumented and changes between releases, so
`getDisplayedValue` copies the selected cell (`Ctrl+C`) and reads the clipboard —
plain, first-class Excel behaviour that is far more stable than internal DOM.
The accessibility layer is kept as a fallback, and a failure to read reports
both attempts.

**"Today" is a small set, not a single value.**
The runner clock, the browser clock and Microsoft's servers need not agree, and
`TODAY()` is recalculated server-side. So the browser's time zone and locale are
**pinned** (`TIMEZONE_ID`, `LOCALE`), and the assertion accepts today in the
pinned zone _and_ today in UTC. Excel's rendering is normalised to ISO before
comparing, tolerating `9/14/2026`, `14.09.2026`, `2026-09-14`, `14-Sep-2026`,
two-digit years, and so on. Genuinely ambiguous input such as `09/08/2026` is
kept as _both_ readings — a wrong date is still wrong under either one, so the
assertion loses no strength. All of this is pure, unit-tested logic
(`npm run test:unit`, 16 tests, no browser required).

---

## 4. Demo recording

Video capture is on for every end-to-end run:
`test-results/<test-name>/video.webm`, also embedded in `npm run report`.
See [`docs/demo/README.md`](docs/demo/README.md).

---

## 5. FAQ / known limitations

**Does this run in CI?**
The static checks and the unit tests do (`.github/workflows/ci.yml`). The
end-to-end test is deliberately _not_ wired into CI: it needs a real Microsoft
account, and whether those credentials belong in a CI secret store is a decision
for whoever owns the account. To enable it, add `MS_EMAIL`/`MS_PASSWORD` as
repository secrets, set `BROWSER_CHANNEL=chromium`, and add a step running
`npm run test:e2e`.

**Multi-factor authentication.**
This is the single biggest limitation of automating any Microsoft sign-in. A
scripted e-mail + password flow cannot satisfy MFA, and the login page object
fails fast with an explanatory message when it detects one. Three workarounds,
in order of preference:

1. Use a **dedicated test account** with MFA and Conditional Access switched off
   (the usual arrangement for test automation).
2. Run `npm run auth:manual` **once**: it opens Chrome, you sign in by hand —
   MFA and all — and the session is saved to `.auth/user.json`. Every later run
   reuses it until the token expires.
3. For a TOTP-based account, generate the code in the test with a library such
   as `otplib` and a shared secret in `.env`. Not implemented here: it needs the
   account's TOTP seed, which weakens the second factor.

**Automated sign-ins get flagged.**
Repeated logins — especially from a datacenter IP — trigger "unusual activity"
checks, CAPTCHAs, or a device-confirmation prompt. The cached session keeps
real sign-ins rare, which is the main defence. If an account does get flagged,
clear it manually in the account's security settings.

**Excel for the web has no automation hooks.**
No `data-testid`, ids that change between releases, and a canvas grid. Every
selector is therefore a _list_ of candidates and they all live in
`src/pages/excel.selectors.ts` — when Microsoft ships a UI change, that one file
is what needs updating. Expect this to be the most common cause of a red build,
and treat it as maintenance, not as a product defect.

**Clipboard access.**
Reading a cell's value needs `clipboard-read`/`clipboard-write`, granted in
`playwright.config.ts`. It is a Chromium-only capability — one more reason the
suite targets Chrome, as the assignment asks. Where the clipboard is
unavailable the accessibility-layer fallback takes over.

**`#####` instead of a date.**
If the column is too narrow, Excel renders `#####`. The parser reports this as
"not a date at all" rather than silently passing. Widening column A (or using a
prepared workbook) removes the risk.

**Running at midnight.**
A run that starts at 23:59:59 can read a value from the next day. Set
`ALLOW_MIDNIGHT_TOLERANCE=true` for unattended scheduled runs; it is off by
default because it weakens the assertion.

**Every run creates a file.**
`https://excel.new` creates a real workbook in the account's OneDrive. Over
time that clutters the drive. Deleting it afterwards was left out on purpose
(KISS — it is not what the test is about); if it matters, either clean up
through the Microsoft Graph API in a fixture teardown, or point
`EXCEL_NEW_WORKBOOK_URL` at one **existing** workbook and clear the cell in a
teardown step. The second option is also more deterministic and is what I would
choose for a suite that runs on a schedule.

**Network egress.**
Tenant policy, a corporate proxy, or a locked-down build agent can block
`excel.new`, `*.officeapps.live.com` and `*.sharepoint.com`. All three must be
reachable.

**Alternative approaches considered.**

| Approach                                                                                                   | Why not (here)                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Microsoft Graph / Excel REST API** — write `=TODAY()` into a workbook and read the value back over HTTP. | Much faster and far more stable, and it is what I would use to test the _calculation engine_. But it never opens a browser, so it does not test Excel Online as a user experiences it — which is exactly what the assignment asks for. Excellent as a complementary smoke test. |
| **Office Scripts / an Office.js add-in** running inside the workbook.                                      | Tests the formula from _inside_ Excel, but needs an add-in deployed to the tenant and still leaves the UI untested.                                                                                                                                                             |
| **Desktop Excel + COM / xlwings.**                                                                         | Different product, different calculation host; says nothing about Excel Online.                                                                                                                                                                                                 |
| **Pinning the clock with `page.clock` / a fake timer.**                                                    | Tempting, but `TODAY()` is evaluated on Microsoft's servers, not in the browser, so a faked browser clock would not change the result — and pinning it would make the test prove less, not more.                                                                                |

**Was this run against live Excel Online?**
The static checks and all 16 unit tests pass (see below). The end-to-end run
needs a Microsoft account and outbound access to `excel.new`, neither of which
was available in the environment this was written in, so the Excel selectors are
best-effort and centralised precisely so the first real run can correct them
quickly. Run `npm run test:headed` with your own credentials to see where it
stands.

```
$ npm run test:unit
  16 passed (1.3s)
$ npm run lint && npm run typecheck && npm run format:check
  clean
```
