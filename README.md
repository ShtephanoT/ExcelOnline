# Excel Online `TODAY()` — end-to-end test

TypeScript + Playwright. Opens Excel for the web in Chrome, signs in with a
Microsoft account, enters `=TODAY()` in **A2** and asserts the returned value is
the date the test is performed.

```
Chrome -> excel.new -> Microsoft sign-in -> new workbook -> A2 = TODAY() -> assert
```

Status: passes against live Excel Online. `npm test` → 22 passed (20 unit,
sign-in, 1 end-to-end).

## Quick start

```bash
npm ci
npx playwright install chrome   # only if Chrome is not installed
cp .env.example .env            # fill in MS_EMAIL / MS_PASSWORD
npm test
npm run report                  # HTML report, video included
```

| Command                                 | What it does                                     |
| --------------------------------------- | ------------------------------------------------ |
| `npm run test:unit`                     | Date logic. No browser, no account.              |
| `npm run test:e2e`                      | The Excel test (signs in first if needed).       |
| `npm run test:headed`                   | Same, visible browser.                           |
| `npm run test:debug`                    | Playwright Inspector.                            |
| `npm run auth:manual`                   | Sign in by hand once and cache it. MFA fallback. |
| `npm run auth:reset`                    | Discard the cached session.                      |
| `npm run lint` / `typecheck` / `format` | Static checks.                                   |

Requires Node 20+, Chrome, and a Microsoft account that can use Excel for the web.

## Configuration

`.env` holds everything and is git-ignored; `.env.example` is the template.
Validated with `zod` at start-up, so a typo fails immediately instead of
surfacing as an `undefined` mid-test. Credentials are read **only** by the
sign-in step, so lint, typecheck and the unit tests need no `.env` at all.

| Variable                   | Default             | Purpose                                        |
| -------------------------- | ------------------- | ---------------------------------------------- |
| `MS_EMAIL`, `MS_PASSWORD`  | —                   | **Required.** The test account.                |
| `EXCEL_TARGET_CELL`        | `A2`                | Cell that receives the formula.                |
| `EXCEL_NEW_WORKBOOK_URL`   | `https://excel.new` | Creates a blank workbook.                      |
| `BROWSER_CHANNEL`          | `chrome`            | `chrome`, `chrome-beta`, `msedge`, `chromium`. |
| `HEADLESS`                 | `true`              | `false` to watch the run.                      |
| `SLOW_MO_MS`               | `0`                 | Slows actions down for a demo.                 |
| `STORAGE_STATE_PATH`       | `.auth/user.json`   | Where the session is cached.                   |
| `TIMEZONE_ID`              | `UTC`               | Browser zone. Drives the expected date.        |
| `LOCALE`                   | `en-US`             | Drives Excel's date format.                    |
| `ALLOW_MIDNIGHT_TOLERANCE` | `false`             | Also accept ±1 day.                            |
| `APP_LOAD_TIMEOUT_MS`      | `90000`             | Cold start of a big SPA.                       |
| `ACTION_TIMEOUT_MS`        | `20000`             | Per-action timeout.                            |

## Structure

```
src/config/env.ts              .env -> validated config
src/pages/microsoft-login.page.ts
src/pages/excel-workbook.page.ts
src/pages/excel.selectors.ts   every Excel selector, one file
src/utils/date.ts              what is today + what did Excel render
src/utils/locators.ts          shared locator helpers
tests/auth.setup.ts            signs in once, caches the session
tests/e2e/today.spec.ts        the test from the assignment
tests/unit/                    date logic, host matching
playwright.config.ts           unit -> setup -> excel-chrome
```

**Sign-in is a separate project.** Playwright's `setup` project signs in once
and writes the session to `.auth/user.json`; the test starts from there. Keeps
the test about the formula, and keeps real sign-ins rare — Microsoft throttles
and CAPTCHA-guards repeated automated logins.

**Page objects expose intent, not markup.** The spec never touches a selector.
Cells are selected via the **Name Box**, so scroll position and zoom are
irrelevant.

**A cell's value is read through the clipboard.** The grid is a `<canvas>`;
`Ctrl+C` plus a clipboard read is ordinary Excel behaviour and more stable than
the undocumented accessibility layer, which is kept as a fallback — though on the
build tested it returns nothing, so treat it as a courtesy rather than a safety
net. The read polls until the cell holds something; it must not wait for
`networkidle`, because the app keeps long-poll connections open and the network
never goes quiet.

**"Today" is a small set.** `TODAY()` follows the **browser's time zone** —
measured, not assumed: the same workbook answered `9/17/2026` under
`TIMEZONE_ID=UTC` and `9/18/2026` under `Europe/Kyiv` minutes apart. So zone and
locale are pinned. UTC is accepted as a second date, a margin for the hours when
the two disagree; asserting the pinned zone alone would be stricter and is a
one-line change. Rendered output is normalised to ISO, and ambiguous input like
`09/08/2026` is kept as both readings — a wrong date is wrong either way.
`matchesExpectedDate()` is unit-tested against a _wrong but real_ date, not only
against `#####`: a check that cannot fail is worth nothing.

