import { useEffect, useState } from 'react';
import { AlertTriangle, PlayCircle, RefreshCw } from 'lucide-react';
import {
  getPipelineReviewCandidates,
  getPipelineRuns,
  triggerPipelineReprocess,
  type PipelineReviewCandidate,
  type PipelineRunItem
} from '../../../lib/backendApi';

interface AdminPipelinePageProps {
  authToken: string | null;
  onRequireLogin: (onSuccess?: () => void) => void;
}

export function AdminPipelinePage({ authToken, onRequireLogin }: AdminPipelinePageProps) {
  const [runs, setRuns] = useState<PipelineRunItem[]>([]);
  const [reviewItems, setReviewItems] = useState<PipelineReviewCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReprocessSummary, setLastReprocessSummary] = useState<{
    attempted: number;
    succeeded: number;
    failed: number;
  } | null>(null);

  const load = async () => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    setIsLoading(true);
    try {
      const [runsResult, reviewResult] = await Promise.all([
        getPipelineRuns(authToken, 20),
        getPipelineReviewCandidates(authToken, 50)
      ]);
      setRuns(runsResult.runs);
      setReviewItems(reviewResult.items);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load admin pipeline data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authToken) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const handleReprocess = async () => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    setIsReprocessing(true);
    try {
      const summary = await triggerPipelineReprocess(authToken, {
        statuses: ['comparison_only'],
        autoDiscoverCandidates: true,
        limit: 25,
        candidateLimit: 60
      });
      setLastReprocessSummary({
        attempted: summary.attempted,
        succeeded: summary.succeeded,
        failed: summary.failed
      });
      await load();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Failed to trigger reprocess');
    } finally {
      setIsReprocessing(false);
    }
  };

  if (!authToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream via-card to-muted/30 py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-3xl mb-3" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
            Admin Pipeline Dashboard
          </h1>
          <p className="text-muted-foreground mb-6">Login required to access pipeline monitoring tools.</p>
          <button
            onClick={() => onRequireLogin()}
            className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-all"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream via-card to-muted/30 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
              Admin Pipeline
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor pipeline runs, review ambiguous matches, and trigger reprocess.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="px-4 py-2 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-sm flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              disabled={isReprocessing}
              onClick={() => void handleReprocess()}
              className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-all text-sm flex items-center gap-1.5 disabled:opacity-60"
            >
              <PlayCircle className="w-4 h-4" />
              {isReprocessing ? 'Reprocessing...' : 'Reprocess comparison_only'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {lastReprocessSummary && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
            Reprocess summary - attempted: {lastReprocessSummary.attempted}, succeeded:{' '}
            {lastReprocessSummary.succeeded}, failed: {lastReprocessSummary.failed}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <StatCard title="Pipeline Runs" value={runs.length} subtitle="Latest 20 entries" />
          <StatCard
            title="Needs Review"
            value={reviewItems.length}
            subtitle="Current review candidate queue"
          />
          <StatCard
            title="Last Run Status"
            value={runs[0]?.status ?? '-'}
            subtitle={runs[0]?.completedAt ? new Date(runs[0].completedAt).toLocaleString() : 'No run yet'}
          />
        </div>

        <div className="grid xl:grid-cols-2 gap-6">
          <section className="bg-card rounded-2xl border border-border/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/70 text-sm font-medium">Recent Pipeline Runs</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <Th>ID</Th>
                    <Th>Trigger</Th>
                    <Th>Status</Th>
                    <Th>Processed</Th>
                    <Th>Success</Th>
                    <Th>Fail</Th>
                    <Th>Completed</Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={7}>
                        Loading...
                      </td>
                    </tr>
                  ) : runs.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={7}>
                        No pipeline runs yet.
                      </td>
                    </tr>
                  ) : (
                    runs.map((run) => (
                      <tr key={run.id} className="border-t border-border/50">
                        <Td>{run.id}</Td>
                        <Td>{run.trigger}</Td>
                        <Td>{run.status}</Td>
                        <Td>{run.processed}</Td>
                        <Td>{run.succeeded}</Td>
                        <Td>{run.failed}</Td>
                        <Td>{run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-card rounded-2xl border border-border/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border/70 text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Needs Review Candidates
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <Th>ID</Th>
                    <Th>Confidence</Th>
                    <Th>Amazon</Th>
                    <Th>Candidate</Th>
                    <Th>Warnings</Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                        Loading...
                      </td>
                    </tr>
                  ) : reviewItems.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                        Review queue is empty.
                      </td>
                    </tr>
                  ) : (
                    reviewItems.map((item) => (
                      <tr key={item.id} className="border-t border-border/50 align-top">
                        <Td>{item.id}</Td>
                        <Td>{item.confidence.toFixed(3)}</Td>
                        <Td>
                          <div className="font-medium">{item.amazonSource?.brand ?? '-'}</div>
                          <div className="text-xs text-muted-foreground">{item.amazonSource?.name ?? '-'}</div>
                        </Td>
                        <Td>
                          <div className="font-medium">{item.enrichmentSource?.brand ?? '-'}</div>
                          <div className="text-xs text-muted-foreground">{item.enrichmentSource?.name ?? '-'}</div>
                        </Td>
                        <Td>
                          <div className="text-xs text-muted-foreground">{item.warnings.join(', ') || '-'}</div>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string | number; subtitle: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border/50 p-5">
      <div className="text-sm text-muted-foreground mb-2">{title}</div>
      <div className="text-3xl mb-1" style={{ fontFamily: 'var(--font-serif)', fontWeight: 400 }}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium text-muted-foreground">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}

