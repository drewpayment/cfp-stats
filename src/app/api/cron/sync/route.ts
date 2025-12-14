import { syncData } from '@/lib/sync';

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('[Cron Sync] Request received');

  // Validate CRON_SECRET
  const authHeader = request.headers.get('Authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET) {
    console.error('[Cron Sync] CRON_SECRET environment variable is not set');
    return Response.json({ error: 'Server misconfigured: missing CRON_SECRET' }, { status: 500 });
  }

  if (authHeader !== expectedAuth) {
    console.error('[Cron Sync] Auth failed - received:', authHeader?.substring(0, 20) + '...');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check required environment variables before proceeding
  const missingVars = [];
  if (!process.env.TURSO_DATABASE_URL) missingVars.push('TURSO_DATABASE_URL');
  if (!process.env.NEXT_PUBLIC_CFBD_API_KEY) missingVars.push('NEXT_PUBLIC_CFBD_API_KEY');

  if (missingVars.length > 0) {
    console.error('[Cron Sync] Missing environment variables:', missingVars.join(', '));
    return Response.json({ error: `Missing environment variables: ${missingVars.join(', ')}` }, { status: 500 });
  }

  // Check if in football season (Aug 1 - Feb 1)
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const isInSeason = month >= 7 || month <= 0; // Aug(7) - Jan(0)

  console.log(`[Cron Sync] Date check - month: ${month}, isInSeason: ${isInSeason}`);

  if (!isInSeason) {
    return Response.json({ skipped: true, reason: 'Off-season', month });
  }

  // Determine season year (Aug-Dec = current, Jan-Feb = previous)
  const year = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;

  console.log(`[Cron Sync] Starting sync for year ${year}`);

  try {
    await syncData(year);
    const duration = Date.now() - startTime;
    console.log(`[Cron Sync] Completed successfully in ${duration}ms`);
    return Response.json({ success: true, year, duration });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[Cron Sync] Failed:', { errorMessage, errorStack, duration });

    return Response.json(
      {
        error: errorMessage,
        duration,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
