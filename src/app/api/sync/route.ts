
import { NextResponse } from 'next/server';
import { syncData } from '@/lib/sync';

export async function POST(request: Request) {
  try {
    const { year } = await request.json();
    const YEAR = parseInt(year);
    
    if (!YEAR || isNaN(YEAR)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }

    await syncData(YEAR);
    
    return NextResponse.json({ success: true, message: `Synced data for ${YEAR}` });
  } catch (error: any) {
    console.error('Sync failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
