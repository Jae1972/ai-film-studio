import { AlertTriangle, Database, X } from 'lucide-react';
import type { StorageStatusAlert } from '../services/studioStorage';

interface StorageStatusBannerProps {
  alert: StorageStatusAlert;
  onDismiss?: () => void;
}

export function StorageStatusBanner({ alert, onDismiss }: StorageStatusBannerProps) {
  const isError = alert.level === 'error';
  const isInfo = alert.level === 'info';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-xs ${
        isError
          ? 'bg-[#EF4444]/10 border-[#EF4444]/35 text-[#F4F5F7]'
          : isInfo
          ? 'bg-[#10B981]/10 border-[#10B981]/35 text-[#F4F5F7]'
          : 'bg-[#E5A93C]/10 border-[#E5A93C]/35 text-[#F4F5F7]'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {isError ? (
          <AlertTriangle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
        ) : (
          <Database
            className={`w-4 h-4 shrink-0 mt-0.5 ${
              isInfo ? 'text-[#10B981]' : 'text-[#E5A93C]'
            }`}
          />
        )}
        <div className="space-y-0.5 min-w-0">
          <p
            className={`font-semibold ${
              isError ? 'text-[#EF4444]' : isInfo ? 'text-[#10B981]' : 'text-[#E5A93C]'
            }`}
          >
            {isError
              ? 'Masalah Penyimpanan IndexedDB'
              : isInfo
              ? 'Migrasi Penyimpanan IndexedDB Selesai'
              : 'Peringatan Kapasitas Penyimpanan'}
          </p>
          <p className="text-[#F4F5F7]/90 leading-relaxed">{alert.message}</p>
        </div>
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan penyimpanan"
          className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}
