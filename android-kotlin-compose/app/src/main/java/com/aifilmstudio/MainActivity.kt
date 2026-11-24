package com.aifilmstudio

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aifilmstudio.data.remote.GeminiStudioService
import com.aifilmstudio.model.CharacterDraft
import com.aifilmstudio.model.ConsistencyGuide
import com.aifilmstudio.model.FilmProductionInput
import com.aifilmstudio.model.FilmProject
import com.aifilmstudio.model.StudioDestination
import com.aifilmstudio.ui.screens.ProductionFormScreen
import com.aifilmstudio.ui.screens.ProductionResultScreen
import com.aifilmstudio.ui.theme.AiFilmStudioTheme
import kotlinx.coroutines.launch
import java.util.UUID

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val geminiService = GeminiStudioService(
            apiKey = BuildConfig.GEMINI_API_KEY
        )

        setContent {
            AiFilmStudioTheme {
                AiFilmStudioApp(geminiService = geminiService)
            }
        }
    }
}

@Composable
fun AiFilmStudioApp(geminiService: GeminiStudioService) {
    val scope = rememberCoroutineScope()
    var currentRoute by remember { mutableStateOf(StudioDestination.PRODUCTION_FORM) }
    var formInput by remember { mutableStateOf(FilmProductionInput()) }
    var activeProject by remember { mutableStateOf<FilmProject?>(null) }
    var isGenerating by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val navTabs = listOf(
        StudioDestination.PRODUCTION_FORM,
        StudioDestination.SCRIPT_VIEW,
        StudioDestination.CHARACTER_VIEW,
        StudioDestination.PRODUCTION_RESULT
    )

    val deepNavyBg = Color(0xFF070D19)
    val tabSurface = Color(0xFF0F1A2E)
    val cyanAccent = Color(0xFF38BDF8)
    val mutedBorder = Color(0xFF1E3A5F)

    Scaffold(
        containerColor = deepNavyBg,
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(deepNavyBg)
                    .statusBarsPadding()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(84.dp)
                        .background(
                            brush = Brush.horizontalGradient(
                                colors = listOf(
                                    Color(0xFF071326),
                                    Color(0xFF0E2A47),
                                    Color(0xFF134E6F),
                                    Color(0xFF0E2A47),
                                    Color(0xFF071326)
                                )
                            )
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "OMWAR DRAMA STUDIO",
                            color = Color.White,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 2.sp
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .width(28.dp)
                                    .height(1.dp)
                                    .background(cyanAccent)
                            )
                            Text(
                                text = "NEW VERSION",
                                color = cyanAccent,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 3.sp
                            )
                            Box(
                                modifier = Modifier
                                    .width(28.dp)
                                    .height(1.dp)
                                    .background(cyanAccent)
                            )
                        }
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    navTabs.forEach { tab ->
                        val isSelected = currentRoute == tab
                        Surface(
                            color = if (isSelected) Color(0xFF122642) else tabSurface,
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(
                                width = if (isSelected) 1.5.dp else 1.dp,
                                color = if (isSelected) cyanAccent else mutedBorder
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { currentRoute = tab }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = tab.label,
                                    color = if (isSelected) Color.White else Color(0xFF94A3B8),
                                    fontSize = 11.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            when (currentRoute) {
                StudioDestination.PRODUCTION_FORM -> ProductionFormScreen(
                    input = formInput,
                    characters = activeProject?.characters.orEmpty(),
                    isGenerating = isGenerating,
                    errorMessage = errorMessage,
                    onInputChange = { formInput = it },
                    onAddCharacter = { newChar ->
                        val base = activeProject ?: FilmProject(
                            id = UUID.randomUUID().toString(),
                            updatedAtEpochMs = System.currentTimeMillis(),
                            input = formInput
                        )
                        val newLock = ConsistencyGuide(
                            characterName = newChar.name,
                            identitySeed = "CHAR-${(base.characters.size + 1).toString().padStart(2, '0')}",
                            facialFeatures = newChar.facialDescription.ifBlank { newChar.appearance },
                            signatureOutfit = newChar.costume,
                            promptAnchor = listOf(newChar.name, newChar.appearance, newChar.costume)
                                .filter { it.isNotBlank() }
                                .joinToString(", "),
                            locked = true,
                            referenceImageUri = newChar.referenceImageUri
                        )
                        activeProject = base.copy(
                            characters = base.characters + newChar,
                            consistency = base.consistency + newLock,
                            updatedAtEpochMs = System.currentTimeMillis()
                        )
                    },
                    onDeleteCharacter = { charId ->
                        val base = activeProject ?: return@ProductionFormScreen
                        val target = base.characters.find { it.id == charId }
                        activeProject = base.copy(
                            characters = base.characters.filterNot { it.id == charId },
                            consistency = base.consistency.filterNot {
                                target != null && it.characterName.equals(target.name, ignoreCase = true)
                            },
                            updatedAtEpochMs = System.currentTimeMillis()
                        )
                    },
                    onUpdateCharacterPhoto = { charId, newUri ->
                        val base = activeProject ?: return@ProductionFormScreen
                        val target = base.characters.find { it.id == charId }
                        activeProject = base.copy(
                            characters = base.characters.map {
                                if (it.id == charId) it.copy(referenceImageUri = newUri) else it
                            },
                            consistency = base.consistency.map {
                                if (target != null && it.characterName.equals(target.name, ignoreCase = true)) {
                                    it.copy(referenceImageUri = newUri)
                                } else it
                            },
                            updatedAtEpochMs = System.currentTimeMillis()
                        )
                    },
                    onGenerateFilm = {
                        scope.launch {
                            isGenerating = true
                            errorMessage = null

                            val manualDrafts = activeProject?.characters?.map {
                                CharacterDraft(
                                    id = it.id,
                                    name = it.name,
                                    role = it.role,
                                    trait = listOf(it.appearance, it.costume)
                                        .filter { s -> s.isNotBlank() }
                                        .joinToString(" | ")
                                )
                            }.orEmpty()

                            val finalInput = formInput.copy(
                                characters = manualDrafts.ifEmpty { formInput.characters }
                            )

                            val existingPhotosByName = activeProject?.characters
                                ?.filter { it.referenceImageUri != null }
                                ?.associate { it.name.lowercase() to it.referenceImageUri }
                                .orEmpty()

                            geminiService.generateFullFilm(finalInput)
                                .onSuccess { generated ->
                                    val mergedCharacters = generated.characters.map { ch ->
                                        val savedUri = existingPhotosByName[ch.name.lowercase()]
                                        if (savedUri != null) ch.copy(referenceImageUri = savedUri) else ch
                                    }
                                    val mergedConsistency = generated.consistency.map { cg ->
                                        val savedUri = existingPhotosByName[cg.characterName.lowercase()]
                                        if (savedUri != null) cg.copy(referenceImageUri = savedUri) else cg
                                    }
                                    activeProject = generated.copy(
                                        characters = mergedCharacters,
                                        consistency = mergedConsistency
                                    )
                                    currentRoute = StudioDestination.SCRIPT_VIEW
                                }
                                .onFailure { err ->
                                    errorMessage = err.message ?: "Gagal menghasilkan produksi drama."
                                }
                            isGenerating = false
                        }
                    }
                )
                else -> ProductionResultScreen(
                    project = activeProject,
                    currentInput = formInput,
                    activeTab = currentRoute,
                    onProjectUpdate = { updated -> activeProject = updated },
                    onBackToForm = { currentRoute = StudioDestination.PRODUCTION_FORM }
                )
            }
        }
    }
}
