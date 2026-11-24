package com.aifilmstudio.data.remote

import com.aifilmstudio.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.UUID
import java.util.concurrent.TimeUnit

class GeminiStudioService(
    private val apiKey: String
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    suspend fun generateFullFilm(input: FilmProductionInput): Result<FilmProject> =
        withContext(Dispatchers.IO) {
            runCatching {
                if (apiKey.isBlank()) {
                    error("API Key Gemini kosong. Pastikan GEMINI_API_KEY sudah terpasang di GitHub Secrets.")
                }

                val effectiveCategory = if (input.storyCategory == "Custom Kategori" && input.customCategory.isNotBlank()) {
                    input.customCategory
                } else {
                    input.storyCategory
                }

                val effectiveRatio = if (input.aspectRatio == "Custom" && input.customAspectRatio.isNotBlank()) {
                    input.customAspectRatio
                } else {
                    input.aspectRatio
                }

                val sponsorInstruction = if (input.sponsorBrandName.isNotBlank()) {
                    """
                    INSTRUKSI SPONSOR / PRODUCT PLACEMENT WAJIB:
                    - Nama Produk / Merek: ${input.sponsorBrandName}
                    - Manfaat / Kegunaan: ${input.sponsorBenefit.ifBlank { "Produk unggulan" }}
                    - Jumlah Foto Referensi Produk: ${input.sponsorProductImageUris.size} foto dilampirkan
                    - Sisipkan produk "${input.sponsorBrandName}" secara natural dan halus maksimal pada 1-2 adegan per episode (jangan kaku).
                    ${if (input.useSponsorAsDefaultOutfit) "- KHUSUS SPONSOR FASHION: Jadikan produk '${input.sponsorBrandName}' sebagai outfit/busana utama default yang dipakai karakter protagonis di setiap adegan dan cantumkan di bagian 'costume', 'signatureOutfit', serta 'visualPrompt'!" else ""}
                    """.trimIndent()
                } else {
                    "Tidak ada sponsor khusus."
                }

                val inputJsonString = json.encodeToString(FilmProductionInput.serializer(), input)

                val prompt = """
                    Anda adalah sutradara film profesional, showrunner, dan penulis skenario utama di OMWAR DRAMA STUDIO.
                    Buat paket pra-produksi drama/film lengkap dalam format JSON murni (tanpa blok markdown ```json) berdasarkan konfigurasi proyek berikut:
                    - Kategori Cerita: $effectiveCategory
                    - Rasio Layar Target: $effectiveRatio
                    - Durasi Per Episode: ${input.episodeDurationMinutes} menit
                    - Detail Input Lengkap: $inputJsonString

                    $sponsorInstruction

                    Kembalikan objek JSON yang mengikuti struktur field persis seperti ini:
                    {
                      "id": "${UUID.randomUUID()}",
                      "updatedAtEpochMs": ${System.currentTimeMillis()},
                      "story": {
                        "logline": "1-2 kalimat logline dramatis",
                        "synopsis": "Sinopsis lengkap dan menyentuh emosi",
                        "themes": ["tema 1", "tema 2"],
                        "episodeOutlines": [
                          {
                            "episodeNumber": 1,
                            "title": "Judul Episode 1",
                            "summary": "Ringkasan alur episode",
                            "cliffhanger": "Ketegangan penutup episode"
                          }
                        ]
                      },
                      "characters": [
                        {
                          "id": "char_1",
                          "name": "Nama Karakter",
                          "role": "Protagonis / Antagonis / Pendukung",
                          "age": "Usia",
                          "appearance": "Postur dan ciri fisik detail",
                          "facialDescription": "Struktur wajah, mata, dan ekspresi khas",
                          "hairDescription": "Gaya rambut / penutup kepala",
                          "personality": "Sifat utama",
                          "costume": "Deskripsi busana lengkap (termasuk outfit sponsor jika aktif)",
                          "voiceTone": "Gaya dan intonasi bicara",
                          "referenceImageUri": null
                        }
                      ],
                      "consistency": [
                        {
                          "characterName": "Nama Karakter",
                          "identitySeed": "SEED-CHAR-01",
                          "facialFeatures": "Jangkar konsistensi wajah",
                          "signatureOutfit": "Jangkar konsistensi busana utama",
                          "promptAnchor": "Prompt lengkap karakter untuk konsistensi AI visual",
                          "locked": true,
                          "referenceImageUri": null
                        }
                      ],
                      "scenes": [
                        {
                          "sceneNumber": 1,
                          "episodeNumber": 1,
                          "heading": "EXT/INT. LOKASI - WAKTU",
                          "location": "Nama lokasi detail",
                          "lighting": "Pencahayaan sinematik",
                          "cameraMovement": "Static / Dolly In / Tracking",
                          "actionSummary": "Ringkasan kejadian adegan",
                          "charactersInvolved": ["Nama Karakter"],
                          "estimatedSeconds": 45
                        }
                      ],
                      "script": [
                        {
                          "sceneNumber": 1,
                          "slugline": "EXT/INT. LOKASI - WAKTU",
                          "action": "Deskripsi aksi sinematik mendetail",
                          "dialogues": [
                            { "character": "NAMA KARAKTER", "parenthetical": "(nada bicara)", "line": "Dialog karakter dalam bahasa ${input.dialogueLanguage}" }
                          ]
                        }
                      ],
                      "storyboard": [
                        {
                          "frameNumber": 1,
                          "sceneNumber": 1,
                          "location": "Lokasi frame",
                          "characters": ["Nama Karakter"],
                          "visualDescription": "Komposisi visual frame rasio $effectiveRatio",
                          "dialogue": "Cuplikan dialog",
                          "shotType": "Wide Shot / Medium Shot / Close-Up",
                          "cameraAngle": "Eye Level / Low Angle / High Angle",
                          "lensMm": "35mm anamorphic / 50mm / 85mm",
                          "compositionNotes": "Catatan framing dan pencahayaan",
                          "visualPrompt": "Prompt sinematik detail rasio $effectiveRatio gaya${input.visualStyle}",
                          "durationSeconds": 8
                        }
                      ]
                    }

                    Buat minimal 5 adegan utuh di "scenes" dan "script", serta minimal 6 frame detail di "storyboard" yang saling terhubung.
                """.trimIndent()

                val requestBodyJson = buildJsonObject {
                    put("contents", buildJsonArray {
                        add(buildJsonObject {
                            put("parts", buildJsonArray {
                                add(buildJsonObject {
                                    put("text", prompt)
                                })
                            })
                        })
                    })
                    put("generationConfig", buildJsonObject {
                        put("responseMimeType", "application/json")
                    })
                }.toString()

                val scheme = "https"
                val host = "generativelanguage.googleapis.com"
                val path = "/v1beta/models/gemini-3.8-flash:generateContent?key=$apiKey"
                val request = Request.Builder()
                    .url("$scheme://$host$path")
                    .post(requestBodyJson.toRequestBody("application/json".toMediaType()))
                    .build()

                var lastError: String? = null
                var responseBody: String? = null

                for (attempt in 1..3) {
                    client.newCall(request).execute().use { response ->
                        val bodyText = response.body?.string().orEmpty()
                        if (response.isSuccessful) {
                            responseBody = bodyText
                        } else {
                            lastError = "Gemini API Error (${response.code}):$bodyText"
                        }
                    }
                    if (responseBody != null) break
                    if (attempt < 3) delay(2500L * attempt)
                }

                val finalBody = responseBody ?: error(lastError ?: "Gagal terhubung ke Gemini API.")
                val root = json.parseToJsonElement(finalBody).jsonObject
                val contentText = root["candidates"]?.jsonArray
                    ?.firstOrNull()?.jsonObject
                    ?.get("content")?.jsonObject
                    ?.get("parts")?.jsonArray
                    ?.firstOrNull()?.jsonObject
                    ?.get("text")?.jsonPrimitive?.content
                    ?: error("Respons kosong dari Gemini API.")

                val cleanJson = contentText
                    .removePrefix("```json")
                    .removePrefix("```")
                    .removeSuffix("```")
                    .trim()

                val parsed = json.decodeFromString<FilmProject>(cleanJson)
                parsed.copy(input = input, updatedAtEpochMs = System.currentTimeMillis())
            }
        }
}
