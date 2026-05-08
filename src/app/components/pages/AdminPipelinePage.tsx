import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Loader2, PlayCircle, Plus, RefreshCw, Send, Upload } from 'lucide-react';
import {
  approveMatchCandidate,
  fetchAmazonByAsinAndIngest,
  getAmazonPaApiStatus,
  getPipelineReviewCandidates,
  getPipelineRuns,
  ingestAmazonBatch,
  triggerPipelineReprocess,
  type AmazonIngestItem,
  type AmazonIngestSummary,
  type PipelineReviewCandidate,
  type PipelineRunItem
} from '../../../lib/backendApi';

interface AdminPipelinePageProps {
  authToken: string | null;
  onRequireLogin: (onSuccess?: () => void) => void;
}

type IngestMode = 'paapi' | 'single' | 'json';

interface ManualForm {
  asin: string;
  title: string;
  brand: string;
  url: string;
  imageUrl: string;
  priceAmount: string;
  priceCurrency: string;
  category: string;
  size: string;
}

const EMPTY_MANUAL: ManualForm = {
  asin: '',
  title: '',
  brand: '',
  url: '',
  imageUrl: '',
  priceAmount: '',
  priceCurrency: 'USD',
  category: '',
  size: ''
};

const EXAMPLE_JSON = `{
  "items": [
    {
      "asin": "B07L1PHSY9",
      "title": "Tatcha The Water Cream",
      "brand": "Tatcha",
      "url": "https://www.amazon.com/dp/B07L1PHSY9",
      "imageUrl": "https://m.media-amazon.com/images/...",
      "priceAmount": 70.0,
      "priceCurrency": "USD",
      "category": "Moisturizer",
      "size": "50 ml"
    }
  ]
}`;

