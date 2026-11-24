package com.aifilmstudio.model

import kotlinx.serialization.Serializable

enum class StudioDestination(val route: String, val label: String) {
    PRODUCTION_FORM("production_form", "Produksi Film"),
    PRODUCTION_RESULT("production_result", "Hasil Produksi"),
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
    val premise: String = "",
    val genre: String = "Drama",
    val characters: List<CharacterDraft> = emptyList(),
    val episodeCount: Int = 1,
    val sceneCount: Int = 4,
    val dialogueLanguage: String = "Bahasa Indonesia",
    val videoDuration: String = "60 detik",
    val visualStyle: String = "Sinematik Gelap"
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
    val episodeOutlines: List<EpisodeOutline>
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
    val episodeNumber: Int,
    val heading: String,
    val location: String,
    val lighting: String,
    val cameraMovement: String,
    val actionSummary: String,
    val charactersInvolved: List<String> = emptyList(),
    val estimatedSeconds: Int
)

@Serializable
data class ScriptDialogue(
    val character: String,
    val parenthetical: String,
    val line: String
)

@Serializable
data class ScriptBlock(
    val sceneNumber: Int,
    val slugline: String,
    val action: String,
    val dialogues: List<ScriptDialogue>
)

@Serializable
data class StoryboardFrame(
    val frameNumber: Int,
    val sceneNumber: Int,
    val location: String = "",
    val characters: List<String> = emptyList(),
    val visualDescription: String = "",
    val dialogue: String = "",
    val shotType: String,
    val cameraAngle: String,
    val lensMm: String,
    val compositionNotes: String,
    val visualPrompt: String,
    val durationSeconds: Int
)

@Serializable
data class FilmProject(
    val id: String,
    val updatedAtEpochMs: Long,
    val input: FilmProductionInput,
    val story: StoryResult? = null,
    val characters: List<GeneratedCharacter> = emptyList(),
    val consistency: List<ConsistencyGuide> = emptyList(),
    val scenes: List<GeneratedScene> = emptyList(),
    val script: List<ScriptBlock> = emptyList(),
    val storyboard: List<StoryboardFrame> = emptyList()
)
