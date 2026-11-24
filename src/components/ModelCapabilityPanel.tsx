import { useEffect, useState } from 'react';
import { CheckCircle2, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import type { ModelCapabilityReport } from '../types/studio';
import { fetchModelCapabilityReport } from '../services/studioApi';

interface ModelCapabilityPanelProps {
  compact?: boolean;
  onReportLoaded?: (report: ModelCapabilityReport) => void;
}

export function ModelCapabilityPanel({
  compact = false,
  onReportLoaded,
}: ModelCapabilityPanelProps) {
  const [report, setReport] = useState<ModelCapabilityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchModelCapabilityReport();
      setReport(res);
      onReportLoaded?.(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal memeriksa kapabilitas model Gemini API.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkModels();
  }, []);

  return (
    <section className="p-4 sm:p-5 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[#E5A93C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-display text-sm font-semibold text-[#F4F5F7]">
              Pemeriksaan Kemampuan Model Gemini API
            </h2>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              {loading && !report
                ? 'Sedang memeriksa daftar model dan kapabilitas Gemini API...'
                : error
                  ? error
                  : report?.statusMessage ||
                    'Status kapabilitas model sedang dimuat.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void checkModels()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 text-xs font-medium text-[#F4F5F7] min-h-[40px] disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5A93C]" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-[#E5A93C]" />
          )}
          Periksa Kemampuan Model
        </button>
      </div>

      {report && !compact ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/[0.08]">
          {report.models.map((m) => (
            <div
              key={m.name}
              className="p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.08] space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#F4F5F7] truncate">
                    {m.displayName}
                  </p>
                  <p className="font-mono text-[11px] text-[#E5A93C] truncate">
                    {m.name}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium shrink-0">
                  {m.availableOnCurrentKey ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />
                      <span className="text-[#22C55E]">Aktif</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-[#EF4444]" />
                      <span className="text-[#9CA3AF]">
                        {m.requiresPaidKey ? 'Perlu Paid Key' : 'Nonaktif'}
                      </span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
                {m.notes}
              </p>
              <p className="text-[11px] text-[#6B7280] font-mono">
                Image Pixel Generation: {m.supportsImageGeneration ? 'Ya' : 'Tidak (Teks/Audio saja)'}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
