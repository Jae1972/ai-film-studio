package com.aifilmstudio.model

import kotlinx.serialization.Serializable

enum class StudioDestination(val route: String, val label: String) {
    PRODUCTION_FORM("production_form", "1. Input"),
    SCRIPT_VIEW("script_view", "2. Naskah"),
    CHARACTER_VIEW("character_view", "3. Karakter"),
    PRODUCTION_RESULT("production_result", "4. Produksi"),
    STORY_GENERATOR("story", "Story Generator"),
    SCRIPT_WRITER("script", "Script Writer"),
    CHARACTER_GENERATOR("characters", "Character Generator"),
    CHARACTER_CONSISTENCY("consistency", "Character Consistency"),
    SCENE_GENERATOR("scenes", "Scene Generator"),
    IMAGE_GENERATOR("image", "Image Generator"),
    VIDEO_GENERATOR("video", "Video Generator"),
    VOICE_GENERATOR("voice", "Voice Generator"),
    STORYBOARD("storyboard", "Storyboard"),
    MY_PROJECTS("projects", "My Projects")
}

@Serializable
data class CharacterDraft(
    val id: String,
    val name: String,
    val role: String,
    val trait: String
)

@Serializable
data class FilmProductionInput(
    val title: String = "",
    val storyCategory: String = "Drama Keluarga",
    val customCategory: String = "",
    val premise: String = "",
    val genre: String = "Drama",
    val characters: List<CharacterDraft> = emptyList(),
    val episodeCount: Int = 1,
    val episodeDurationMinutes: Int = 3,
    val aspectRatio: String = "16:9",
    val customAspectRatio: String = "",
    val sceneCount: Int = 5,
    val dialogueLanguage: String = "Indonesia",
    val videoDuration: String = "3 menit",
    val visualStyle: String = "Realistic Cinematic",
    val sponsorBrandName: String = "",
    val sponsorBenefit: String = "",
    val sponsorProductImageUris: List<String> = emptyList(),
    val useSponsorAsDefaultOutfit: Boolean = false
)

@Serializable
data class EpisodeOutline(
    val episodeNumber: Int,
    val title: String,
    val summary: String,
    val cliffhanger: String
)

@Serializable
data class StoryResult(
    val logline: String,
    val synopsis: String,
    val themes: List<String>,
    val episodeOutlines: List<EpisodeOutline> = emptyList()
)

@Serializable
data class GeneratedCharacter(
    val id: String,
    val name: String,
    val role: String,
    val age: String = "",
    val appearance: String = "",
    val facialDescription: String = "",
    val hairDescription: String = "",
    val personality: String = "",
    val costume: String = "",
    val voiceTone: String = "",
    val referenceImageUri: String? = null
)

@Serializable
data class ConsistencyGuide(
    val characterName: String,
    val identitySeed: String,
    val facialFeatures: String,
    val signatureOutfit: String,
    val promptAnchor: String,
    val locked: Boolean = true,
    val referenceImageUri: String? = null
)

@Serializable
data class GeneratedScene(
    val sceneNumber: Int,
    val episodeNumber: Int = 1,
    val heading: String = "",
    val location: String = "",
    val lighting: String = "",
    val cameraMovement: String = "",
    val actionSummary: String = "",
    val charactersInvolved: List<String> = emptyList(),
    val estimatedSeconds: Int = 45
)

@Serializable
data class ScriptDialogue(
    val character: String,
    val parenthetical: String = "",
    val line: String
)

@Serializable
data class ScriptBlock(
    val sceneNumber: Int,
    val slugline: String,
    val action: String,
    val dialogues: List<ScriptDialogue> = emptyList()
)

@Serializable
data class StoryboardFrame(
    val frameNumber: Int,
    val sceneNumber: Int,
    val location: String = "",
    val characters: List<String> = emptyList(),
    val visualDescription: String = "",
    val dialogue: String = "",
    val shotType: String = "Medium Shot",
    val cameraAngle: String = "Eye Level",
    val lensMm: String = "35mm anamorphic",
    val compositionNotes: String = "",
    val visualPrompt: String = "",
    val durationSeconds: Int = 8
)

@Serializable
data class FilmProject(
    val id: String,
    val updatedAtEpochMs: Long,
    val input: FilmProductionInput = FilmProductionInput(),
    val story: StoryResult? = null,
    val characters: List<GeneratedCharacter> = emptyList(),
    val consistency: List<ConsistencyGuide> = emptyList(),
    val scenes: List<GeneratedScene> = emptyList(),
    val script: List<ScriptBlock> = emptyList(),
    val storyboard: List<StoryboardFrame> = emptyList()
)
