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
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MovieCreation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aifilmstudio.model.FilmProductionInput
import com.aifilmstudio.model.FilmProject
import com.aifilmstudio.model.GeneratedCharacter
import com.aifilmstudio.model.StudioDestination
import java.util.UUID

private val OmwarNavySurface = Color(0xFF0F1A2E)
private val OmwarNavyInputBg = Color(0xFF0A111F)
private val OmwarCyanAccent = Color(0xFF38BDF8)
private val OmwarCyanBorder = Color(0xFF1E3A5F)
private val OmwarTextPrimary = Color(0xFFF1F5F9)
private val OmwarTextSecondary = Color(0xFF94A3B8)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OmwarInputTabScreen(
    input: FilmProductionInput,
    characters: List<GeneratedCharacter>,
    isGenerating: Boolean,
    errorMessage: String?,
    onInputChange: (FilmProductionInput) -> Unit,
    onAddCharacter: (GeneratedCharacter) -> Unit,
    onDeleteCharacter: (String) -> Unit,
    onUpdateCharacterPhoto: (String, String?) -> Unit,
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
        if (uri != null) charPhotoUri = uri.toString()
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
            color = OmwarNavySurface,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, OmwarCyanBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = "Input Proyek",
                    color = OmwarTextPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )

                OmwarTextField(
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
                        OmwarDropdownField(
                            label = "Kategori Cerita",
                            selected = input.storyCategory,
                            options = categoryOptions,
                            onSelect = { onInputChange(input.copy(storyCategory = it)) }
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        OmwarTextField(
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
                        OmwarDropdownField(
                            label = "Genre",
                            selected = input.genre,
                            options = genreOptions,
                            onSelect = { onInputChange(input.copy(genre = it)) }
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        OmwarDropdownField(
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
                        OmwarTextField(
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
                        OmwarTextField(
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
                        OmwarDropdownField(
                            label = "Rasio",
                            selected = input.aspectRatio,
                            options = ratioOptions,
                            onSelect = { onInputChange(input.copy(aspectRatio = it)) }
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        OmwarTextField(
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

                OmwarDropdownField(
                    label = "Gaya visual",
                    selected = input.visualStyle,
                    options = visualStyleOptions,
                    onSelect = { onInputChange(input.copy(visualStyle = it)) }
                )

                OmwarTextField(
                    label = "Ide cerita",
                    value = input.premise,
                    placeholder = "Tuliskan premis utama, konflik batin, latar zaman, atau ringkasan alur cerita...",
                    singleLine = false,
                    minLines = 4,
                    onValueChange = { onInputChange(input.copy(premise = it)) }
                )

                // DATA KARAKTER & FOTO REFERENSI
                Surface(
                    color = OmwarNavyInputBg,
                    shape = RoundedCornerShape(10.dp),
                    border = BorderStroke(1.dp, OmwarCyanBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                text = "Data Karakter & Foto Referensi",
                                color = OmwarCyanAccent,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Tambahkan profil tokoh dan foto wajah agar konsisten di naskah & storyboard.",
                                color = OmwarTextSecondary,
                                fontSize = 11.sp
                            )
                        }

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(OmwarNavySurface)
                                .border(1.dp, OmwarCyanBorder, RoundedCornerShape(8.dp))
                                .padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            OmwarPhotoThumbnail(
                                uriString = charPhotoUri,
                                modifier = Modifier.size(64.dp)
                            )
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = if (charPhotoUri != null) "Foto Wajah Dipilih" else "Foto Wajah Karakter (Opsional)",
                                    color = if (charPhotoUri != null) OmwarCyanAccent else OmwarTextPrimary,
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
                                        border = BorderStroke(1.dp, OmwarCyanAccent),
                                        shape = RoundedCornerShape(6.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = OmwarCyanAccent)
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
                                OmwarTextField(
                                    label = "Nama Karakter",
                                    value = charName,
                                    placeholder = "Contoh: Ki Ageng Sabdo",
                                    onValueChange = { charName = it }
                                )
                            }
                            Box(modifier = Modifier.weight(1f)) {
                                OmwarTextField(
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
                                OmwarTextField(
                                    label = "Usia",
                                    value = charAge,
                                    placeholder = "35 thn",
                                    onValueChange = { charAge = it }
                                )
                            }
                            Box(modifier = Modifier.weight(1.3f)) {
                                OmwarTextField(
                                    label = "Kostum / Atribut",
                                    value = charCostume,
                                    placeholder = "Surjan lurik, blangkon, keris",
                                    onValueChange = { charCostume = it }
                                )
                            }
                        }

                        OmwarTextField(
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
                            border = BorderStroke(1.dp, if (charName.isNotBlank()) OmwarCyanAccent else OmwarCyanBorder),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = OmwarCyanAccent,
                                disabledContentColor = OmwarTextSecondary
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
                                    color = OmwarTextPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                characters.forEach { item ->
                                    Surface(
                                        color = OmwarNavySurface,
                                        shape = RoundedCornerShape(8.dp),
                                        border = BorderStroke(1.dp, OmwarCyanBorder),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(10.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            OmwarPhotoThumbnail(
                                                uriString = item.referenceImageUri,
                                                modifier = Modifier.size(48.dp)
                                            )
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(
                                                    text = "${item.name} (${item.role})",
                                                    color = OmwarCyanAccent,
                                                    fontSize = 13.sp,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                if (item.costume.isNotBlank() || item.appearance.isNotBlank()) {
                                                    Text(
                                                        text = listOf(item.appearance, item.costume)
                                                            .filter { it.isNotBlank() }
                                                            .joinToString(" • "),
                                                        color = OmwarTextSecondary,
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
                                                    tint = OmwarCyanAccent,
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
                        containerColor = OmwarCyanAccent,
                        contentColor = OmwarNavyInputBg,
                        disabledContainerColor = OmwarCyanBorder,
                        disabledContentColor = OmwarTextSecondary
                    )
                ) {
                    if (isGenerating) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = OmwarNavyInputBg,
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
fun OmwarResultTabsScreen(
    project: FilmProject?,
    currentInput: FilmProductionInput,
    activeTab: StudioDestination,
    onProjectUpdate: (FilmProject) -> Unit,
    onBackToForm: () -> Unit
) {
    val scrollState = rememberScrollState()
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    if (activeTab == StudioDestination.CHARACTER_VIEW) {
        val workingProject = project ?: FilmProject(
            id = UUID.randomUUID().toString(),
            updatedAtEpochMs = System.currentTimeMillis(),
            input = currentInput
        )

        var pendingCharacterTarget by remember { mutableStateOf<Pair<String, String>?>(null) }
        val characterPhotoPicker = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.PickVisualMedia()
        ) { uri: Uri? ->
            val target = pendingCharacterTarget
            if (uri != null && target != null) {
                val updatedChars = workingProject.characters.map { ch ->
                    if (ch.id == target.first || ch.name.equals(target.second, ignoreCase = true)) {
                        ch.copy(referenceImageUri = uri.toString())
                    } else ch
                }
                val updatedConsistency = workingProject.consistency.map { cg ->
                    if (cg.characterName.equals(target.second, ignoreCase = true)) {
                        cg.copy(referenceImageUri = uri.toString())
                    } else cg
                }
                onProjectUpdate(
                    workingProject.copy(
                        characters = updatedChars,
                        consistency = updatedConsistency,
                        updatedAtEpochMs = System.currentTimeMillis()
                    )
                )
            }
            pendingCharacterTarget = null
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            OmwarCard(title = "Daftar Karakter (${workingProject.characters.size} Tokoh)") {
                if (workingProject.characters.isEmpty()) {
                    Text(
                        text = "Belum ada tokoh. Tambahkan karakter di tab 1. Input atau tekan Generate Produksi Drama.",
                        color = OmwarTextSecondary,
                        fontSize = 13.sp
                    )
                } else {
                    workingProject.characters.forEach { char ->
                        Surface(
                            color = OmwarNavyInputBg,
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, OmwarCyanBorder),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = char.name,
                                        color = OmwarCyanAccent,
                                        fontSize = 15.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Surface(
                                        color = Color(0xFF122642),
                                        shape = RoundedCornerShape(6.dp),
                                        border = BorderStroke(1.dp, OmwarCyanAccent)
                                    ) {
                                        Text(
                                            text = if (char.age.isNotBlank()) "${char.role} • ${char.age}" else char.role,
                                            color = OmwarTextPrimary,
                                            fontSize = 11.sp,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                        )
                                    }
                                }

                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(OmwarNavySurface)
                                        .border(1.dp, OmwarCyanBorder, RoundedCornerShape(8.dp))
                                        .padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                                ) {
                                    OmwarPhotoThumbnail(
                                        uriString = char.referenceImageUri,
                                        modifier = Modifier.size(64.dp)
                                    )
                                    Column(
                                        modifier = Modifier.weight(1f),
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Text(
                                            text = if (char.referenceImageUri != null) "Foto Referensi Terkunci" else "Foto Referensi Karakter",
                                            color = if (char.referenceImageUri != null) OmwarCyanAccent else OmwarTextPrimary,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                        OutlinedButton(
                                            onClick = {
                                                pendingCharacterTarget = Pair(char.id, char.name)
                                                characterPhotoPicker.launch(
                                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                                )
                                            },
                                            border = BorderStroke(1.dp, OmwarCyanAccent),
                                            shape = RoundedCornerShape(6.dp),
                                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                            colors = ButtonDefaults.outlinedButtonColors(contentColor = OmwarCyanAccent)
                                        ) {
                                            Icon(Icons.Default.AddPhotoAlternate, contentDescription = null, modifier = Modifier.size(15.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(if (char.referenceImageUri != null) "Ganti Foto" else "Upload Foto", fontSize = 11.sp)
                                        }
                                    }
                                }

                                if (char.appearance.isNotBlank()) OmwarDetailRow("Fisik", char.appearance)
                                if (char.facialDescription.isNotBlank() && char.facialDescription != char.appearance) {
                                    OmwarDetailRow("Wajah", char.facialDescription)
                                }
                                if (char.hairDescription.isNotBlank()) OmwarDetailRow("Rambut", char.hairDescription)
                                if (char.personality.isNotBlank()) OmwarDetailRow("Karakter", char.personality)
                                if (char.costume.isNotBlank()) OmwarDetailRow("Kostum", char.costume)
                                if (char.voiceTone.isNotBlank()) OmwarDetailRow("Suara", char.voiceTone)
                            }
                        }
                    }
                }
            }

            if (workingProject.consistency.isNotEmpty()) {
                OmwarCard(title = "Jangkar Konsistensi Visual (Identity Lock)") {
                    workingProject.consistency.forEach { guide ->
                        Surface(
                            color = OmwarNavyInputBg,
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, OmwarCyanBorder),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    if (guide.referenceImageUri != null) {
                                        OmwarPhotoThumbnail(uriString = guide.referenceImageUri, modifier = Modifier.size(40.dp))
                                    } else {
                                        Icon(Icons.Default.Lock, contentDescription = null, tint = OmwarCyanAccent, modifier = Modifier.size(16.dp))
                                    }
                                    Text(
                                        text = "${guide.characterName} (${guide.identitySeed})",
                                        color = OmwarCyanAccent,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                if (guide.facialFeatures.isNotBlank()) OmwarDetailRow("Fitur Wajah", guide.facialFeatures)
                                if (guide.signatureOutfit.isNotBlank()) OmwarDetailRow("Outfit Utama", guide.signatureOutfit)
                                if (guide.promptAnchor.isNotBlank()) OmwarDetailRow("Prompt Anchor", guide.promptAnchor)

                                OutlinedButton(
                                    onClick = {
                                        clipboardManager.setText(AnnotatedString(guide.promptAnchor))
                                        Toast.makeText(context, "Prompt karakter disalin!", Toast.LENGTH_SHORT).show()
                                    },
                                    border = BorderStroke(1.dp, OmwarCyanAccent),
                                    shape = RoundedCornerShape(8.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = OmwarCyanAccent),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Salin Prompt Konsistensi Karakter", fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
        return
    }

    if (project == null || (project.story == null && project.script.isEmpty() && project.scenes.isEmpty())) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            Surface(
                color = OmwarNavySurface,
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, OmwarCyanBorder),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.MovieCreation,
                        contentDescription = null,
                        tint = OmwarCyanAccent,
                        modifier = Modifier.size(36.dp)
                    )
                    Text(
                        text = "Belum Ada Hasil Produksi",
                        color = OmwarTextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Lengkapi pengaturan proyek & karakter di tab 1. Input lalu tekan Generate Produksi Drama.",
                        color = OmwarTextSecondary,
                        fontSize = 13.sp
                    )
                    Button(
                        onClick = onBackToForm,
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = OmwarCyanAccent,
                            contentColor = OmwarNavyInputBg
                        )
                    ) {
                        Text("Kembali ke 1. Input", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Surface(
            color = OmwarNavySurface,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, OmwarCyanBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = project.input.title.ifBlank { "PROYEK DRAMA" }.uppercase(),
                    color = OmwarCyanAccent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${project.input.genre} • ${project.input.episodeCount} Episode (${project.input.episodeDurationMinutes} mnt) • Rasio ${project.input.aspectRatio}",
                    color = OmwarTextSecondary,
                    fontSize = 12.sp
                )
            }
        }

        if (activeTab == StudioDestination.SCRIPT_VIEW) {
            project.story?.let { story ->
                OmwarCard(title = "Logline & Sinopsis") {
                    Text(
                        text = "\"${story.logline}\"",
                        color = OmwarCyanAccent,
                        fontSize = 13.sp,
                        fontStyle = FontStyle.Italic,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = story.synopsis,
                        color = OmwarTextPrimary,
                        fontSize = 13.sp,
                        lineHeight = 19.sp
                    )
                }

                if (story.episodeOutlines.isNotEmpty()) {
                    OmwarCard(title = "Struktur Episode") {
                        story.episodeOutlines.forEach { ep ->
                            Surface(
                                color = OmwarNavyInputBg,
                                shape = RoundedCornerShape(8.dp),
                                border = BorderStroke(1.dp, OmwarCyanBorder),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(
                                    modifier = Modifier.padding(12.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = "Episode ${ep.episodeNumber}: ${ep.title}",
                                        color = OmwarCyanAccent,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(text = ep.summary, color = OmwarTextPrimary, fontSize = 12.sp)
                                    if (ep.cliffhanger.isNotBlank()) {
                                        Text(text = "Cliffhanger: ${ep.cliffhanger}", color = Color(0xFFFBBF24), fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            OmwarCard(title = "Naskah Skenario (${project.script.size} Adegan)") {
                project.script.forEach { block ->
                    Surface(
                        color = OmwarNavyInputBg,
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, OmwarCyanBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = "ADEGAN ${block.sceneNumber} — ${block.slugline}",
                                color = OmwarCyanAccent,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(text = block.action, color = OmwarTextPrimary, fontSize = 12.sp, lineHeight = 18.sp)
                            block.dialogues.forEach { dlg ->
                                Column(modifier = Modifier.padding(start = 10.dp, top = 4.dp)) {
                                    Text(
                                        text = dlg.character.uppercase(),
                                        color = Color(0xFF7DD3FC),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    if (dlg.parenthetical.isNotBlank()) {
                                        Text(
                                            text = dlg.parenthetical,
                                            color = OmwarTextSecondary,
                                            fontSize = 11.sp,
                                            fontStyle = FontStyle.Italic
                                        )
                                    }
                                    Text(text = dlg.line, color = OmwarTextPrimary, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }
            }
        } else {
            OmwarCard(title = "Breakdown Adegan (${project.scenes.size} Scene)") {
                project.scenes.forEach { scene ->
                    Surface(
                        color = OmwarNavyInputBg,
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, OmwarCyanBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "Scene ${scene.sceneNumber} (Ep. ${scene.episodeNumber}) — ${scene.heading}",
                                color = OmwarCyanAccent,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            OmwarDetailRow("Lokasi", scene.location)
                            OmwarDetailRow("Kamera & Cahaya", "${scene.cameraMovement} • ${scene.lighting}")
                            OmwarDetailRow("Aksi", scene.actionSummary)
                            if (scene.charactersInvolved.isNotEmpty()) {
                                OmwarDetailRow("Tokoh", scene.charactersInvolved.joinToString(", "))
                            }
                        }
                    }
                }
            }

            OmwarCard(title = "Storyboard & Visual Prompt (${project.storyboard.size} Frame)") {
                project.storyboard.forEach { frame ->
                    Surface(
                        color = OmwarNavyInputBg,
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, OmwarCyanBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Frame #${frame.frameNumber} (Scene ${frame.sceneNumber})",
                                    color = OmwarCyanAccent,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(text = "${frame.durationSeconds} dtk", color = OmwarTextSecondary, fontSize = 12.sp)
                            }
                            OmwarDetailRow("Sinematografi", "${frame.shotType} • ${frame.cameraAngle} • ${frame.lensMm}")
                            if (frame.location.isNotBlank()) OmwarDetailRow("Lokasi", frame.location)
                            OmwarDetailRow("Visual", frame.visualDescription)
                            if (frame.dialogue.isNotBlank()) OmwarDetailRow("Dialog", "\"${frame.dialogue}\"")
                            OmwarDetailRow("AI Prompt", frame.visualPrompt)

                            OutlinedButton(
                                onClick = {
                                    clipboardManager.setText(AnnotatedString(frame.visualPrompt))
                                    Toast.makeText(context, "Visual prompt disalin!", Toast.LENGTH_SHORT).show()
                                },
                                border = BorderStroke(1.dp, OmwarCyanAccent),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = OmwarCyanAccent),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Salin Visual Prompt Frame #${frame.frameNumber}", fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun OmwarCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        color = OmwarNavySurface,
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, OmwarCyanBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(text = title, color = OmwarTextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun OmwarDetailRow(label: String, value: String) {
    Text(text = "$label: $value", color = OmwarTextPrimary, fontSize = 12.sp, lineHeight = 17.sp)
}

@Composable
private fun OmwarPhotoThumbnail(uriString: String?, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val bitmap: ImageBitmap? = remember(uriString) {
        if (uriString.isNullOrBlank()) null
        else runCatching {
            val uri = Uri.parse(uriString)
            context.contentResolver.openInputStream(uri)?.use { stream ->
                BitmapFactory.decodeStream(stream)?.asImageBitmap()
            }
        }.getOrNull()
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(OmwarNavyInputBg)
            .border(1.dp, if (bitmap != null) OmwarCyanAccent else OmwarCyanBorder, RoundedCornerShape(8.dp)),
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
            Icon(Icons.Default.AddPhotoAlternate, contentDescription = null, tint = OmwarTextSecondary, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun OmwarTextField(
    label: String,
    value: String,
    placeholder: String,
    singleLine: Boolean = true,
    minLines: Int = 1,
    keyboardType: KeyboardType = KeyboardType.Text,
    onValueChange: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = label, color = OmwarTextSecondary, fontSize = 12.sp)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            minLines = minLines,
            placeholder = {
                Text(text = placeholder, color = OmwarTextSecondary.copy(alpha = 0.6f), fontSize = 13.sp)
            },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            shape = RoundedCornerShape(8.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = OmwarNavyInputBg,
                unfocusedContainerColor = OmwarNavyInputBg,
                focusedBorderColor = OmwarCyanAccent,
                unfocusedBorderColor = OmwarCyanBorder,
                focusedTextColor = OmwarTextPrimary,
                unfocusedTextColor = OmwarTextPrimary,
                cursorColor = OmwarCyanAccent
            ),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OmwarDropdownField(
    label: String,
    selected: String,
    options: List<String>,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = label, color = OmwarTextSecondary, fontSize = 12.sp)
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
                    focusedContainerColor = OmwarNavyInputBg,
                    unfocusedContainerColor = OmwarNavyInputBg,
                    focusedBorderColor = OmwarCyanAccent,
                    unfocusedBorderColor = OmwarCyanBorder,
                    focusedTextColor = OmwarTextPrimary,
                    unfocusedTextColor = OmwarTextPrimary
                ),
                modifier = Modifier
                    .menuAnchor()
                    .fillMaxWidth()
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                containerColor = OmwarNavySurface
            ) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(text = option, color = OmwarTextPrimary, fontSize = 13.sp) },
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
