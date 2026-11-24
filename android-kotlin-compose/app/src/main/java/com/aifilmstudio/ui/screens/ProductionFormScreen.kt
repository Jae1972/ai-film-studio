package com.aifilmstudio.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aifilmstudio.model.FilmProductionInput

private val NavySurface = Color(0xFF0F1A2E)
private val NavyInputBg = Color(0xFF0A111F)
private val CyanAccent = Color(0xFF38BDF8)
private val CyanBorder = Color(0xFF1E3A5F)
private val TextPrimary = Color(0xFFF1F5F9)
private val TextSecondary = Color(0xFF94A3B8)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductionFormScreen(
    input: FilmProductionInput,
    isGenerating: Boolean,
    errorMessage: String?,
    onInputChange: (FilmProductionInput) -> Unit,
    onGenerateFilm: () -> Unit
) {
    val scrollState = rememberScrollState()

    val categoryOptions = listOf(
        "Drama Keluarga",
        "Sejarah & Kolosal",
        "Romansa & Penyesalan",
        "Misteri & Thriller",
        "Aksi & Bela Diri",
        "Custom Kategori"
    )
    val genreOptions = listOf("Drama", "Sejarah", "Aksi", "Horor", "Romansa", "Fantasi Gelap", "Thriller")
    val languageOptions = listOf("Indonesia", "Jawa", "Inggris", "Sunda")
    val ratioOptions = listOf("16:9", "9:16", "4:3", "1:1", "21:9", "Custom")
    val visualStyleOptions = listOf(
        "Realistic Cinematic",
        "Historical Javanese Epic",
        "Dark Moody Cinema",
        "35mm Anamorphic Film",
        "Hyper-Realistic Drama"
    )

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(maxItems = 5)
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            val combined = (input.sponsorProductImageUris + uris.map { it.toString() })
                .distinct()
                .take(5)
            onInputChange(input.copy(sponsorProductImageUris = combined))
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (!errorMessage.isNullOrBlank()) {
            Surface(
                color = Color(0xFF3F1219),
                shape = RoundedCornerShape(10.dp),
                border = BorderStroke(1.dp, Color(0xFFEF4444)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = errorMessage,
                    color = Color(0xFFFCA5A5),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }

        // PANEL UTAMA: INPUT PROYEK
        Surface(
            color = NavySurface,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, CyanBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Input Proyek",
                    color = TextPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )

                // Judul
                StudioTextField(
                    label = "Judul",
                    value = input.title,
                    placeholder = "Contoh: Prahara Mataram",
                    onValueChange = { onInputChange(input.copy(title = it)) }
                )

                // Kategori Cerita & Kategori Custom
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        StudioDropdownField(
                            label = "Kategori Cerita",
                            selected = input.storyCategory,
                            options = categoryOptions,
                            onSelect = { onInputChange(input.copy(storyCategory = it)) }
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        StudioTextField(
                            label = "Kategori custom",
                            value = input.customCategory,
                            placeholder = "Contoh: penyesalan",
                            onValueChange = {
                                onInputChange(
                                    input.copy(
                                        storyCategory = if (it.isNotBlank()) "Custom Kategori" else input.storyCategory,
                                        customCategory = it
                                    )
                                )
                            }
                        )
                    }
                }

                // Genre & Bahasa Dialog
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        StudioDropdownField(
                            label = "Genre",
                            selected = input.genre,
                            options = genreOptions,
                            onSelect = { onInputChange(input.copy(genre = it)) }
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        StudioDropdownField(
                            label = "Bahasa dialog",
                            selected = input.dialogueLanguage,
                            options = languageOptions,
                            onSelect = { onInputChange(input.copy(dialogueLanguage = it)) }
                        )
                    }
                }

                // Jumlah Episode & Durasi per Episode
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        StudioTextField(
                            label = "Jumlah episode",
                            value = input.episodeCount.toString(),
                            placeholder = "1",
                            keyboardType = KeyboardType.Number,
                            onValueChange = { raw ->
                                val num = raw.filter { it.isDigit() }.toIntOrNull()?.coerceIn(1, 50) ?: 1
                                onInputChange(input.copy(episodeCount = num))
                            }
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        StudioTextField(
                            label = "Durasi per episode (mnt)",
                            value = input.episodeDurationMinutes.toString(),
                            placeholder = "3",
                            keyboardType = KeyboardType.Number,
                            onValueChange = { raw ->
                                val num = raw.filter { it.isDigit() }.toIntOrNull()?.coerceIn(1, 120) ?: 3
                                onInputChange(
                                    input.copy(
                                        episodeDurationMinutes = num,
                                        videoDuration = "$num menit"
                                    )
                                )
                            }
                        )
                    }
                }

                // Rasio & Rasio Custom
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        StudioDropdownField(
                            label = "Rasio",
                            selected = input.aspectRatio,
                            options = ratioOptions,
                            onSelect = { onInputChange(input.copy(aspectRatio = it)) }
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        StudioTextField(
                            label = "Rasio custom",
                            value = input.customAspectRatio,
                            placeholder = "Contoh: 4:3",
                            onValueChange = {
                                onInputChange(
                                    input.copy(
                                        aspectRatio = if (it.isNotBlank()) "Custom" else input.aspectRatio,
                                        customAspectRatio = it
                                    )
                                )
                            }
                        )
                    }
                }

                // Gaya Visual
                StudioDropdownField(
                    label = "Gaya visual",
                    selected = input.visualStyle,
                    options = visualStyleOptions,
                    onSelect = { onInputChange(input.copy(visualStyle = it)) }
                )

                // Ide Cerita
                StudioTextField(
                    label = "Ide cerita",
                    value = input.premise,
                    placeholder = "Tuliskan premis utama, konflik batin, latar zaman, atau ringkasan alur cerita...",
                    singleLine = false,
                    minLines = 4,
                    onValueChange = { onInputChange(input.copy(premise = it)) }
                )

                // PANEL SPONSOR / PRODUCT PLACEMENT (OPSIONAL)
                Surface(
                    color = NavyInputBg,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, CyanBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = "Sponsor / Product Placement (Opsional)",
                                color = CyanAccent,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Sisipkan produk secara natural, maksimal 1–2 scene per episode.",
                                color = TextSecondary,
                                fontSize = 11.sp
                            )
                        }

                        StudioTextField(
                            label = "Nama Produk / Merek",
                            value = input.sponsorBrandName,
                            placeholder = "Contoh: Skincare Serum X / Batik Lurik Nusantara",
                            onValueChange = { onInputChange(input.copy(sponsorBrandName = it)) }
                        )

                        StudioTextField(
                            label = "Manfaat / Kegunaan",
                            value = input.sponsorBenefit,
                            placeholder = "Contoh: Membantu melembapkan kulit / Busana khas ksatria",
                            onValueChange = { onInputChange(input.copy(sponsorBenefit = it)) }
                        )

                        // Foto Produk (Maks. 5 Foto)
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = "Foto Produk (Maks. 5 Foto)",
                                color = TextSecondary,
                                fontSize = 12.sp
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                OutlinedButton(
                                    onClick = {
                                        photoPickerLauncher.launch(
                                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                        )
                                    },
                                    enabled = input.sponsorProductImageUris.size < 5,
                                    border = BorderStroke(1.dp, CyanAccent),
                                    shape = RoundedCornerShape(8.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(
                                        contentColor = CyanAccent
                                    )
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.AddPhotoAlternate,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Choose Files", fontSize = 12.sp)
                                }

                                Text(
                                    text = if (input.sponsorProductImageUris.isEmpty()) {
                                        "No file chosen"
                                    } else {
                                        "${input.sponsorProductImageUris.size} / 5 foto dipilih"
                                    },
                                    color = TextSecondary,
                                    fontSize = 12.sp
                                )
                            }

                            if (input.sponsorProductImageUris.isNotEmpty()) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    input.sponsorProductImageUris.forEachIndexed { idx, uriStr ->
                                        Surface(
                                            color = NavySurface,
                                            shape = RoundedCornerShape(6.dp),
                                            border = BorderStroke(1.dp, CyanBorder)
                                        ) {
                                            Row(
                                                verticalAlignment = Alignment.CenterVertically,
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                            ) {
                                                Text(
                                                    text = "Foto ${idx + 1}",
                                                    color = TextPrimary,
                                                    fontSize = 11.sp
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                IconButton(
                                                    onClick = {
                                                        val updated = input.sponsorProductImageUris.filterNot { it == uriStr }
                                                        onInputChange(input.copy(sponsorProductImageUris = updated))
                                                    },
                                                    modifier = Modifier.size(16.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Close,
                                                        contentDescription = "Hapus foto",
                                                        tint = TextSecondary,
                                                        modifier = Modifier.size(12.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Checkbox Outfit Default Karakter Utama
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(NavySurface)
                                .border(1.dp, CyanBorder, RoundedCornerShape(8.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Checkbox(
                                checked = input.useSponsorAsDefaultOutfit,
                                onCheckedChange = {
                                    onInputChange(input.copy(useSponsorAsDefaultOutfit = it))
                                },
                                colors = CheckboxDefaults.colors(
                                    checkedColor = CyanAccent,
                                    uncheckedColor = TextSecondary,
                                    checkmarkColor = NavyInputBg
                                )
                            )
                            Text(
                                text = "Jadikan produk sebagai outfit default karakter utama (khusus sponsor fashion)",
                                color = TextPrimary,
                                fontSize = 12.sp,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }

                // TOMBOL GENERATE PRODUKSI
                Button(
                    onClick = onGenerateFilm,
                    enabled = !isGenerating && input.title.isNotBlank() && input.premise.isNotBlank(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = CyanAccent,
                        contentColor = NavyInputBg,
                        disabledContainerColor = CyanBorder,
                        disabledContentColor = TextSecondary
                    )
                ) {
                    if (isGenerating) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = NavyInputBg,
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "Memproduksi Naskah & Storyboard...",
                            fontWeight = FontWeight.Bold
                        )
                    } else {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Generate Produksi Drama",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp
                        )
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun StudioTextField(
    label: String,
    value: String,
    placeholder: String,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
    onValueChange: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            color = TextSecondary,
            fontSize = 12.sp
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            minLines = minLines,
            placeholder = {
                Text(
                    text = placeholder,
                    color = TextSecondary.copy(alpha = 0.6f),
                    fontSize = 13.sp
                )
            },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            shape = RoundedCornerShape(8.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = NavyInputBg,
                unfocusedContainerColor = NavyInputBg,
                focusedBorderColor = CyanAccent,
                unfocusedBorderColor = CyanBorder,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                cursorColor = CyanAccent
            ),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StudioDropdownField(
    label: String,
    selected: String,
    options: List<String>,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            color = TextSecondary,
            fontSize = 12.sp
        )
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = !expanded }
        ) {
            OutlinedTextField(
                value = selected,
                onValueChange = {},
                readOnly = true,
                singleLine = true,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                shape = RoundedCornerShape(8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = NavyInputBg,
                    unfocusedContainerColor = NavyInputBg,
                    focusedBorderColor = CyanAccent,
                    unfocusedBorderColor = CyanBorder,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary
                ),
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth()
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                containerColor = NavySurface
            ) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(text = option, color = TextPrimary, fontSize = 13.sp) },
                        onClick = {
                            onSelect(option)
                            expanded = false
                        }
                    )
                }
            }
        }
    }
}
