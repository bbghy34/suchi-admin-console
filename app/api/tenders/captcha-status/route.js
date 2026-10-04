import { requireAuth } from '@/lib/auth';
import { successResponse, forbidden, handleApiError } from '@/lib/api-response';
import { canUseTenderDesk } from '@/lib/roles';
import { twoCaptchaKeyStatus } from '@/lib/two-captcha';

/** Reports whether the 2Captcha key is still the placeholder. The key itself is never returned. */
export const GET = requireAuth(async (request, { user }) => {
  if (!canUseTenderDesk(user.accountRole)) return forbidden('The Tenders page is not available for this account.');
  try {
    return successResponse(twoCaptchaKeyStatus(), 'Tender captcha configuration retrieved.');
  } catch (error) {
    return handleApiError(error, 'Failed to read the tender captcha configuration.');
  }
});
