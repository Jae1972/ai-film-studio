plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    // id("com.google.gms.google-services")
    kotlin("plugin.serialization") version "2.0.20"
}

android {
    namespace = "com.aifilmstudio"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.aifilmstudio"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "GEMINI_MODEL", "\"gemini-4-hydrogen\"")
        buildConfigField("String", "GEMINI_API_KEY", "\"${System.getenv("GEMINI_API_KEY") ?: ""}\"")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.02.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.navigation:navigation-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")

    implementation("com.google.ai.client.generativeai:generativeai:0.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    implementation(platform("com.google.firebase:firebase-bom:33.9.0"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-firestore-ktx")
    implementation("com.google.firebase:firebase-storage-ktx")
}
