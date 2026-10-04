import { NextResponse } from 'next/server';
import { CLIENT } from '@/config/client';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    const headers = {
      'User-Agent': `SuchiiGroupAdminConsole/1.0 (${CLIENT.contactEmail})`,
      'Accept': 'application/json',
    };

    if (q) {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&limit=6&addressdetails=1`;
      const res = await fetch(url, { headers, cache: 'no-store' });
      const data = await res.json();
      return NextResponse.json({ success: true, data });
    }

    if (lat && lon) {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
      const res = await fetch(url, { headers, cache: 'no-store' });
      const data = await res.json();
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json(
      { success: false, message: 'Provide either "q" or both "lat" and "lon".' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Geocode API error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Geocoding failed' },
      { status: 500 }
    );
  }
}
