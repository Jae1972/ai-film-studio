package com.aifilmstudio.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object StudioColors {
    val Background = Color(0xFF0A0B0E)
    val Surface = Color(0xFF12141A)
    val SurfaceElevated = Color(0xFF181B22)
    val BorderHairline = Color(0x14FFFFFF)
    val AccentAmber = Color(0xFFE5A93C)
    val AccentAmberInk = Color(0xFF0A0B0E)
    val TextPrimary = Color(0xFFF4F5F7)
    val TextSecondary = Color(0xFF9CA3AF)
    val TextMuted = Color(0xFF6B7280)
    val SuccessGreen = Color(0xFF22C55E)
    val ErrorCrimson = Color(0xFFEF4444)
}

private val StudioDarkColorScheme = darkColorScheme(
    primary = StudioColors.AccentAmber,
    onPrimary = StudioColors.AccentAmberInk,
    background = StudioColors.Background,
    onBackground = StudioColors.TextPrimary,
    surface = StudioColors.Surface,
    onSurface = StudioColors.TextPrimary,
    surfaceVariant = StudioColors.SurfaceElevated,
    onSurfaceVariant = StudioColors.TextSecondary,
    outline = StudioColors.BorderHairline,
    error = StudioColors.ErrorCrimson
)

private val StudioTypography = Typography(
    headlineMedium = TextStyle(
        fontSize = 24.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = (-0.02).sp,
        color = StudioColors.TextPrimary
    ),
    titleMedium = TextStyle(
        fontSize = 16.sp,
        fontWeight = FontWeight.SemiBold,
        color = StudioColors.TextPrimary
    ),
    bodyMedium = TextStyle(
        fontSize = 14.sp,
        lineHeight = 22.sp,
        color = StudioColors.TextSecondary
    ),
    labelMedium = TextStyle(
        fontSize = 12.sp,
        fontWeight = FontWeight.Medium,
        color = StudioColors.TextMuted
    )
)

@Composable
fun AiFilmStudioTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = StudioDarkColorScheme,
        typography = StudioTypography,
        content = content
    )
}
