import prisma from '@/lib/prisma';
import { successResponse, handleApiError } from '@/lib/api-response';
import { BRAND } from '@/lib/branding';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1 as connected`;
    return successResponse(
      {
        system: BRAND.fullName,
        database: 'connected',
        architecture: 'API-first',
        supportedClients: ['Admin Web Panel', 'Android', 'iOS', 'Flutter', 'React Native'],
      },
      `${BRAND.company} API is healthy`
    );
  } catch (error) {
    return handleApiError(error, 'Database service temporarily unavailable');
  }
}