## Demo recording

A recording of a passing run is committed:
[`docs/demo/today-demo.webm`](docs/demo/today-demo.webm).

Video is on for every end-to-end run, at `test-results/<test>/video.webm`, and is
embedded in `npm run report`. Copy it out before running anything else —
`outputDir` is shared by all three projects and emptied at the start of every
run, so the unit suite deletes the video the end-to-end run just made. See
[`docs/demo/README.md`](docs/demo/README.md).

## Limitations and workarounds

**Multi-factor authentication** is the biggest one. A scripted e-mail + password
flow cannot satisfy it. After the password, Microsoft shows a list of
verification methods (`[data-testid="tileList"]`); `signIn()` recognises that
screen and fails immediately with a message naming the cause. Options, in order
of preference: a dedicated test account with MFA off; `npm run auth:manual` once
and reuse the cached session; or TOTP via `otplib` and a seed in `.env` — not
implemented, since it weakens the second factor.

**Passkeys hijack the sign-in.** With a passkey enrolled, Microsoft skips the
password and asks for a platform authenticator. The page feature-detects
`window.PublicKeyCredential`, so `disablePasskeyPrompts()` hides that property
before the first navigation. An account with no password at all needs
`auth:manual`.

**A personal account meets two sign-in UIs in one run** — e-mail on the old page
at `login.microsoftonline.com`, password on the new React one at
`login.live.com`. Both selector generations are listed. Two consequences: the
old primary button arrives `disabled` and `fill()` does not reliably enable it,
so `submit()` falls back to Enter; and "have we left the identity provider?"
must check a list of hosts, or the hand-off to `login.live.com` reads as a
successful sign-in while the password screen is still up.

**The sign-in UI is not in the browser's language.** Microsoft serves it in the
account's language, so every selector there is id- or attribute-based, never
text-based.

**Excel for the web has no automation hooks** — no test ids, ids that change
between releases, a canvas grid. Every selector is a list of candidates in
`src/pages/excel.selectors.ts`. Expect that file to be the usual cause of a red
build, and treat it as maintenance.

**Two Excel behaviours worth knowing before editing the page object.** An
invisible full-bleed `#ReactModalDiv` swallows pointer events while a dialog is
in flight, so `selectCell` presses Escape and clicks again. And selecting a cell
does not mean typing reaches it: if the Name Box keeps focus, the formula lands
_in the Name Box_ and the cell stays silently empty — so `selectCell` waits for
the grid's hidden contenteditable to hold focus. That replaced a fixed 250 ms
sleep, which was the cause of intermittent passes.

**Clipboard access** needs `clipboard-read`/`clipboard-write`, granted in
`playwright.config.ts`. Chromium-only, which suits a Chrome-targeted suite.

Reading it naively is unsafe, and this bit once. When `Ctrl+C` does not take
effect — the window lost focus, an overlay ate the keystroke — the read returns
whatever was on the _system_ clipboard already. One run compared an SSH key that
had just been copied by hand against the expected date. A clipboard that happened
to hold today's date would have produced a false pass instead, which is the real
danger. So a sentinel is written to the clipboard before `Ctrl+C`: finding it
still there means the copy never happened, and the run fails saying the cell reads
as empty. That is the honest answer, rather than a pass on a coincidence.

**`#####` instead of a date** happens when the column is too narrow. The parser
reports it as "not a date", not a silent pass.

**Time zones.** With the default `TIMEZONE_ID=UTC`, a run at 00:45 in Kyiv
asserts _yesterday's_ date — correctly, because the browser is pinned to UTC
where it is still 21:45. Set `TIMEZONE_ID` to your own zone for a demo that
matches the wall clock. A run starting at 23:59:59 is a separate case, covered
by `ALLOW_MIDNIGHT_TOLERANCE`.

**Every run creates a file** in the account's OneDrive. Cleanup was left out on
purpose; for a scheduled suite I would point `EXCEL_NEW_WORKBOOK_URL` at one
existing workbook and clear the cell in a teardown, which is also more
deterministic.

**Network egress.** `excel.new`, `*.officeapps.live.com` and `*.sharepoint.com`
must all be reachable.

**CI** runs the static checks and unit tests only
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). The end-to-end test
needs a real account, and whether those credentials belong in a secret store is
the account owner's call. To enable it: add the secrets, set
`BROWSER_CHANNEL=chromium`, add a `npm run test:e2e` step.

## Alternatives considered

| Approach                               | Why not here                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Microsoft Graph / Excel REST API**   | Faster and far more stable, and what I would use to test the calculation engine — but it never opens a browser, so it does not test Excel Online as a user sees it. Good as a complementary smoke test. |
| **Office Scripts / Office.js add-in**  | Tests the formula from inside Excel, needs an add-in deployed to the tenant, and still leaves the UI untested.                                                                                          |
| **Desktop Excel + COM / xlwings**      | Different product and calculation host; says nothing about Excel Online.                                                                                                                                |
| **Faking the clock with `page.clock`** | Pinning the _zone_ already gives determinism. Faking the _instant_ would prove Excel echoes a clock we control, not that it returns the real date.                                                      |
