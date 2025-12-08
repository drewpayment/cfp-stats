import { syncData } from '@/lib/sync';

export async function GET(request: Request) {
  // Validate CRON_SECRET
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if in football season (Aug 1 - Feb 1)
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const isInSeason = month >= 7 || month <= 0; // Aug(7) - Jan(0)

  if (!isInSeason) {
    return Response.json({ skipped: true, reason: 'Off-season' });
  }

  // Determine season year (Aug-Dec = current, Jan-Feb = previous)
  const year = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  try {
    await syncData(year);
    return Response.json({ success: true, year });
  } catch (error) {
    console.error('Sync failed:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
