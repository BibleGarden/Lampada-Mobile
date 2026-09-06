import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { apiBaseUrl } from '../lib/apiConfig.ts';

const values = parseEnv(readFileSync(process.argv[2], 'utf8'));
let invalid = false;
for (const name of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_AI_PROXY_KEY']) {
  if (!values[name]?.trim()) {
    console.error(`Missing variable: ${name}`);
    invalid = true;
  }
}
if (values.EXPO_PUBLIC_API_URL?.trim() && !apiBaseUrl(values.EXPO_PUBLIC_API_URL)) {
  console.error('Invalid EXPO_PUBLIC_API_URL: expected an HTTP(S) server origin without a path, credentials, query or fragment.');
  invalid = true;
}
process.exitCode = invalid ? 1 : 0;
