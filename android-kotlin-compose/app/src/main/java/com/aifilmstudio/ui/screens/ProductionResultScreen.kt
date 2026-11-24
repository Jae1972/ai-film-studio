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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aifilmstudio.model.FilmProject
import com.aifilmstudio.model.StudioDestination

private val NavySurface = Color(0xFF0F1A2E)
private val NavyInputBg = Color(0xFF0A111F)
private val CyanAccent = Color(0xFF38BDF8)
private val CyanBorder = Color(0xFF1E3A5F)
private val TextPrimary = Color(0xFFF1F5F9)
private val TextSecondary = Color(0xFF94A3B8)

@Composable
fun ProductionResultScreen(
    project: FilmProject?,
    activeTab: StudioDestination = StudioDestination.SCRIPT_VIEW,
    onProjectUpdate: (FilmProject) -> Unit = {},
    onBackToForm: () -> Unit
) {
    val scrollState = rememberScrollState()
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    if (project == null) {
        EmptyProductionView(onBackToForm = onBackToForm)
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Header Ringkasan Proyek Aktif
        Surface(
            color = NavySurface,
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, CyanBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = project.input.title.ifBlank { "PROYEK DRAMA" }.uppercase(),
                    color = CyanAccent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${project.input.genre} •${project.input.episodeCount} Episode (${project.input.episodeDurationMinutes} mnt) • Rasio ${project.input.aspectRatio}",
                    color = TextSecondary,
                    fontSize = 12.sp
                )
                if (project.input.sponsorBrandName.isNotBlank()) {
                    Text(
                        text = "Sponsor Aktif: ${project.input.sponsorBrandName}",
                        color = Color(0xFF7DD3FC),
                        fontSize = 11.sp
                    )
                }
            }
        }

        when (activeTab) {
            StudioDestination.SCRIPT_VIEW -> {
                ScriptTabContent(project = project)
            }
            StudioDestination.CHARACTER_VIEW -> {
                CharacterTabContent(
                    project = project,
                    onUpdateCharacterPhoto = { characterId, characterName, newUri ->
                        val updatedChars = project.characters.map { ch ->
                            if (ch.id == characterId || ch.name.equals(characterName, ignoreCase = true)) {
                                ch.copy(referenceImageUri = newUri)
                            } else {
                                ch
                            }
                        }
                        val updatedConsistency = project.consistency.map { cg ->
                            if (cg.characterName.equals(characterName, ignoreCase = true)) {
                                cg.copy(referenceImageUri = newUri)
                            } else {
                                cg
                            }
                        }
                        onProjectUpdate(
                            project.copy(
                                characters = updatedChars,
                                consistency = updatedConsistency,
                                updatedAtEpochMs = System.currentTimeMillis()
                            )
                        )
                    },
                    onCopyPrompt = { text ->
                        clipboardManager.setText(AnnotatedString(text))
                        Toast.makeText(context, "Prompt karakter disalin!", Toast.LENGTH_SHORT).show()
                    }
                )
            }
            else -> {
                ProductionTabContent(
                    project = project,
                    onCopyPrompt = { text ->
                        clipboardManager.setText(AnnotatedString(text))
                        Toast.makeText(context, "Visual prompt disalin!", Toast.LENGTH_SHORT).show()
                    }
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun ScriptTabContent(project: FilmProject) {
    project.story?.let { story ->
        StudioCard(title = "Logline & Sinopsis") {
            Text(
                text = "\"${story.logline}\"",
                color = CyanAccent,
                fontSize = 13.sp,
                fontStyle = FontStyle.Italic,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = story.synopsis,
                color = TextPrimary,
                fontSize = 13.sp,
                lineHeight = 19.sp
            )
            if (story.themes.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Tema: ${story.themes.joinToString(", ")}",
                    color = TextSecondary,
                    fontSize = 12.sp
                )
            }
        }

        if (story.episodeOutlines.isNotEmpty()) {
            StudioCard(title = "Struktur Episode") {
                story.episodeOutlines.forEach { ep ->
                    Surface(
                        color = NavyInputBg,
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, CyanBorder),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "Episode ${ep.episodeNumber}:${ep.title}",
                                color = CyanAccent,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = ep.summary,
                                color = TextPrimary,
                                fontSize = 12.sp,
                                lineHeight = 17.sp
                            )
                            if (ep.cliffhanger.isNotBlank()) {
                                Text(
                                    text = "Cliffhanger: ${ep.cliffhanger}",
                                    color = Color(0xFFFBBF24),
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    StudioCard(title = "Naskah Skenario (${project.script.size} Adegan)") {
        if (project.script.isEmpty()) {
            Text("Belum ada blok naskah.", color = TextSecondary, fontSize = 13.sp)
        } else {
            project.script.forEach { block ->
                Surface(
                    color = NavyInputBg,
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, CyanBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Text(
                            text = "ADEGAN ${block.sceneNumber} —${block.slugline}",
                            color = CyanAccent,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = block.action,
                            color = TextPrimary,
                            fontSize = 12.sp,
                            lineHeight = 18.sp
                        )
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
                                        color = TextSecondary,
                                        fontSize = 11.sp,
                                        fontStyle = FontStyle.Italic
                                    )
                                }
                                Text(
                                    text = dlg.line,
                                    color = TextPrimary,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CharacterTabContent(
    project: FilmProject,
    onUpdateCharacterPhoto: (characterId: String, characterName: String, newUri: String?) -> Unit,
    onCopyPrompt: (String) -> Unit
) {
    var pendingCharacterTarget by remember { mutableStateOf<Pair<String, String>?>(null) }

    val characterPhotoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri: Uri? ->
        val target = pendingCharacterTarget
        if (uri != null && target != null) {
            onUpdateCharacterPhoto(target.first, target.second, uri.toString())
        }
        pendingCharacterTarget = null
    }

    // 1. Profil Karakter + Upload Foto Referensi
    StudioCard(title = "Daftar Karakter (${project.characters.size} Tokoh)") {
        if (project.characters.isEmpty()) {
            Text("Data karakter belum tersedia.", color = TextSecondary, fontSize = 13.sp)
        } else {
            project.characters.forEach { char ->
                Surface(
                    color = NavyInputBg,
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, CyanBorder),
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
                                color = CyanAccent,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Surface(
                                color = Color(0xFF122642),
                                shape = RoundedCornerShape(6.dp),
                                border = BorderStroke(1.dp, CyanAccent)
                            ) {
                                Text(
                                    text = "${char.role} •${char.age}",
                                    color = TextPrimary,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                )
                            }
                        }

                        // Area Foto Referensi Karakter
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
                            CharacterPhotoThumbnail(
                                uriString = char.referenceImageUri,
                                modifier = Modifier.size(68.dp)
                            )
                            Column(
                                modifier = Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = if (char.referenceImageUri != null) {
                                        "Foto Referensi Terkunci"
                                    } else {
                                        "Foto Referensi Karakter"
                                    },
                                    color = if (char.referenceImageUri != null) CyanAccent else TextPrimary,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    OutlinedButton(
                                        onClick = {
                                            pendingCharacterTarget = Pair(char.id, char.name)
                                            characterPhotoPicker.launch(
                                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                            )
                                        },
                                        border = BorderStroke(1.dp, CyanAccent),
                                        shape = RoundedCornerShape(6.dp),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = CyanAccent)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.AddPhotoAlternate,
                                            contentDescription = null,
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = if (char.referenceImageUri != null) "Ganti Foto" else "Upload Foto",
                                            fontSize = 11.sp
                                        )
                                    }

                                    if (char.referenceImageUri != null) {
                                        IconButton(
                                            onClick = {
                                                onUpdateCharacterPhoto(char.id, char.name, null)
                                            },
                                            modifier = Modifier.size(32.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.DeleteOutline,
                                                contentDescription = "Hapus foto karakter",
                                                tint = Color(0xFFF87171),
                                                modifier = Modifier.size(18.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        if (char.appearance.isNotBlank()) {
                            DetailRow("Fisik", char.appearance)
                        }
                        if (char.facialDescription.isNotBlank()) {
                            DetailRow("Wajah", char.facialDescription)
                        }
                        if (char.hairDescription.isNotBlank()) {
                            DetailRow("Rambut", char.hairDescription)
                        }
                        if (char.personality.isNotBlank()) {
                            DetailRow("Karakter", char.personality)
                        }
                        if (char.costume.isNotBlank()) {
                            DetailRow("Kostum", char.costume)
                        }
                        if (char.voiceTone.isNotBlank()) {
                            DetailRow("Suara", char.voiceTone)
                        }
                    }
                }
            }
        }
    }

    // 2. Panduan Konsistensi Identitas
    if (project.consistency.isNotEmpty()) {
        StudioCard(title = "Jangkar Konsistensi Visual (Identity Lock)") {
            project.consistency.forEach { guide ->
                Surface(
                    color = NavyInputBg,
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, CyanBorder),
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
                                CharacterPhotoThumbnail(
                                    uriString = guide.referenceImageUri,
                                    modifier = Modifier.size(40.dp)
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Lock,
                                    contentDescription = null,
                                    tint = CyanAccent,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Column {
                                Text(
                                    text = "${guide.characterName} (${guide.identitySeed})",
                                    color = CyanAccent,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                if (guide.referenceImageUri != null) {
                                    Text(
                                        text = "Terhubung dengan foto referensi wajah",
                                        color = Color(0xFF7DD3FC),
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }
                        DetailRow("Fitur Wajah", guide.facialFeatures)
                        DetailRow("Outfit Utama", guide.signatureOutfit)
                        DetailRow("Prompt Anchor", guide.promptAnchor)

                        val exportPrompt = if (guide.referenceImageUri != null) {
                            "[REFERENCE IMAGE LOCKED: ${guide.characterName} | Seed: ${guide.identitySeed}]${guide.promptAnchor}"
                        } else {
                            guide.promptAnchor
                        }

                        OutlinedButton(
                            onClick = { onCopyPrompt(exportPrompt) },
                            border = BorderStroke(1.dp, CyanAccent),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = CyanAccent),
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
}

@Composable
private fun CharacterPhotoThumbnail(
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
        if (
