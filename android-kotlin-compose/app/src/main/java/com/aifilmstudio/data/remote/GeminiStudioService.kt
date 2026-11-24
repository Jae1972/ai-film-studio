package com.aifilmstudio.data.remote

import com.aifilmstudio.model.*
import kotlinx.coroutines.Dispatchers
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

                val inputJsonString = json.encodeToString(FilmProductionInput.serializer(), input)

                val prompt = """
                    Anda adalah sutradara film profesional, showrunner, dan penulis skenario sinematik.
                    Buat paket pra-produksi film lengkap dalam format JSON murni (tanpa markdown ```json) berdasarkan data input berikut:
                    $inputJsonString

                    Kembalikan objek JSON yang mengikuti struktur persis ini:
                    {
                      "id": "${UUID.randomUUID()}",
                      "updatedAtEpochMs": ${System.currentTimeMillis()},
                      "story": {
                        "logline": "1-2 kalimat logline dramatis",
                        "synopsis": "Sinopsis lengkap 3 babak",
                        "themes": ["tema 1", "tema 2"],
                        "acts": [
                          { "actNumber": 1, "title": "Babak I", "summary": "...", "turningPoint": "..." },
                          { "actNumber": 2, "title": "Babak II", "summary": "...", "turningPoint": "..." },
                          { "actNumber": 3, "title": "Babak III", "summary": "...", "turningPoint": "..." }
                        ]
                      },
                      "characters": [
                        {
                          "id": "char_1",
                          "name": "Nama Karakter",
                          "role": "Protagonis / Antagonis / Pendukung",
                          "age": "Usia",
                          "appearance": "Ciri fisik & wajah detail",
                          "facialDescription": "Detail ekspresi & struktur wajah konsisten",
                          "wardrobeProfile": "Kostum & atribut khas periode/latar",
                          "personality": "Sifat utama",
                          "motivation": "Tujuan utama",
                          "voiceStyle": "Gaya bicara",
                          "referencePrompt": "Prompt detail karakter untuk AI visual"
                        }
                      ],
                      "visualAnchors": [
                        {
                          "characterId": "char_1",
                          "characterName": "Nama Karakter",
                          "faceConsistency": "Jangkar konsistensi wajah",
                          "wardrobeAnchor": "Jangkar konsistensi busana",
                          "propAnchor": "Senjata/properti khas",
                          "lightingStyle": "Gaya pencahayaan sinematik",
                          "consistencyNotes": "Catatan konsistensi antar adegan"
                        }
                      ],
                      "scenes": [
                        {
                          "sceneNumber": 1,
                          "actNumber": 1,
                          "setting": "INT/EXT. LOKASI",
                          "timeOfDay": "PAGI / SIANG / SENJA / MALAM",
                          "summary": "Ringkasan kejadian adegan",
                          "emotionalBeat": "Nuansa emosi adegan",
                          "charactersPresent": ["Nama Karakter"],
                          "durationSeconds": 45
                        }
                      ],
                      "script": [
                        {
                          "sceneNumber": 1,
                          "slugline": "EXT. LOKASI - WAKTU",
                          "action": "Deskripsi aksi sinematik mendetail",
                          "dialogues": [
                            { "character": "NAMA KARAKTER", "parenthetical": "(nada bicara)", "line": "Dialog karakter" }
                          ]
                        }
                      ],
                      "storyboard": [
                        {
                          "frameNumber": 1,
                          "sceneNumber": 1,
                          "shotTitle": "Judul Shot",
                          "characters": ["Nama Karakter"],
                          "visualDescription": "Komposisi visual frame",
                          "dialogue": "Cuplikan dialog",
                          "shotType": "Wide Shot / Medium Shot / Close-Up",
                          "cameraAngle": "Eye Level / Low Angle / High Angle",
                          "cameraMovement": "Static / Dolly In / Tracking",
                          "lensSpec": "35mm anamorphic / 50mm / 85mm",
                          "lighting": "Pencahayaan adegan",
                          "visualPrompt": "Prompt sinematik lengkap untuk generasi gambar/video",
                          "durationSeconds": 8
                        }
                      ]
                    }

                    Buat minimal 5 adegan utuh di "scenes" dan "script", serta minimal 6 frame detail di "storyboard" yang saling terhubung secara konsisten.
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
                val path = "/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey"
                val request = Request.Builder()
                    .url("$scheme://$host$path")
                    .post(requestBodyJson.toRequestBody("application/json".toMediaType()))
                    .build()

                client.newCall(request).execute().use { response ->
                    val bodyText = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        error("Gemini API Error (${response.code}):$bodyText")
                    }
                    val root = json.parseToJsonElement(bodyText).jsonObject
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
}
