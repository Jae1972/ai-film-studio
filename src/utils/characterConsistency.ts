import type {
  CharacterReferenceSheet,
  CharacterSheetViewKey,
  ConsistencyGuide,
  ConsistencyLocks,
  FilmProject,
  GeneratedCharacter,
} from '../types/studio';

export const DEFAULT_CONSISTENCY_LOCKS: ConsistencyLocks = {
  face: true,
  hair: true,
  body: true,
  costume: true,
};

export const CHARACTER_SHEET_VIEWS: Array<{
  key: CharacterSheetViewKey;
  label: string;
  shortLabel: string;
  poseInstruction: string;
}> = [
  {
    key: 'front',
    label: '1. Tampak Depan',
    shortLabel: 'Tampak Depan',
    poseInstruction:
      'Front-facing view directly facing camera, symmetrical facial features, neutral studio lighting, clear eye/nose/lip proportions',
  },
  {
    key: 'side',
    label: '2. Tampak Samping',
    shortLabel: 'Tampak Samping',
    poseInstruction:
      '90-degree side profile view, exact same facial bone structure, nose bridge, jawline, and hair length/profile from primary reference',
  },
  {
    key: 'back',
    label: '3. Tampak Belakang',
    shortLabel: 'Tampak Belakang',
    poseInstruction:
      'Rear 180-degree back view showing exact hair back length/style, shoulder width, and rear details of the signature costume',
  },
  {
    key: 'fullBody',
    label: '4. Seluruh Tubuh (Pose Netral)',
    shortLabel: 'Seluruh Tubuh',
    poseInstruction:
      'Full-body standing neutral A-pose head-to-toe showing exact height, body build proportions, posture, and full costume silhouette',
  },
];

export function resolveConsistencyLocks(guide?: Partial<ConsistencyGuide>): ConsistencyLocks {
  return {
    face: guide?.locks?.face ?? true,
    hair: guide?.locks?.hair ?? true,
    body: guide?.locks?.body ?? true,
    costume: guide?.locks?.costume ?? true,
  };
}

