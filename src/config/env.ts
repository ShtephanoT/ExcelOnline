import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv({ path: process.env.ENV_FILE ?? '.env' });

const booleanish = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const appConfigSchema = z.object({
  newWorkbookUrl: z.string().url().default('https://excel.new'),
  targetCell: z
    .string()
    .regex(/^[A-Z]{1,3}[1-9]\d*$/, 'must be an A1-style reference, e.g. "A2"')
    .default('A2'),
  headless: booleanish.default('true'),
  browserChannel: z.enum(['chrome', 'chrome-beta', 'msedge', 'chromium']).default('chrome'),
  slowMo: z.coerce.number().int().min(0).default(0),
  storageStatePath: z.string().min(1).default('.auth/user.json'),
  timezoneId: z.string().min(1).default('UTC'),
  locale: z.string().min(1).default('en-US'),
  allowMidnightTolerance: booleanish.default('false'),
  appLoadTimeoutMs: z.coerce.number().int().positive().default(90_000),
  actionTimeoutMs: z.coerce.number().int().positive().default(20_000),
});

const credentialsSchema = z.object({
  email: z
    .string()
    .email('MS_EMAIL must be a valid e-mail address')
    .refine(
      (email) => !/@example\.(com|net|org)$/i.test(email),
      'MS_EMAIL is still the .env.example placeholder - put a real Microsoft account in .env',
    ),
  password: z
    .string()
    .min(1, 'MS_PASSWORD must not be empty')
    .refine(
      (password) => password !== 'super-secret-password',
      'MS_PASSWORD is still the .env.example placeholder - put the real password in .env',
    ),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type Credentials = z.infer<typeof credentialsSchema>;

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown, whatFailed: string): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues.map(
    (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
  );
  throw new Error(`${whatFailed}\n${issues.join('\n')}`);
}

export const appConfig: AppConfig = parse(
  appConfigSchema,
  {
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
  },
  'Invalid configuration in .env:',
);

export function getCredentials(): Credentials {
  return parse(
    credentialsSchema,
    { email: process.env.MS_EMAIL, password: process.env.MS_PASSWORD },
    'Missing or invalid Microsoft account credentials.\nCopy .env.example to .env and fill it in.',
  );
}
