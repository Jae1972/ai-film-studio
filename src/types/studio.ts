export type NavSection =
  | 'production-form'
  | 'production-result'
  | 'story'
  | 'script'
  | 'characters'
  | 'consistency'
  | 'scenes'
  | 'image'
  | 'video'
  | 'voice'
  | 'storyboard'
  | 'gallery'
  | 'projects'
  | 'kotlin-export';

export interface CharacterDraft {
  id: string;
  name: string;
  role: string;
  trait: string;
}

export interface FilmFormInput {
  title: string;
  premise: string;
  genre: string;
  characters: CharacterDraft[];
  episodeCount: number;
  sceneCount: number;
  dialogueLanguage: string;
  videoDuration: string;
  visualStyle: string;
  storyTheme?: string;
  storytellingStyle?: string;
  targetAudience?: string;
  storyLanguage?: string;
}

export interface EpisodeOutline {
  episodeNumber: number;
  title: string;
  summary: string;
  cliffhanger: string;
}

export interface StoryResult {
  storyTitle?: string;
  logline: string;
  shortSynopsis?: string;
  fullSynopsis?: string;
  synopsis: string;
  worldBackground?: string;
  mainConflict?: string;
  supportingConflict?: string;
  climax?: string;
  resolution?: string;
  ending?: string;
  threeActStructure: {
    act1: string;
    act2: string;
    act3: string;
  };
  themes: string[];
  episodeOutlines: EpisodeOutline[];
}

export type CharacterSheetViewKey = 'front' | 'side' | 'back' | 'fullBody';

export interface CharacterReferenceViewSlot {
  imageDataUrl?: string;
  mimeType?: string;
  source?: 'gemini-ai' | 'user-upload';
  promptText?: string;
  updatedAt?: string;
}

export interface CharacterReferenceSheet {
  front?: CharacterReferenceViewSlot;
  side?: CharacterReferenceViewSlot;
  back?: CharacterReferenceViewSlot;
  fullBody?: CharacterReferenceViewSlot;
}

export interface GeneratedCharacter {
  id: string;
  name: string;
  role: string;
  age: string;
  gender?: string;
  appearance: string;
  facialDescription?: string;
  eyeShape?: string;
  noseShape?: string;
  lipShape?: string;
  skinTone?: string;
  hairDescription?: string;
  height?: string;
  bodyBuild?: string;
  physicalTraits?: string;
  personality: string;
  costume: string;
  voiceTone: string;
  motivation: string;
  referenceImageDataUrl?: string;
  referenceImageMimeType?: string;
  referenceImageSource?: 'gemini-ai' | 'user-upload';
  referenceImageNotes?: string;
  visualPromptAnchor?: string;
  referenceSheet?: CharacterReferenceSheet;
}

export interface ConsistencyLocks {
  face: boolean;
  hair: boolean;
  body: boolean;
  costume: boolean;
}

export interface ConsistencyGuide {
  characterId?: string;
  characterName: string;
  identitySeed: string;
  facialFeatures: string;
  hairAndBuild: string;
  signatureOutfit: string;
  skinTone?: string;
  heightAndBody?: string;
  specialTraits?: string;
  colorPaletteHex: string[];
  forbiddenChanges: string;
  promptAnchor: string;
  locked?: boolean;
  locks?: ConsistencyLocks;
  referenceImageDataUrl?: string;
}

export interface GeneratedScene {
  sceneId?: string;
  sceneNumber: number;
  episodeNumber: number;
  heading: string;
  location: string;
  timeOfDay: string;
  lighting: string;
  cameraMovement: string;
  mood: string;
  actionSummary: string;
  mainAction?: string;
  dialogue?: string;
  visualNeeds?: string;
  audioNeeds?: string;
  transitionToNext?: string;
  charactersInvolved: string[];
  estimatedSeconds: number;
  duration?: string;
  imageDataUrl?: string;
  imageMimeType?: string;
  imagePromptUsed?: string;
  imageSource?: 'gemini-ai' | 'user-upload';
  imageUpdatedAt?: string;
}

export interface ScriptDialogue {
  character: string;
  parenthetical: string;
  expression?: string;
  line: string;
}

export interface ScriptBlock {
  sceneNumber: number;
  sceneTitle?: string;
  interiorExterior?: 'INT' | 'EXT' | 'INT/EXT';
  location?: string;
  timeOfDay?: string;
  slugline: string;
  characters?: string[];
  visualDescription?: string;
  characterActions?: string;
  action: string;
  dialogues: ScriptDialogue[];
  cameraDirection?: string;
  lighting?: string;
  audioMood?: string;
}

