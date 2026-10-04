import { readFileSync } from 'fs';
import { twoCaptchaKeyStatus } from '../lib/two-captcha.js';

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, index).trim()] = value;
  }
  return env;
}

const env = loadEnv('.env');
process.env.TWOCAPTCHA_API_KEY = env.TWOCAPTCHA_API_KEY || '';
const status = twoCaptchaKeyStatus();
const dumped = JSON.stringify(status);
console.log(`configured=${status.configured}`);
console.log(`leaked=${dumped.includes(process.env.TWOCAPTCHA_API_KEY)}`);
