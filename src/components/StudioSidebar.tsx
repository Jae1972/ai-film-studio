import {
  BookOpen,
  Clapperboard,
  Code2,
  FileText,
  Film,
  FolderKanban,
  Image,
  Images,
  LayoutGrid,
  Mic,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Video,
  X,
} from 'lucide-react';
import type { NavSection } from '../types/studio';

interface StudioSidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  projectTitle: string;
  hasProductionResult: boolean;
}

interface NavItem {
  id: NavSection;
  label: string;
  index?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'production-form', label: 'Formulir Produksi', icon: Clapperboard },
  { id: 'production-result', label: 'Hasil Produksi', icon: Sparkles },
];

const FEATURE_ITEMS: NavItem[] = [
  { id: 'story', index: '01', label: 'Story Generator', icon: BookOpen },
  { id: 'script', index: '02', label: 'Script Writer', icon: FileText },
  { id: 'characters', index: '03', label: 'Character Studio', icon: UserCheck },
  { id: 'consistency', index: '04', label: 'Character Consistency', icon: ShieldCheck },
  { id: 'scenes', index: '05', label: 'Scene Generator', icon: Film },
  { id: 'image', index: '06', label: 'AI Visual Production', icon: Image },
  { id: 'video', index: '07', label: 'Video Generator', icon: Video },
  { id: 'voice', index: '08', label: 'Voice Studio', icon: Mic },
  { id: 'storyboard', index: '09', label: 'Storyboard Visual', icon: LayoutGrid },
  { id: 'gallery', index: '10', label: 'Galeri Produksi', icon: Images },
  { id: 'projects', index: '11', label: 'My Projects', icon: FolderKanban },
];

const PLATFORM_ITEMS: NavItem[] = [
  { id: 'kotlin-export', label: 'Kode Kotlin Compose', icon: Code2 },
];

export function StudioSidebar({
  activeSection,
  onSelectSection,
  mobileOpen,
  onCloseMobile,
  projectTitle,
  hasProductionResult,
}: StudioSidebarProps) {
  const renderNavButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectSection(item.id);
          onCloseMobile();
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5A93C] ${
          isActive
            ? 'bg-[#E5A93C]/14 text-[#F4F5F7] border border-[#E5A93C]/35'
            : 'text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.04] border border-transparent'
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#E5A93C]' : 'text-[#6B7280]'}`} />
        <span className="truncate whitespace-nowrap">
          {item.index ? (
            <span className="font-mono text-xs text-[#6B7280] mr-2 tabular-nums">{item.index}.</span>
          ) : null}
          {item.label}
        </span>
        {item.id === 'production-result' && hasProductionResult ? (
          <span className="ml-auto font-mono text-[11px] text-[#22C55E] shrink-0">Siap</span>
        ) : null}
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#12141A] border-r border-white/[0.08]">
      <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.08] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#E5A93C] text-[#0A0B0E] flex items-center justify-center shrink-0">
            <Clapperboard className="w-4 h-4" />
          </div>
          <span className="font-display font-bold text-base tracking-tight text-[#F4F5F7] whitespace-nowrap">
            AI FILM STUDIO
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup menu navigasi"
          className="lg:hidden p-2 rounded-lg text-[#9CA3AF] hover:text-[#F4F5F7] hover:bg-white/[0.06]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-white/[0.08]">
        <p className="text-xs text-[#6B7280]">Proyek Aktif</p>
        <p className="text-sm font-medium text-[#F4F5F7] truncate mt-0.5">
          {projectTitle.trim() || 'Proyek Film Baru'}
        </p>
      </div>

      <nav aria-label="Navigasi Studio" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-xs font-medium text-[#6B7280]">Alur Utama</p>
          {PRIMARY_ITEMS.map(renderNavButton)}
        </div>

        <div className="space-y-1">
          <p className="px-3 pb-1 text-xs font-medium text-[#6B7280]">Modul Studio</p>
          {FEATURE_ITEMS.map(renderNavButton)}
        </div>

        <div className="space-y-1 pt-2 border-t border-white/[0.08]">
          <p className="px-3 pb-1 text-xs font-medium text-[#6B7280]">Android Native</p>
          {PLATFORM_ITEMS.map(renderNavButton)}
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-[264px] shrink-0 h-screen sticky top-0">{sidebarContent}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/70" onClick={onCloseMobile} aria-hidden="true" />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</aside>
        </div>
      ) : null}
    </>
  );
}
