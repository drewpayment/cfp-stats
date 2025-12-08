import { getRankings } from '@/lib/metrics';
import RankingDashboard from '@/components/RankingDashboard';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ poll?: string, year?: string }> }) {
  const { poll: pollParam, year: yearParam } = await searchParams;
  const poll = pollParam || 'AP Top 25';
  const year = yearParam ? parseInt(yearParam) : undefined;
  const rankings = await getRankings(poll, year);

  return (
    <main>
      <RankingDashboard initialData={rankings} currentPoll={poll} currentYear={year || new Date().getFullYear()} />
    </main>
  );
}
