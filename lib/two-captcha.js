const PLACEHOLDER = 'YOUR_2CAPTCHA_API_KEY';

/** True only when TWOCAPTCHA_API_KEY is set to something other than the placeholder. */
export function twoCaptchaKeyStatus() {
  const key = String(process.env.TWOCAPTCHA_API_KEY || '').trim();
  const configured = key.length > 0 && key !== PLACEHOLDER && !/^your[_-]?2captcha/i.test(key);
  return {
    configured,
    placeholder: PLACEHOLDER,
    source: 'TWOCAPTCHA_API_KEY',
  };
}
