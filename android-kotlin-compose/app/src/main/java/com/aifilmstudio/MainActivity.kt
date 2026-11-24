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
import com.aifilmstudio.model.FilmProductionInput
import com.aifilmstudio.model.FilmProject
import com.aifilmstudio.model.StudioDestination
import com.aifilmstudio.ui.screens.ProductionFormScreen
import com.aifilmstudio.ui.screens.ProductionResultScreen
import com.aifilmstudio.ui.theme.AiFilmStudioTheme
import kotlinx.coroutines.launch

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
                // BANNER HEADER: OMWAR DRAMA STUDIO
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

                // 4 TAB NAVIGASI: 1. Input | 2. Naskah | 3. Karakter | 4. Produksi
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
                    isGenerating = isGenerating,
                    errorMessage = errorMessage,
                    onInputChange = { formInput = it },
                    onGenerateFilm = {
                        scope.launch {
                            isGenerating = true
                            errorMessage = null
                            geminiService.generateFullFilm(formInput)
                                .onSuccess { generated ->
                                    activeProject = generated
                                    currentRoute = StudioDestination.SCRIPT_VIEW
                                }
                                .onFailure { err ->
                                    errorMessage = err.message ?: "Gagal menghasilkan produksi drama."
                                }
                            isGenerating = false
                        }
                    }
                )
                StudioDestination.SCRIPT_VIEW -> {
                    val scriptOnlyProject = activeProject?.copy(
                        characters = emptyList(),
                        consistency = emptyList(),
                        scenes = emptyList(),
                        storyboard = emptyList()
                    )
                    ProductionResultScreen(
                        project = scriptOnlyProject,
                        onBackToForm = { currentRoute = StudioDestination.PRODUCTION_FORM }
                    )
                }
                StudioDestination.CHARACTER_VIEW -> {
                    val characterOnlyProject = activeProject?.copy(
                        story = null,
                        scenes = emptyList(),
                        script = emptyList(),
                        storyboard = emptyList()
                    )
                    ProductionResultScreen(
                        project = characterOnlyProject,
                        onBackToForm = { currentRoute = StudioDestination.PRODUCTION_FORM }
                    )
                }
                else -> {
                    val productionOnlyProject = activeProject?.copy(
                        story = null,
                        characters = emptyList(),
                        consistency = emptyList(),
                        script = emptyList()
                    )
                    ProductionResultScreen(
                        project = productionOnlyProject,
                        onBackToForm = { currentRoute = StudioDestination.PRODUCTION_FORM }
                    )
                }
            }
        }
    }
}
