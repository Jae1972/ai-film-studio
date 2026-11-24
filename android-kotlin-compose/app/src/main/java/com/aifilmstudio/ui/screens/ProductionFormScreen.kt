package com.aifilmstudio.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.aifilmstudio.model.CharacterDraft
import com.aifilmstudio.model.FilmProductionInput
import com.aifilmstudio.ui.theme.StudioColors

@Composable
fun ProductionFormScreen(
    input: FilmProductionInput,
    isGenerating: Boolean,
    errorMessage: String?,
    onInputChange: (FilmProductionInput) -> Unit,
    onGenerateFilm: () -> Unit
) {
    val genres = listOf("Drama", "Thriller", "Sci-Fi", "Horor", "Romansa", "Aksi", "Misteri")
    val languages = listOf("Bahasa Indonesia", "English", "Bahasa Jawa", "Bahasa Sunda", "Bahasa Jepang")
    val durations = listOf("30 detik", "60 detik", "3 menit", "5 menit")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Konfigurasi Produksi Film",
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = "Lengkapi parameter film pendek Anda untuk menghasilkan cerita, naskah, karakter, konsistensi visual, adegan, dan storyboard melalui Gemini API.",
            style = MaterialTheme.typography.bodyMedium
        )

        if (!errorMessage.isNullOrBlank()) {
            Surface(
                color = StudioColors.ErrorCrimson.copy(alpha = 0.14f),
                border = BorderStroke(1.dp, StudioColors.ErrorCrimson.copy(alpha = 0.4f)),
                shape = MaterialTheme.shapes.medium
            ) {
                Text(
                    text = errorMessage,
                    modifier = Modifier.padding(14.dp),
                    color = StudioColors.TextPrimary
                )
            }
        }

        OutlinedTextField(
            value = input.title,
            onValueChange = { onInputChange(input.copy(title = it)) },
            label = { Text("Judul Film") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = input.premise,
            onValueChange = { onInputChange(input.copy(premise = it)) },
            label = { Text("Cerita / Premis Utama") },
            minLines = 4,
            modifier = Modifier.fillMaxWidth()
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedTextField(
                value = input.episodeCount.toString(),
                onValueChange = { raw ->
                    val parsed = raw.toIntOrNull()?.coerceIn(1, 20) ?: 1
                    onInputChange(input.copy(episodeCount = parsed))
                },
                label = { Text("Jumlah Episode") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = input.sceneCount.toString(),
                onValueChange = { raw ->
                    val parsed = raw.toIntOrNull()?.coerceIn(1, 30) ?: 4
                    onInputChange(input.copy(sceneCount = parsed))
                },
                label = { Text("Jumlah Adegan") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
        }

        Text("Genre: ${input.genre}", style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            genres.take(4).forEach { genre ->
                FilterChip(
                    selected = input.genre == genre,
                    onClick = { onInputChange(input.copy(genre = genre)) },
                    label = { Text(genre) }
                )
            }
        }

        Text("Bahasa Dialog: ${input.dialogueLanguage}", style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            languages.take(3).forEach { lang ->
                FilterChip(
                    selected = input.dialogueLanguage == lang,
                    onClick = { onInputChange(input.copy(dialogueLanguage = lang)) },
                    label = { Text(lang) }
                )
            }
        }

        Text("Durasi Video: ${input.videoDuration}", style = MaterialTheme.typography.labelMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            durations.forEach { dur ->
                FilterChip(
                    selected = input.videoDuration == dur,
                    onClick = { onInputChange(input.copy(videoDuration = dur)) },
                    label = { Text(dur) }
                )
            }
        }

        HorizontalDivider(color = StudioColors.BorderHairline)

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Daftar Karakter (${input.characters.size})", style = MaterialTheme.typography.titleMedium)
            TextButton(onClick = {
                val next = input.characters + CharacterDraft(
                    id = "char_${System.currentTimeMillis()}",
                    name = "",
                    role = "Pemeran Utama",
                    trait = ""
                )
                onInputChange(input.copy(characters = next))
            }) {
                Text("+ Tambah Karakter")
            }
        }

        input.characters.forEachIndexed { index, charDraft ->
            Surface(
                color = StudioColors.Surface,
                border = BorderStroke(1.dp, StudioColors.BorderHairline),
                shape = MaterialTheme.shapes.medium
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = charDraft.name,
                        onValueChange = { updatedName ->
                            val list = input.characters.toMutableList()
                            list[index] = charDraft.copy(name = updatedName)
                            onInputChange(input.copy(characters = list))
                        },
                        label = { Text("Nama Karakter") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = charDraft.trait,
                        onValueChange = { updatedTrait ->
                            val list = input.characters.toMutableList()
                            list[index] = charDraft.copy(trait = updatedTrait)
                            onInputChange(input.copy(characters = list))
                        },
                        label = { Text("Sifat & Latar Singkat") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }

        Button(
            onClick = onGenerateFilm,
            enabled = !isGenerating && input.title.isNotBlank() && input.premise.isNotBlank(),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = StudioColors.AccentAmber,
                contentColor = StudioColors.AccentAmberInk
            )
        ) {
            if (isGenerating) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = StudioColors.AccentAmberInk
                )
                Spacer(Modifier.width(10.dp))
                Text("Memproduksi Film via Gemini...")
            } else {
                Text("Generate Film")
            }
        }
    }
}
