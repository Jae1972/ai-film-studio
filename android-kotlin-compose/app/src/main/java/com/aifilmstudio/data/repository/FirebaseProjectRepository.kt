package com.aifilmstudio.data.repository

import com.aifilmstudio.model.FilmProject
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Repository Cloud Firestore + Firebase Auth untuk fitur My Projects.
 * Membutuhkan google-services.json dan aturan Firestore per userId sebelum diaktifkan.
 */
class FirebaseProjectRepository(
    private val firestore: FirebaseFirestore = FirebaseFirestore.getInstance(),
    private val auth: FirebaseAuth = FirebaseAuth.getInstance()
) {
    private val json = Json { ignoreUnknownKeys = true }

    private fun userProjectsCollection() =
        auth.currentUser?.uid?.let { uid ->
            firestore.collection("users").document(uid).collection("film_projects")
        } ?: error("Pengguna belum masuk ke akun Firebase Auth.")

    suspend fun saveProject(project: FilmProject): Result<Unit> = runCatching {
        val serialized = json.encodeToString(project)
        val payload = mapOf(
            "id" to project.id,
            "title" to project.input.title,
            "genre" to project.input.genre,
            "updatedAtEpochMs" to project.updatedAtEpochMs,
            "projectJson" to serialized
        )
        userProjectsCollection().document(project.id).set(payload).await()
    }

    suspend fun loadProjects(): Result<List<FilmProject>> = runCatching {
        val snapshot = userProjectsCollection()
            .orderBy("updatedAtEpochMs", Query.Direction.DESCENDING)
            .get()
            .await()

        snapshot.documents.mapNotNull { doc ->
            val rawJson = doc.getString("projectJson") ?: return@mapNotNull null
            json.decodeFromString<FilmProject>(rawJson)
        }
    }

    suspend fun deleteProject(projectId: String): Result<Unit> = runCatching {
        userProjectsCollection().document(projectId).delete().await()
    }
}
