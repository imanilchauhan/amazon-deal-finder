import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// CartCrush colours (same tokens as the website).
class Brand {
  Brand._();
  static const coral = Color(0xFFE5484D);
  static const deep = Color(0xFFC62828);
  static const ink = Color(0xFF16181D);
  static const paper = Color(0xFFF6F3EF);
  static const muted = Color(0xFF5B6170);
  static const good = Color(0xFF137A3E);
  static const goodSoft = Color(0xFFE7F4EC);
  static const winter = Color(0xFF2563EB);
  static const her = Color(0xFFDB2777);
  static const homeTint = Color(0xFF0F766E);
  static const darkBg = Color(0xFF0F1013);
  static const darkSurface = Color(0xFF17191E);
}

/// Colours that change with light/dark mode.
class Tones extends ThemeExtension<Tones> {
  const Tones({required this.bg, required this.surface, required this.surface2, required this.line,
      required this.muted, required this.good, required this.goodSoft});

  final Color bg;
  final Color surface;
  final Color surface2;
  final Color line;
  final Color muted;
  final Color good;
  final Color goodSoft;

  static const light = Tones(
    bg: Brand.paper,
    surface: Colors.white,
    surface2: Color(0xFFEFEAE4),
    line: Color(0xFFE4DED6),
    muted: Brand.muted,
    good: Brand.good,
    goodSoft: Brand.goodSoft,
  );
  static const dark = Tones(
    bg: Brand.darkBg,
    surface: Brand.darkSurface,
    surface2: Color(0xFF20232A),
    line: Color(0xFF2A2D35),
    muted: Color(0xFFA3A9B6),
    good: Color(0xFF4ADE80),
    goodSoft: Color(0xFF12301F),
  );

  @override
  Tones copyWith() => this;

  @override
  Tones lerp(ThemeExtension<Tones>? other, double t) => t < 0.5 ? this : (other as Tones? ?? this);
}

extension TonesX on BuildContext {
  Tones get tones => Theme.of(this).extension<Tones>() ?? Tones.light;
}

ThemeData buildTheme(Brightness b, {bool useGoogleFonts = true}) {
  final dark = b == Brightness.dark;
  final tones = dark ? Tones.dark : Tones.light;
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.coral,
    brightness: b,
    primary: dark ? const Color(0xFFFF6B6F) : Brand.deep,
    surface: tones.surface,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: b);
  final text = useGoogleFonts ? GoogleFonts.interTextTheme(base.textTheme) : base.textTheme;
  return base.copyWith(
    scaffoldBackgroundColor: tones.bg,
    textTheme: text.apply(
      bodyColor: dark ? Colors.white : Brand.ink,
      displayColor: dark ? Colors.white : Brand.ink,
    ),
    extensions: [tones],
    appBarTheme: AppBarTheme(
      backgroundColor: tones.bg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      titleTextStyle: (text.titleLarge ?? const TextStyle()).copyWith(
        fontWeight: FontWeight.w800,
        color: dark ? Colors.white : Brand.ink,
      ),
    ),
    cardTheme: CardThemeData(
      color: tones.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: tones.line)),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: tones.surface,
      side: BorderSide(color: tones.line),
      shape: const StadiumBorder(),
      labelStyle: TextStyle(fontWeight: FontWeight.w600, color: dark ? Colors.white : Brand.ink),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: tones.surface,
      indicatorColor: Brand.coral.withValues(alpha: 0.16),
      surfaceTintColor: Colors.transparent,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: dark ? Colors.white : Brand.ink,
        foregroundColor: dark ? Brand.ink : Colors.white,
        minimumSize: const Size(48, 52),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(48, 48),
        side: BorderSide(color: tones.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: tones.surface,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: tones.line)),
      enabledBorder:
          OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: tones.line)),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(999), borderSide: const BorderSide(color: Brand.coral, width: 1.5)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
    ),
  );
}