export type StoryboardShotSize =
  | 'Extreme Wide'
  | 'Wide'
  | 'Medium'
  | 'Close-Up'
  | 'Extreme Close-Up';

export type StoryboardAspectRatio = '16:9' | '9:16' | '1:1';

export interface StoryboardFrame {
  id?: string;
  frameNumber: number;
  sceneNumber: number;
  sceneId?: string;
  timeLabel?: string;
  location?: string;
  characters?: string[];
  characterIds?: string[];
  visualDescription?: string;
  characterAction?: string;
  expressionAndGesture?: string;
  characterPosition?: string;
  dialogue?: string;
  shotType: string;
  cameraAngle: string;
  cameraMovement?: string;
  lensMm: string;
  lighting?: string;
  atmosphere?: string;
  compositionNotes: string;
  visualPrompt: string;
  negativePrompt?: string;
  dialogueCue: string;
  durationSeconds: number;
  aspectRatio?: StoryboardAspectRatio;
  imageDataUrl?: string;
  imageMimeType?: string;
  imageSource?: 'gemini-ai' | 'user-upload';
  imageUpdatedAt?: string;
}

export interface VisualPromptSpec {
  id: string;
  type: 'image' | 'video';
  sceneNumber?: number;
  characterId?: string;
  inputMode?: 'prompt' | 'image';
  sourceImageDataUrl?: string;
  targetLabel: string;
  promptText: string;
  negativePrompt: string;
  cameraSpec: string;
  aspectRatio: string;
  durationOrResolution: string;
  createdAt: string;
}

export interface ProductionVisualAsset {
  id: string;
  kind: 'character' | 'scene' | 'storyboard';
  title: string;
  subtitle: string;
  sceneNumber?: number;
  frameNumber?: number;
  characterId?: string;
  characterName?: string;
  promptUsed: string;
  aspectRatio: string;
  imageDataUrl: string;
  mimeType: string;
  source: 'gemini-ai' | 'user-upload';
  modelUsed?: string;
  createdAt: string;
}

export interface VoiceTrack {
  id: string;
  label: string;
  mode: 'single' | 'multi';
  voiceName: string;
  secondaryVoiceName?: string;
  scriptText: string;
  audioBase64Wav: string;
  mimeType: string;
  createdAt: string;
}

export interface FilmProject {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: FilmFormInput;
  story: StoryResult | null;
  characters: GeneratedCharacter[];
  consistency: ConsistencyGuide[];
  scenes: GeneratedScene[];
  script: ScriptBlock[];
  storyboard: StoryboardFrame[];
  visualPrompts: VisualPromptSpec[];
  visualAssets?: ProductionVisualAsset[];
  voiceTracks: VoiceTrack[];
  lastGeneratedAt?: string;
}

export type ApiErrorCategory =
  | 'CONFIG'
  | 'AUTH'
  | 'QUOTA'
  | 'HIGH_DEMAND'
  | 'MODEL_UNAVAILABLE'
  | 'NETWORK'
  | 'BAD_REQUEST'
  | 'UNKNOWN';

export interface StudioErrorDetails {
  message: string;
  category: ApiErrorCategory;
  httpStatus?: number;
  retryable: boolean;
  attempts?: number;
  fallbackAttempted?: boolean;
}

export interface GeminiModelInfo {
  name: string;
  displayName: string;
  role: 'text' | 'tts' | 'image' | 'video' | 'other';
  supportsImageGeneration: boolean;
  requiresPaidKey: boolean;
  availableOnCurrentKey: boolean;
  notes: string;
}

export interface ModelCapabilityReport {
  checkedAt: string;
  geminiConfigured: boolean;
  paidKeyEnabled: boolean;
  imageGenerationReady: boolean;
  activeImageModel: string | null;
  activeTextModel: string;
  alternativeTextModel: string;
  liveCatalogChecked: boolean;
  statusMessage: string;
  models: GeminiModelInfo[];
}

export interface StudioCapabilities {
  geminiConfigured: boolean;
  textModel: string;
  alternativeTextModel: string;
  ttsSingleModel: string;
  ttsFallbackModel: string;
  ttsMultiModel: string;
  imageModels: string[];
  imageGenerationReady: boolean;
  maxRetries: number;
  paidMediaRenderingEnabled: boolean;
  firebaseConfigured: boolean;
}
