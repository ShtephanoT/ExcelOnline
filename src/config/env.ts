import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

/**
 * Configuration is read once, from a file that is never committed (`.env`),
 * and validated up-front so a typo fails with a readable message instead of a
 * mid-test `undefined`.
 *
 * Settings are split in two:
 *  - {@link appConfig}   – non-secret knobs, always available (unit tests, CI, linting).
 *  - {@link getCredentials} – the MS account secrets, demanded only by the sign-in step.
 */
loadDotEnv({ path: process.env.ENV_FILE ?? '.env' });

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const appConfigSchema = z.object({
  /** Shortcut URL that creates and opens a brand-new blank workbook in Excel for the web. */
  newWorkbookUrl: z.string().url().default('https://excel.new'),
  /** Cell the formula under test is written to. The assignment asks for A2. */
  targetCell: z
    .string()
    .regex(/^[A-Z]{1,3}[1-9]\d*$/, 'targetCell must be an A1-style reference, e.g. "A2"')
    .default('A2'),
  headless: booleanish.default('true'),
  /**
   * The assignment asks for Chrome, so the real Google Chrome channel is the
   * default; CI agents without it can fall back to bundled Chromium.
   */
  browserChannel: z.enum(['chrome', 'chrome-beta', 'msedge', 'chromium']).default('chrome'),
  slowMo: z.coerce.number().int().min(0).default(0),
  /** Where the signed-in browser profile is cached between runs. */
  storageStatePath: z.string().min(1).default('.auth/user.json'),
  /**
   * Pinned so the browser clock, the Excel UI date format and our expectation all
   * agree. Excel for the web renders TODAY() using the workbook/browser locale.
   */
  timezoneId: z.string().min(1).default('UTC'),
  locale: z.string().min(1).default('en-US'),
  /**
   * Accept yesterday/tomorrow as well. Useful when the runner clock and the
   * Microsoft service clock straddle midnight; off by default because it weakens
   * the assertion.
   */
  allowMidnightTolerance: booleanish.default('false'),
  /** Excel for the web is a heavy SPA; first paint of the grid can take a while. */
  appLoadTimeoutMs: z.coerce.number().int().positive().default(90_000),
  actionTimeoutMs: z.coerce.number().int().positive().default(20_000),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

function readAppConfig(): AppConfig {
  const parsed = appConfigSchema.safeParse({
    newWorkbookUrl: process.env.EXCEL_NEW_WORKBOOK_URL,
    targetCell: process.env.EXCEL_TARGET_CELL,
    headless: process.env.HEADLESS,
    browserChannel: process.env.BROWSER_CHANNEL,
    slowMo: process.env.SLOW_MO_MS,
    storageStatePath: process.env.STORAGE_STATE_PATH,
    timezoneId: process.env.TIMEZONE_ID,
    locale: process.env.LOCALE,
    allowMidnightTolerance: process.env.ALLOW_MIDNIGHT_TOLERANCE,
    appLoadTimeoutMs: process.env.APP_LOAD_TIMEOUT_MS,
    actionTimeoutMs: process.env.ACTION_TIMEOUT_MS,
  });

  if (!parsed.success) {
    throw new Error(`Invalid configuration in .env:\n${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

const credentialsSchema = z.object({
  email: z.string().email('MS_EMAIL must be a valid e-mail address'),
  password: z.string().min(1, 'MS_PASSWORD must not be empty'),
});

export type Credentials = z.infer<typeof credentialsSchema>;

/**
 * Only the sign-in step needs the secrets, so everything else keeps working
 * (unit tests, `npm run lint`, `npm run typecheck`) on a machine without a `.env`.
 */
export function getCredentials(): Credentials {
  const parsed = credentialsSchema.safeParse({
    email: process.env.MS_EMAIL,
    password: process.env.MS_PASSWORD,
  });

  if (!parsed.success) {
    throw new Error(
      `Missing or invalid Microsoft account credentials.\n` +
        `Copy .env.example to .env and fill it in.\n${formatIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

export const appConfig: AppConfig = readAppConfig();
