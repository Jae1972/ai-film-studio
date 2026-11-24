package com.aifilmstudio

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aifilmstudio.data.remote.GeminiStudioService
import com.aifilmstudio.model.FilmProductionInput
import com.aifilmstudio.model.FilmProject
import com.aifilmstudio.model.StudioDestination
import com.aifilmstudio.ui.screens.ProductionFormScreen
import com.aifilmstudio.ui.screens.ProductionResultScreen
import com.aifilmstudio.ui.theme.AiFilmStudioTheme
import com.aifilmstudio.ui.theme.StudioColors
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val geminiService = GeminiStudioService(baseBackendUrl = "https://YOUR_CLOUD_RUN_BACKEND_URL")

        setContent {
            AiFilmStudioTheme {
                AiFilmStudioApp(geminiService = geminiService)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiFilmStudioApp(geminiService: GeminiStudioService) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var currentRoute by remember { mutableStateOf(StudioDestination.PRODUCTION_FORM) }
    var formInput by remember { mutableStateOf(FilmProductionInput()) }
    var activeProject by remember { mutableStateOf<FilmProject?>(null) }
    var isGenerating by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(drawerContainerColor = StudioColors.Surface) {
                Text(
                    text = "AI FILM STUDIO",
                    modifier = Modifier.padding(20.dp),
                    style = MaterialTheme.typography.titleMedium,
                    color = StudioColors.AccentAmber
                )
                HorizontalDivider(color = StudioColors.BorderHairline)
                StudioDestination.entries.forEach { dest ->
                    NavigationDrawerItem(
                        label = { Text(dest.label) },
                        selected = currentRoute == dest,
                        onClick = {
                            currentRoute = dest
                            scope.launch { drawerState.close() }
                        },
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
                    )
                }
            }
        }
    ) {
        Scaffold(
            containerColor = StudioColors.Background,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = StudioColors.Surface),
                    title = { Text(currentRoute.label) },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Buka Navigasi")
                        }
                    }
                )
            }
        ) { innerPadding ->
            Box(modifier = Modifier.padding(innerPadding)) {
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
                                        currentRoute = StudioDestination.PRODUCTION_RESULT
                                    }
                                    .onFailure { err ->
                                        errorMessage = err.message ?: "Gagal menghasilkan produksi film."
                                    }
                                isGenerating = false
                            }
                        }
                    )
                    StudioDestination.PRODUCTION_RESULT -> ProductionResultScreen(
                        project = activeProject,
                        onBackToForm = { currentRoute = StudioDestination.PRODUCTION_FORM }
                    )
                    else -> ProductionResultScreen(
                        project = activeProject,
                        onBackToForm = { currentRoute = StudioDestination.PRODUCTION_FORM }
                    )
                }
            }
        }
    }
}
