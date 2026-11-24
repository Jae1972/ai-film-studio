package com.aifilmstudio.data.remote

import com.aifilmstudio.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Layanan Gemini API untuk AI FILM STUDIO (Android Native).
 * Gunakan backend proxy (/api/studio/*) atau Google Generative AI SDK dengan key yang aman.
 * Tidak pernah mengembalikan hasil AI palsu saat API gagal atau belum dikonfigurasi.
 */
class GeminiStudioService(
    private val baseBackendUrl: String
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun generateFullFilm(input: FilmProductionInput): Result<FilmProject> =
        withContext(Dispatchers.IO) {
            runCatching {
                val payload = json.encodeToString(
                    kotlinx.serialization.json.JsonObject.serializer(),
                    kotlinx.serialization.json.buildJsonObject {
                        put("input", json.encodeToJsonElement(FilmProductionInput.serializer(), input))
                    }
                )
                val request = Request.Builder()
                    .url("$baseBackendUrl/api/studio/generate-film")
                    .post(payload.toRequestBody("application/json".toMediaType()))
                    .build()

                client.newCall(request).execute().use { response ->
                    val bodyText = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        error("Gagal menghubungi Gemini Studio API (${response.code}): $bodyText")
                    }
                    val parsed = json.decodeFromString<FilmProject>(bodyText)
                    parsed.copy(input = input, updatedAtEpochMs = System.currentTimeMillis())
                }
            }
        }
}
