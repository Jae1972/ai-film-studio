import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ApiErrorCategory, StudioErrorDetails } from '../types/studio';

interface StudioErrorBannerProps {
  error: StudioErrorDetails;
  onRetry?: () => void;
  isRetrying?: boolean;
  retryLabel?: string;
}

const CATEGORY_TITLES: Record<ApiErrorCategory, string> = {
  CONFIG: 'Konfigurasi API Belum Lengkap',
  AUTH: 'Autentikasi Gemini API Gagal',
  QUOTA: 'Kuota Permintaan Terlampaui (429)',
  HIGH_DEMAND: 'Server Gemini Sedang Sibuk (503 UNAVAILABLE)',
  MODEL_UNAVAILABLE: 'Model Gemini Tidak Tersedia (404)',
  NETWORK: 'Gangguan Koneksi Jaringan',
  BAD_REQUEST: 'Input Permintaan Tidak Valid',
  UNKNOWN: 'Layanan AI Tidak Dapat Merespons',
};

export function StudioErrorBanner({
  error,
  onRetry,
  isRetrying = false,
  retryLabel = 'Coba Lagi',
}: StudioErrorBannerProps) {
  const title = CATEGORY_TITLES[error.category] || CATEGORY_TITLES.UNKNOWN;

  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/35 text-sm"
    >
      <div className="flex items-start gap-3 min-w-0">
        <AlertCircle className="w-5 h-5 text-[#EF4444] shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-[#EF4444]">{title}</p>
          <p className="text-[#F4F5F7]/90 leading-relaxed">{error.message}</p>
          {error.attempts && error.attempts > 1 ? (
            <p className="text-xs text-[#9CA3AF]">
              Percobaan otomatis: {error.attempts} kali
              {error.fallbackAttempted ? ' (termasuk model alternatif)' : ''}. Data formulir Anda tidak dihapus.
            </p>
          ) : null}
        </div>
      </div>

      {onRetry && error.retryable ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] text-xs font-semibold min-h-[42px] disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Mencoba Ulang...' : retryLabel}
        </button>
      ) : null}
    </div>
  );
}
