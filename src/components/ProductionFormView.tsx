import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { CharacterDraft, FilmFormInput, StudioErrorDetails } from '../types/studio';
import { StudioErrorBanner } from './StudioErrorBanner';

interface ProductionFormViewProps {
  input: FilmFormInput;
  onChange: (next: FilmFormInput) => void;
  onGenerateFilm: () => void;
  isGenerating: boolean;
  generationStep: string | null;
  error: StudioErrorDetails | null;
  hasExistingResult: boolean;
  onViewResults: () => void;
}

const GENRES = ['Drama', 'Thriller', 'Sci-Fi', 'Horor', 'Romansa', 'Aksi', 'Komedi', 'Misteri', 'Fantasi'];
const VISUAL_STYLES = ['Sinematik Gelap', 'Drama Realis', 'Neo-Noir Urban', 'Hangat Emas', 'Dokumenter Intim'];
const LANGUAGES = ['Bahasa Indonesia', 'English', 'Bahasa Jawa', 'Bahasa Sunda', 'Bahasa Jepang', 'Bahasa Korea'];
const DURATIONS = ['15 detik', '30 detik', '60 detik', '3 menit', '5 menit', '10 menit'];

export function ProductionFormView({
  input,
  onChange,
  onGenerateFilm,
  isGenerating,
  generationStep,
  error,
  hasExistingResult,
  onViewResults,
}: ProductionFormViewProps) {
  const updateCharacter = (id: string, patch: Partial<CharacterDraft>) => {
    onChange({
      ...input,
      characters: input.characters.map((char) => (char.id === id ? { ...char, ...patch } : char)),
    });
  };

  const addCharacter = () => {
    onChange({
      ...input,
      characters: [
        ...input.characters,
        {
          id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          name: '',
          role: 'Pemeran Pendukung',
          trait: '',
        },
      ],
    });
  };

  const removeCharacter = (id: string) => {
    if (input.characters.length <= 1) return;
    onChange({
      ...input,
      characters: input.characters.filter((char) => char.id !== id),
    });
  };

  const fillStarterPrompt = () => {
    onChange({
      title: 'Senja di Stasiun Terakhir',
      premise:
        'Seorang penjaga stasiun kereta malam menemukan koper terkunci berisi rekaman suara ibunya yang hilang sepuluh tahun lalu, sementara kereta terakhir menuju kota besar datang dalam 20 menit dan seorang pria misterius menuntut koper itu dikembalikan.',
      genre: 'Drama',
      visualStyle: 'Sinematik Gelap',
      episodeCount: 1,
      sceneCount: 4,
      dialogueLanguage: 'Bahasa Indonesia',
      videoDuration: '60 detik',
      characters: [
        {
          id: 'char_starter_1',
          name: 'Raka Pratama',
          role: 'Protagonis',
          trait: 'Penjaga stasiun malam berusia 29 tahun, tenang namun menyimpan trauma masa lalu',
        },
        {
          id: 'char_starter_2',
          name: 'Surya Wibowo',
          role: 'Antagonis',
          trait: 'Kurir misterius berjas hujan gelap, berbicara singkat dan penuh tekanan',
        },
      ],
    });
  };

  const canSubmit = input.title.trim().length > 0 && input.premise.trim().length > 0 && !isGenerating;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div className="space-y-2 max-w-2xl">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#F4F5F7]">
            Studio Produksi Film Pendek
          </h1>
          <p className="text-sm sm:text-base text-[#9CA3AF] leading-relaxed">
            Susun parameter film Anda di bawah ini. Seluruh cerita, karakter, panduan konsistensi, adegan, naskah, dan storyboard dihasilkan secara nyata oleh Gemini API.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={fillStarterPrompt}
            disabled={isGenerating}
            className="px-3.5 py-2 rounded-lg text-xs font-medium text-[#9CA3AF] hover:text-[#F4F5F7] bg-[#181B22] border border-white/[0.08] hover:border-white/20 transition-colors whitespace-nowrap shrink-0"
          >
            Muat Contoh Input
          </button>
          {hasExistingResult ? (
            <button
              type="button"
              onClick={onViewResults}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-[#E5A93C] bg-[#E5A93C]/10 border border-[#E5A93C]/30 hover:bg-[#E5A93C]/20 transition-colors whitespace-nowrap shrink-0"
            >
              Lihat Hasil Produksi
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <StudioErrorBanner
          error={error}
          onRetry={onGenerateFilm}
          isRetrying={isGenerating}
        />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onGenerateFilm();
        }}
        className="space-y-8"
      >
        <section className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">01. Identitas & Premis Film</h2>
            <span className="text-xs text-[#6B7280] tabular-nums">Wajib diisi</span>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="film-title" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Judul Film
              </label>
              <input
                id="film-title"
                type="text"
                required
                value={input.title}
                onChange={(e) => onChange({ ...input, title: e.target.value })}
                placeholder="Contoh: Senja di Stasiun Terakhir"
                className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E5A93C]"
              />
            </div>

            <div>
              <label htmlFor="film-premise" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Cerita / Premis Utama
              </label>
              <textarea
                id="film-premise"
                required
                rows={4}
                value={input.premise}
                onChange={(e) => onChange({ ...input, premise: e.target.value })}
                placeholder="Jelaskan konflik utama, latar tempat, tujuan tokoh, serta ketegangan yang ingin dibangun dalam film pendek atau serial drama ini..."
                className="w-full p-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] leading-relaxed focus:outline-none focus:border-[#E5A93C]"
              />
            </div>
          </div>
        </section>

        <section className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5">
          <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">02. Parameter Produksi</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <label htmlFor="film-genre" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Genre
              </label>
              <select
                id="film-genre"
                value={input.genre}
                onChange={(e) => onChange({ ...input, genre: e.target.value })}
                className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] focus:outline-none focus:border-[#E5A93C]"
              >
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="film-style" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Gaya Visual
              </label>
              <select
                id="film-style"
                value={input.visualStyle}
                onChange={(e) => onChange({ ...input, visualStyle: e.target.value })}
                className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] focus:outline-none focus:border-[#E5A93C]"
              >
                {VISUAL_STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="film-lang" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Bahasa Dialog
              </label>
              <select
                id="film-lang"
                value={input.dialogueLanguage}
                onChange={(e) => onChange({ ...input, dialogueLanguage: e.target.value })}
                className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] focus:outline-none focus:border-[#E5A93C]"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="film-episodes" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Jumlah Episode
              </label>
              <input
                id="film-episodes"
                type="number"
                min={1}
                max={20}
                value={input.episodeCount}
                onChange={(e) =>
                  onChange({
                    ...input,
                    episodeCount: Math.max(1, Math.min(20, Number(e.target.value) || 1)),
                  })
                }
                className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm font-mono tabular-nums text-[#F4F5F7] focus:outline-none focus:border-[#E5A93C]"
              />
            </div>

            <div>
              <label htmlFor="film-scenes" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Jumlah Adegan
              </label>
              <input
                id="film-scenes"
                type="number"
                min={1}
                max={30}
                value={input.sceneCount}
                onChange={(e) =>
                  onChange({
                    ...input,
                    sceneCount: Math.max(1, Math.min(30, Number(e.target.value) || 1)),
                  })
                }
                className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm font-mono tabular-nums text-[#F4F5F7] focus:outline-none focus:border-[#E5A93C]"
              />
            </div>

            <div>
              <label htmlFor="film-duration" className="block text-sm font-medium text-[#F4F5F7] mb-2">
                Durasi Video
              </label>
              <select
                id="film-duration"
                value={input.videoDuration}
                onChange={(e) => onChange({ ...input, videoDuration: e.target.value })}
                className="w-full h-11 px-3.5 rounded-lg bg-[#0A0B0E] border border-white/[0.1] text-sm text-[#F4F5F7] focus:outline-none focus:border-[#E5A93C]"
              >
                {DURATIONS.map((dur) => (
                  <option key={dur} value={dur}>
                    {dur}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="p-6 rounded-xl bg-[#12141A] border border-white/[0.08] space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#F4F5F7]">03. Karakter Film</h2>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Tentukan tokoh utama dan pendukung untuk konsistensi naskah dan dialog.
              </p>
            </div>
            <button
              type="button"
              onClick={addCharacter}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-[#F4F5F7] bg-[#181B22] border border-white/[0.1] hover:border-[#E5A93C]/50 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#E5A93C]" />
              Tambah Karakter
            </button>
          </div>

          <div className="space-y-3">
            {input.characters.map((char, idx) => (
              <div
                key={char.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-lg bg-[#0A0B0E] border border-white/[0.08] items-start"
              >
                <div className="md:col-span-3">
                  <label className="block text-xs text-[#6B7280] mb-1.5">
                    Nama Tokoh {idx + 1}
                  </label>
                  <input
                    type="text"
                    value={char.name}
                    onChange={(e) => updateCharacter(char.id, { name: e.target.value })}
                    placeholder="Nama tokoh"
                    className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E5A93C]"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs text-[#6B7280] mb-1.5">Peran</label>
                  <input
                    type="text"
                    value={char.role}
                    onChange={(e) => updateCharacter(char.id, { role: e.target.value })}
                    placeholder="Protagonis / Antagonis"
                    className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E5A93C]"
                  />
                </div>
                <div className="md:col-span-5">
                  <label className="block text-xs text-[#6B7280] mb-1.5">Karakteristik & Penampilan</label>
                  <input
                    type="text"
                    value={char.trait}
                    onChange={(e) => updateCharacter(char.id, { trait: e.target.value })}
                    placeholder="Usia, sifat, ciri fisik, gaya busana..."
                    className="w-full h-10 px-3 rounded-lg bg-[#12141A] border border-white/[0.08] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-[#E5A93C]"
                  />
                </div>
                <div className="md:col-span-1 flex md:justify-end md:pt-6">
                  <button
                    type="button"
                    onClick={() => removeCharacter(char.id)}
                    disabled={input.characters.length <= 1}
                    aria-label="Hapus karakter"
                    className="p-2.5 rounded-lg text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-xl bg-[#12141A] border border-white/[0.08]">
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#F4F5F7]">
              {isGenerating
                ? generationStep || 'Menghubungkan ke Gemini API...'
                : 'Siap Memproduksi Paket Film Lengkap'}
            </p>
            <p className="text-xs text-[#9CA3AF]">
              Menghasilkan cerita, karakter, konsistensi visual, {input.sceneCount} adegan, naskah ({input.dialogueLanguage}), dan panel storyboard.
            </p>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-lg bg-[#E5A93C] hover:bg-[#F0B94D] text-[#0A0B0E] font-semibold text-sm transition-colors disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap shrink-0"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memproduksi Film...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Film
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