export function AdminPipelinePage({ authToken, onRequireLogin }: AdminPipelinePageProps) {
  const [runs, setRuns] = useState<PipelineRunItem[]>([]);
  const [reviewItems, setReviewItems] = useState<PipelineReviewCandidate[]>([]);
  const [paApiConfigured, setPaApiConfigured] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lastReprocessSummary, setLastReprocessSummary] = useState<{
    attempted: number;
    succeeded: number;
    failed: number;
  } | null>(null);
  const [lastIngestSummary, setLastIngestSummary] = useState<AmazonIngestSummary | null>(null);

  const [mode, setMode] = useState<IngestMode>('paapi');
  const [asinList, setAsinList] = useState('');
  const [manualForm, setManualForm] = useState<ManualForm>(EMPTY_MANUAL);
  const [jsonText, setJsonText] = useState(EXAMPLE_JSON);

  const load = async () => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    setIsLoading(true);
    try {
      const [runsResult, reviewResult, paStatus] = await Promise.all([
        getPipelineRuns(authToken, 20),
        getPipelineReviewCandidates(authToken, 50),
        getAmazonPaApiStatus(authToken).catch(() => ({ configured: false }))
      ]);
      setRuns(runsResult.runs);
      setReviewItems(reviewResult.items);
      setPaApiConfigured(paStatus.configured);
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
    setError(null);
    setInfo(null);
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

  const handleApprove = async (candidateId: number) => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    setApprovingId(candidateId);
    setError(null);
    setInfo(null);
    try {
      const summary = await approveMatchCandidate(authToken, candidateId);
      setInfo(
        `Approved candidate #${candidateId}. Product status now: ${summary.result?.product?.status ?? '-'}`
      );
      await load();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Failed to approve candidate');
    } finally {
      setApprovingId(null);
    }
  };

  const parsedAsins = useMemo(
    () =>
      asinList
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 3),
    [asinList]
  );

  const handlePaApiFetch = async () => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    if (parsedAsins.length === 0) {
      setError('Enter at least one ASIN.');
      return;
    }
    if (parsedAsins.length > 10) {
      setError('Amazon PA API allows at most 10 ASINs per request.');
      return;
    }
    setIsIngesting(true);
    setError(null);
    setInfo(null);
    try {
      const summary = await fetchAmazonByAsinAndIngest(authToken, {
        asins: parsedAsins,
        autoDiscoverCandidates: true,
        candidateLimit: 60
      });
      setLastIngestSummary(summary);
      setInfo(
        `Fetched ${summary.fetched ?? 0}, ingested ${summary.succeeded}/${summary.attempted} (failed=${summary.failed}).`
      );
      await load();
    } catch (ingestError) {
      setError(ingestError instanceof Error ? ingestError.message : 'PA API ingestion failed');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleManualIngest = async () => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    if (!manualForm.asin || !manualForm.title) {
      setError('ASIN and Title are required.');
      return;
    }
    const item: AmazonIngestItem = {
      asin: manualForm.asin.trim(),
      title: manualForm.title.trim(),
      brand: manualForm.brand.trim() || undefined,
      url: manualForm.url.trim() || undefined,
      imageUrl: manualForm.imageUrl.trim() || undefined,
      priceAmount: manualForm.priceAmount ? Number(manualForm.priceAmount) : undefined,
      priceCurrency: manualForm.priceCurrency.trim() || undefined,
      category: manualForm.category.trim() || undefined,
      size: manualForm.size.trim() || undefined
    };
    setIsIngesting(true);
    setError(null);
    setInfo(null);
    try {
      const summary = await ingestAmazonBatch(authToken, {
        items: [item],
        autoDiscoverCandidates: true,
        candidateLimit: 60
      });
      setLastIngestSummary(summary);
      setInfo(
        summary.failed === 0
          ? `Ingested ASIN ${item.asin}. Product status: ${summary.items[0]?.result?.product?.status ?? '-'}`
          : `Ingest failed: ${summary.items[0]?.error ?? 'unknown error'}`
      );
      if (summary.failed === 0) setManualForm(EMPTY_MANUAL);
      await load();
    } catch (ingestError) {
      setError(ingestError instanceof Error ? ingestError.message : 'Manual ingestion failed');
    } finally {
      setIsIngesting(false);
    }
  };

  const handleJsonIngest = async () => {
    if (!authToken) {
      onRequireLogin();
      return;
    }
    let parsed: { items?: AmazonIngestItem[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      setError(`Invalid JSON: ${(parseError as Error).message}`);
      return;
    }
    if (!parsed?.items || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      setError('JSON must contain a non-empty `items` array.');
      return;
    }
    setIsIngesting(true);
    setError(null);
    setInfo(null);
    try {
      const summary = await ingestAmazonBatch(authToken, {
        items: parsed.items,
        autoDiscoverCandidates: true,
        candidateLimit: 60
      });
      setLastIngestSummary(summary);
      setInfo(
        `Ingested ${summary.succeeded}/${summary.attempted} items (failed=${summary.failed}).`
      );
      await load();
    } catch (ingestError) {
      setError(ingestError instanceof Error ? ingestError.message : 'JSON ingestion failed');
    } finally {
      setIsIngesting(false);
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
              Ingest Amazon products, monitor pipeline runs, review ambiguous matches, and trigger reprocess.
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

        {info && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-emerald-300/50 bg-emerald-50 text-emerald-900 text-sm">
            {info}
          </div>
        )}

        {lastReprocessSummary && (
          <div className="mb-4 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 text-sm">
            Reprocess summary - attempted: {lastReprocessSummary.attempted}, succeeded:{' '}
            {lastReprocessSummary.succeeded}, failed: {lastReprocessSummary.failed}
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-6 mb-6">
          <StatCard title="Pipeline Runs" value={runs.length} subtitle="Latest 20 entries" />
          <StatCard
            title="Needs Review"
            value={reviewItems.length}
            subtitle="Awaiting approval"
          />
          <StatCard
            title="Last Run Status"
            value={runs[0]?.status ?? '-'}
            subtitle={runs[0]?.completedAt ? new Date(runs[0].completedAt).toLocaleString() : 'No run yet'}
          />
          <StatCard
            title="PA API"
            value={paApiConfigured == null ? '...' : paApiConfigured ? 'configured' : 'manual only'}
            subtitle={paApiConfigured ? 'ASIN lookup enabled' : 'Set AMAZON_PA_API_* in .env'}
          />
        </div>

        {/* Amazon ingestion */}
        <section className="bg-card rounded-2xl border border-border/50 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border/70 text-sm font-medium flex items-center gap-2">
            <Cloud className="w-4 h-4 text-primary" />
            Ingest Amazon products
          </div>
          <div className="px-4 py-3 border-b border-border/40 flex flex-wrap gap-2 text-sm">
            <ModeButton active={mode === 'paapi'} disabled={!paApiConfigured} onClick={() => setMode('paapi')}>
              <Cloud className="w-3.5 h-3.5" />
              By ASIN (PA API)
            </ModeButton>
            <ModeButton active={mode === 'single'} onClick={() => setMode('single')}>
              <Plus className="w-3.5 h-3.5" />
              Manual single
            </ModeButton>
            <ModeButton active={mode === 'json'} onClick={() => setMode('json')}>
              <Upload className="w-3.5 h-3.5" />
              JSON paste
            </ModeButton>
          </div>

          {mode === 'paapi' && (
            <div className="p-4 grid gap-3">
              {!paApiConfigured && (
                <div className="px-3 py-2 rounded-lg border border-amber-300/50 bg-amber-50 text-amber-900 text-xs">
                  PA API is not configured. Set <code>AMAZON_PA_API_ACCESS_KEY</code>,{' '}
                  <code>AMAZON_PA_API_SECRET_KEY</code>, and <code>AMAZON_PA_API_PARTNER_TAG</code> in{' '}
                  <code>.env</code> to enable automatic title/brand/image lookup.
                </div>
              )}
              <label className="text-xs text-muted-foreground">
                ASINs (max 10, separate by space, comma, or new line)
              </label>
              <textarea
                value={asinList}
                onChange={(event) => setAsinList(event.target.value)}
                rows={3}
                placeholder="B07L1PHSY9 B00949CTQQ B07ZPKZ6Z3"
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm font-mono"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Detected: {parsedAsins.length} ASIN(s)</span>
                <button
                  disabled={isIngesting || !paApiConfigured || parsedAsins.length === 0}
                  onClick={() => void handlePaApiFetch()}
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-all text-sm flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Fetch &amp; ingest
                </button>
              </div>
            </div>
          )}

          {mode === 'single' && (
            <div className="p-4 grid sm:grid-cols-2 gap-3 text-sm">
              <Field label="ASIN *" value={manualForm.asin} onChange={(v) => setManualForm({ ...manualForm, asin: v })} placeholder="B07L1PHSY9" />
              <Field label="Title *" value={manualForm.title} onChange={(v) => setManualForm({ ...manualForm, title: v })} placeholder="Tatcha The Water Cream ..." />
              <Field label="Brand" value={manualForm.brand} onChange={(v) => setManualForm({ ...manualForm, brand: v })} placeholder="Tatcha" />
              <Field label="Amazon URL" value={manualForm.url} onChange={(v) => setManualForm({ ...manualForm, url: v })} placeholder="https://www.amazon.com/dp/..." />
              <Field label="Image URL" value={manualForm.imageUrl} onChange={(v) => setManualForm({ ...manualForm, imageUrl: v })} placeholder="https://m.media-amazon.com/..." />
              <Field label="Price (USD)" value={manualForm.priceAmount} onChange={(v) => setManualForm({ ...manualForm, priceAmount: v })} placeholder="70.00" />
              <Field label="Category" value={manualForm.category} onChange={(v) => setManualForm({ ...manualForm, category: v })} placeholder="Moisturizer" />
              <Field label="Size" value={manualForm.size} onChange={(v) => setManualForm({ ...manualForm, size: v })} placeholder="50 ml" />
              <div className="sm:col-span-2 flex justify-end">
                <button
                  disabled={isIngesting}
                  onClick={() => void handleManualIngest()}
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-all text-sm flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Ingest
                </button>
              </div>
            </div>
          )}

          {mode === 'json' && (
            <div className="p-4 grid gap-3 text-sm">
              <label className="text-xs text-muted-foreground">
                Paste JSON. Top-level shape: {`{ "items": [ ... ] }`}, max 100 items.
              </label>
              <textarea
                value={jsonText}
                onChange={(event) => setJsonText(event.target.value)}
                rows={12}
                className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 text-xs font-mono"
              />
              <div className="flex justify-end">
                <button
                  disabled={isIngesting}
                  onClick={() => void handleJsonIngest()}
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-forest transition-all text-sm flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Ingest JSON
                </button>
              </div>
            </div>
          )}

          {lastIngestSummary && (
            <div className="px-4 pb-4">
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Last ingest summary (attempted={lastIngestSummary.attempted}, succeeded=
                  {lastIngestSummary.succeeded}, failed={lastIngestSummary.failed})
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-muted/40 p-3 text-[11px]">
                  {JSON.stringify(lastIngestSummary, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </section>

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
                    <Th>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={6}>
                        Loading...
                      </td>
                    </tr>
                  ) : reviewItems.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-muted-foreground" colSpan={6}>
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
                        <Td>
                          <button
                            disabled={approvingId === item.id}
                            onClick={() => void handleApprove(item.id)}
                            className="px-3 py-1.5 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-all text-xs flex items-center gap-1 disabled:opacity-60"
                          >
                            {approvingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Approve
                          </button>
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

function ModeButton({
  active,
  disabled,
  onClick,
  children
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 transition-all ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border hover:border-primary/40 hover:bg-primary/5'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
      />
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium text-muted-foreground">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}
