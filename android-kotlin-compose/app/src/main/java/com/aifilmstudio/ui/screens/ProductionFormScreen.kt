package com.aifilmstudio.ui.screens

import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aifilmstudio.model.FilmProductionInput
import com.aifilmstudio.model.GeneratedCharacter
import java.util.UUID

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
    characters: List<GeneratedCharacter> = emptyList(),
    isGenerating: Boolean,
    errorMessage: String?,
    onInputChange: (FilmProductionInput) -> Unit,
    onAddCharacter: (GeneratedCharacter) -> Unit = {},
    onDeleteCharacter: (String) -> Unit = {},
    onUpdateCharacterPhoto: (String, String?) -> Unit = { _, _ -> },
    onGenerateFilm: () -> Unit
) {
    val scrollState = rememberScrollState()
    val context = LocalContext.current

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

    var charName by remember { mutableStateOf("") }
    var charRole by remember { mutableStateOf("Protagonis") }
    var charAge by remember { mutableStateOf("") }
    var charAppearance by remember { mutableStateOf("") }
    var charCostume by remember { mutableStateOf("") }
    var charPhotoUri by remember { mutableStateOf<String?>(null) }

    var pendingPhotoTargetId by remember { mutableStateOf<String?>(null) }

    val newCharPhotoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        if (uri != null) {
            charPhotoUri = uri.toString()
        }
    }

    val existingCharPhotoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        val targetId = pendingPhotoTargetId
        if (uri != null && targetId != null) {
            onUpdateCharacterPhoto(targetId, uri.toString())
        }
        pendingPhotoTargetId = null
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

                StudioTextField(
                    label = "Judul",
                    value = input.title,
                    placeholder = "Contoh: Sasra Bahu Mbalela",
                    onValueChange = { onInputChange(input.copy(title = it)) }
                )

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

                StudioDropdownField(
                    label = "Gaya visual",
                    selected = input.visualStyle,
                    options = visualStyleOptions,
                    onSelect = { onInputChange(input.copy(visualStyle = it)) }
                )

                StudioTextField(
                    label = "Ide cerita",
                    value = input.premise,
                    placeholder = "Tuliskan premis utama, konflik batin, latar zaman, atau ringkasan alur cerita...",
                    singleLine = false,
                    minLines = 4,
                    onValueChange = { onInputChange(input.copy(premise = it)) }
                )

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
                                text = "Data Karakter & Foto Referensi",
                                color = CyanAccent,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Tambahkan profil tokoh dan foto wajah agar konsisten di naskah & storyboard.",
                                color = TextSecondary,
                                fontSize = 11.sp
                            )
                        }

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(NavySurface)
                                .border(1.dp, CyanBorder, RoundedCornerShape(8.dp))
                                .padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            FormCharacterThumbnail(
                                uriString = charPhotoUri,
                                modifier = Modifier.size(64.dp)
                            )
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = if (charPhotoUri != null) "Foto Wajah Dipilih" else "Foto Wajah Karakter (Opsional)",
                                    color = if (charPhotoUri != null) CyanAccent else TextPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    OutlinedButton(
                                        onClick = {
                                            newCharPhotoPicker.launch(
                                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                            )
                                        },
                                        border = BorderStroke(1.dp, CyanAccent),
                                        shape = RoundedCornerShape(6.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = CyanAccent)
                                    ) {
                                        Icon(Icons.Default.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(15.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(if (charPhotoUri != null) "Ganti Foto" else "Upload Foto", fontSize = 11.sp)
                                    }
                                    if (charPhotoUri != null) {
                                        IconButton(
                                            onClick = { charPhotoUri = null },
                                            modifier = Modifier.size(30.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.DeleteOutline,
                                                contentDescription = "Hapus foto",
                                                tint = Color(0xFFF87171),
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(modifier = Modifier.weight(1.4f)) {
                                StudioTextField(
                                    label = "Nama Karakter",
                                    value = charName,
                                    placeholder = "Contoh: Ki Ageng Sabdo",
                                    onValueChange = { charName = it }
                                )
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                StudioTextField(
                                    label = "Peran",
                                    value = charRole,
                                    placeholder = "Protagonis",
                                    onValueChange = { charRole = it }
                                )
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Box(modifier = Modifier.weight(0.7f)) {
                                StudioTextField(
                                    label = "Usia",
                                    value = charAge,
                                    placeholder = "35 thn",
                                    onValueChange = { charAge = it }
                                )
                            }
                            Box(modifier = Modifier.weight(1.3f)) {
                                StudioTextField(
                                    label = "Kostum / Atribut",
                                    value = charCostume,
                                    placeholder = "Surjan lurik, blangkon, keris",
                                    onValueChange = { charCostume = it }
                                )
                            }
                        }

                        StudioTextField(
                            label = "Ciri Fisik & Wajah",
                            value = charAppearance,
                            placeholder = "Tubuh tegap, rahang tegas, tatapan tajam...",
                            onValueChange = { charAppearance = it }
                        )

                        OutlinedButton(
                            onClick = {
                                val created = GeneratedCharacter(
                                    id = "char_${UUID.randomUUID().toString().take(6)}",
                                    name = charName.trim(),
                                    role = charRole.ifBlank { "Protagonis" }.trim(),
                                    age = charAge.trim(),
                                    appearance = charAppearance.trim(),
                                    facialDescription = charAppearance.trim(),
                                    costume = charCostume.trim(),
                                    referenceImageUri = charPhotoUri
                                )
                                onAddCharacter(created)
                                charName = ""
                                charAge = ""
                                charAppearance = ""
                                charCostume = ""
                                charPhotoUri = null
                                Toast.makeText(context, "Karakter ditambahkan!", Toast.LENGTH_SHORT).show()
                            },
                            enabled = charName.isNotBlank(),
                            border = BorderStroke(1.dp, if (charName.isNotBlank()) CyanAccent else CyanBorder),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = CyanAccent,
                                disabledContentColor = TextSecondary
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Tambah Karakter ke Daftar", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                        }

                        if (characters.isNotEmpty()) {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(
                                    text = "Karakter Terdaftar (${characters.size})",
                                    color = TextPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                characters.forEach { item ->
                                    Surface(
                                        color = NavySurface,
                                        shape = RoundedCornerShape(8.dp),
                                        border = BorderStroke(1.dp, CyanBorder),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            FormCharacterThumbnail(
                                                uriString = item.referenceImageUri,
                                                modifier = Modifier.size(48.dp)
                                            )
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = "${item.name} (${item.role})",
                                                    color = CyanAccent,
                                                    fontSize = 13.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                if (item.costume.isNotBlank() || item.appearance.isNotBlank()) {
                                                    Text(
                                                        text = listOf(item.appearance, item.costume)
                                                            .filter { it.isNotBlank() }
                                                            .joinToString(" • "),
                                                        color = TextSecondary,
                                                        fontSize = 11.sp,
                                                        maxLines = 2
                                                    )
                                                }
                                            }
                                            IconButton(
                                                onClick = {
                                                    pendingPhotoTargetId = item.id
                                                    existingCharPhotoPicker.launch(
                                                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                                    )
                                                },
                                                modifier = Modifier.size(30.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.AddPhotoAlternate,
                                                    contentDescription = "Ubah foto",
                                                    tint = CyanAccent,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                            IconButton(
                                                onClick = { onDeleteCharacter(item.id) },
                                                modifier = Modifier.size(30.dp)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.DeleteOutline,
                                                    contentDescription = "Hapus karakter",
                                                    tint = Color(0xFFF87171),
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

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
private fun FormCharacterThumbnail(
    uriString: String?,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val bitmap: ImageBitmap? = remember(uriString) {
        if (uriString.isNullOrBlank()) {
            null
        } else {
            runCatching {
                val uri = Uri.parse(uriString)
                context.contentResolver.openInputStream(uri)?.use { stream ->
                    BitmapFactory.decodeStream(stream)?.asImageBitmap()
                }
            }.getOrNull()
        }
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(NavyInputBg)
            .border(1.dp, if (bitmap != null) CyanAccent else CyanBorder, RoundedCornerShape(8.dp)),
        contentAlignment = Alignment.Center
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap,
                contentDescription = "Foto Karakter",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Icon(
                imageVector = Icons.Default.AddPhotoAlternate,
                contentDescription = null,
                tint = TextSecondary,
                modifier = Modifier.size(22.dp)
            )
        }
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