export function buildForbiddenChangesText(
  locks: ConsistencyLocks,
  masterLocked = true
): string {
  if (!masterLocked) {
    return 'Penguncian konsistensi karakter sedang dinonaktifkan (eksplorasi visual bebas).';
  }
  const rules: string[] = [];
  if (locks.face) {
    rules.push('identitas wajah, bentuk mata/hidung/bibir, dan warna kulit tidak boleh berubah');
  }
  if (locks.hair) {
    rules.push('gaya dan panjang rambut tidak boleh berubah');
  }
  if (locks.body) {
    rules.push('tinggi badan, bentuk tubuh, dan ciri fisik khusus harus tetap konsisten');
  }
  if (locks.costume) {
    rules.push('pakaian harus mengikuti referensi kostum yang dipilih');
  }
  if (rules.length === 0) {
    return 'Tidak ada atribut spesifik yang dikunci secara terpisah.';
  }
  const joined = rules.join('; ');
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`;
}

export function buildCharacterIdentityAnchor(
  char: GeneratedCharacter,
  locks: ConsistencyLocks = DEFAULT_CONSISTENCY_LOCKS,
  identitySeed?: string
): string {
  const parts: string[] = [];
  const headerBits = [
    char.name.trim() || 'Unnamed Character',
    char.gender?.trim() || '',
    char.age?.trim() ? `age ${char.age.trim()}` : '',
    identitySeed ? `Seed ${identitySeed}` : '',
  ].filter(Boolean);

  parts.push(`[CHARACTER IDENTITY ANCHOR: ${headerBits.join(' | ')}]`);

  if (locks.face) {
    const faceBits = [
      char.facialDescription || char.appearance,
      char.eyeShape ? `eyes: ${char.eyeShape}` : '',
      char.noseShape ? `nose: ${char.noseShape}` : '',
      char.lipShape ? `lips: ${char.lipShape}` : '',
      char.skinTone ? `skin tone: ${char.skinTone}` : '',
    ]
      .map((s) => s?.trim())
      .filter(Boolean);
    if (faceBits.length > 0) {
      parts.push(
        `LOCKED FACE & SKIN (${faceBits.join(', ')}) — keep identical facial structure, eyes, nose, lips, and skin tone`
      );
    }
  }

  if (locks.hair && char.hairDescription?.trim()) {
    parts.push(
      `LOCKED HAIR (${char.hairDescription.trim()}) — keep exact hairstyle, length, and hair color`
    );
  }

  if (locks.body) {
    const bodyBits = [
      char.height ? `height: ${char.height}` : '',
      char.bodyBuild ? `build: ${char.bodyBuild}` : '',
      char.physicalTraits ? `distinctive traits: ${char.physicalTraits}` : '',
    ]
      .map((s) => s?.trim())
      .filter(Boolean);
    if (bodyBits.length > 0) {
      parts.push(
        `LOCKED BODY & PROPORTIONS (${bodyBits.join(', ')}) — preserve exact height, build, and physical traits`
      );
    }
  }

  if (locks.costume && char.costume?.trim()) {
    parts.push(
      `LOCKED COSTUME (${char.costume.trim()}) — wear exact reference outfit`
    );
  }

  if (char.referenceImageDataUrl) {
    parts.push('Match primary uploaded reference portrait identity strictly');
  }

  return parts.join('; ');
}

export function syncGuideWithCharacter(
  char: GeneratedCharacter,
  prevGuide?: ConsistencyGuide,
  index = 0
): ConsistencyGuide {
  const locks = resolveConsistencyLocks(prevGuide);
  const masterLocked = prevGuide?.locked ?? true;
  const seed = prevGuide?.identitySeed || `SEED-${String(index + 1).padStart(2, '0')}`;

  const facialSummary = [
    char.facialDescription || char.appearance,
    char.eyeShape ? `Mata: ${char.eyeShape}` : '',
    char.noseShape ? `Hidung: ${char.noseShape}` : '',
    char.lipShape ? `Bibir: ${char.lipShape}` : '',
    char.skinTone ? `Kulit: ${char.skinTone}` : '',
  ]
    .filter(Boolean)
    .join(' · ') || prevGuide?.facialFeatures || 'Belum diisi';

  const hairBodySummary = [
    char.hairDescription ? `Rambut: ${char.hairDescription}` : '',
    char.height ? `Tinggi: ${char.height}` : '',
    char.bodyBuild ? `Tubuh: ${char.bodyBuild}` : '',
    char.physicalTraits ? `Ciri: ${char.physicalTraits}` : '',
  ]
    .filter(Boolean)
    .join(' · ') || prevGuide?.hairAndBuild || 'Belum diisi';

  const heightAndBody = [char.height, char.bodyBuild]
    .filter(Boolean)
    .join(' · ') || prevGuide?.heightAndBody;

  const anchor = buildCharacterIdentityAnchor(char, locks, seed);

  return {
    characterId: char.id,
    characterName: char.name,
    identitySeed: seed,
    facialFeatures: facialSummary,
    hairAndBuild: hairBodySummary,
    signatureOutfit: char.costume?.trim() || prevGuide?.signatureOutfit || 'Belum diisi',
    skinTone: char.skinTone?.trim() || prevGuide?.skinTone,
    heightAndBody,
    specialTraits: char.physicalTraits?.trim() || prevGuide?.specialTraits,
    colorPaletteHex: prevGuide?.colorPaletteHex || ['#181B22', '#6366F1', '#3B82F6'],
    forbiddenChanges: buildForbiddenChangesText(locks, masterLocked),
    promptAnchor: anchor,
    locked: masterLocked,
    locks,
    referenceImageDataUrl: char.referenceImageDataUrl || prevGuide?.referenceImageDataUrl,
  };
}

export function buildReferenceSheetPrompt(
  char: GeneratedCharacter,
  viewKey: CharacterSheetViewKey,
  guide?: ConsistencyGuide
): string {
  const viewSpec = CHARACTER_SHEET_VIEWS.find((v) => v.key === viewKey) || CHARACTER_SHEET_VIEWS[0];
  const locks = resolveConsistencyLocks(guide);
  const anchor =
    guide?.locked !== false && guide?.promptAnchor
      ? guide.promptAnchor
      : buildCharacterIdentityAnchor(char, locks, guide?.identitySeed);

  return [
    `Character Reference Sheet (${viewSpec.shortLabel})`,
    viewSpec.poseInstruction,
    anchor,
    'Clean dark neutral production turnaround backdrop, consistent studio lighting, zero distortion',
  ]
    .filter(Boolean)
    .join('. ');
}

export function formatActiveConsistencyForPrompt(
  consistency: ConsistencyGuide[],
  characters?: GeneratedCharacter[]
): ConsistencyGuide[] {
  const charById = new Map((characters || []).map((c) => [c.id, c]));
  const charByName = new Map(
    (characters || []).map((c) => [c.name.toLowerCase(), c])
  );

  return consistency
    .filter((g) => g.locked !== false)
    .map((g) => {
      const matchedChar =
        (g.characterId ? charById.get(g.characterId) : undefined) ||
        charByName.get(g.characterName.toLowerCase());
      if (!matchedChar) return g;
      const locks = resolveConsistencyLocks(g);
      return {
        ...g,
        promptAnchor: g.promptAnchor?.trim()
          ? g.promptAnchor
          : buildCharacterIdentityAnchor(matchedChar, locks, g.identitySeed),
        forbiddenChanges: buildForbiddenChangesText(locks, true),
      };
    });
}

export function removeCharacterAndRelations(
  prev: FilmProject,
  characterId: string
): FilmProject {
  const target = prev.characters.find((c) => c.id === characterId);
  const targetNameLower = target?.name?.trim().toLowerCase() || '';

  // Hapus hanya karakter target beserta relasinya tanpa menyentuh karakter lain
  const otherCharNamesLower = new Set(
    prev.characters
      .filter((c) => c.id !== characterId)
      .map((c) => c.name.trim().toLowerCase())
      .filter(Boolean)
  );

  const nextCharacters = prev.characters.filter((c) => c.id !== characterId);

  const nextConsistency = prev.consistency.filter((g) => {
    if (g.characterId) {
      return g.characterId !== characterId;
    }
    if (targetNameLower && g.characterName.trim().toLowerCase() === targetNameLower) {
      // Pastikan tidak menghapus panduan karakter lain yang kebetulan bernama sama jika masih ada
      return otherCharNamesLower.has(targetNameLower);
    }
    return true;
  });

  const nextVisualAssets = (prev.visualAssets || []).filter((asset) => {
    if (asset.characterId) {
      return asset.characterId !== characterId;
    }
    if (
      asset.kind === 'character' &&
      targetNameLower &&
      (asset.characterName?.trim().toLowerCase() === targetNameLower ||
        asset.title.trim().toLowerCase() === targetNameLower)
    ) {
      return otherCharNamesLower.has(targetNameLower);
    }
    return true;
  });

  const nextVisualPrompts = (prev.visualPrompts || []).filter(
    (vp) => vp.characterId !== characterId
  );

  return {
    ...prev,
    characters: nextCharacters,
    consistency: nextConsistency,
    visualAssets: nextVisualAssets,
    visualPrompts: nextVisualPrompts,
    updatedAt: new Date().toISOString(),
  };
}

export function countReferenceSheetImages(sheet?: CharacterReferenceSheet): number {
  if (!sheet) return 0;
  return (['front', 'side', 'back', 'fullBody'] as CharacterSheetViewKey[]).filter(
    (k) => Boolean(sheet[k]?.imageDataUrl)
  ).length;
}
