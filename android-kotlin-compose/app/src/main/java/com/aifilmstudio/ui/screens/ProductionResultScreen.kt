package com.aifilmstudio.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aifilmstudio.model.FilmProject
import com.aifilmstudio.ui.theme.StudioColors

@Composable
fun ProductionResultScreen(
    project: FilmProject?,
    onBackToForm: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Hasil Produksi Film", style = MaterialTheme.typography.headlineMedium)

        if (project == null || project.story == null) {
            Surface(
                color = StudioColors.Surface,
                border = BorderStroke(1.dp, StudioColors.BorderHairline),
                shape = MaterialTheme.shapes.medium
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        "Belum ada hasil produksi dari Gemini API.",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        "Isi formulir produksi dan tekan Generate Film untuk menghasilkan cerita, naskah, karakter, dan storyboard nyata.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Button(onClick = onBackToForm) {
                        Text("Buka Formulir Produksi")
                    }
                }
            }
            return
        }

        Text(
            text = "${project.input.title} · ${project.input.genre} · ${project.input.episodeCount} Episode · ${project.scenes.size} Adegan",
            style = MaterialTheme.typography.labelMedium
        )

        Surface(
            color = StudioColors.Surface,
            border = BorderStroke(1.dp, StudioColors.BorderHairline),
            shape = MaterialTheme.shapes.medium
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Logline & Sinopsis", style = MaterialTheme.typography.titleMedium)
                Text(project.story.logline, color = StudioColors.AccentAmber)
                Text(project.story.synopsis, style = MaterialTheme.typography.bodyMedium)
            }
        }

        Text("Karakter (${project.characters.size})", style = MaterialTheme.typography.titleMedium)
        project.characters.forEach { character ->
            Surface(
                color = StudioColors.Surface,
                border = BorderStroke(1.dp, StudioColors.BorderHairline),
                shape = MaterialTheme.shapes.medium
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${character.name} · ${character.role}", style = MaterialTheme.typography.titleMedium)
                    Text(character.appearance, style = MaterialTheme.typography.bodyMedium)
                    Text("Kostum: ${character.costume}", style = MaterialTheme.typography.labelMedium)
                }
            }
        }

        Text("Naskah Skenario (${project.script.size} Adegan)", style = MaterialTheme.typography.titleMedium)
        project.script.forEach { block ->
            Surface(
                color = StudioColors.Surface,
                border = BorderStroke(1.dp, StudioColors.BorderHairline),
                shape = MaterialTheme.shapes.medium
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(block.slugline, color = StudioColors.AccentAmber)
                    Text(block.action, style = MaterialTheme.typography.bodyMedium)
                    block.dialogues.forEach { dlg ->
                        Text("${dlg.character}: ${dlg.line}", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}
