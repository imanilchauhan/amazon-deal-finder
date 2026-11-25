import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/providers.dart';
import 'services/push.dart';
import 'ui/app_shell.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  // Push is optional: without Firebase config the app still works, just without notifications.
  await Push.init();
  runApp(ProviderScope(
    overrides: [prefsProvider.overrideWithValue(prefs)],
    child: const CartCrushApp(),
  ));
  // Ask for notification permission a moment after the first deals are drawn, not on a blank screen.
  Future.delayed(const Duration(seconds: 4), () => Push.start(prefs));
}

class CartCrushApp extends StatelessWidget {
  const CartCrushApp({super.key, this.useGoogleFonts = true});

  /// Tests switch Google Fonts off (no network).
  final bool useGoogleFonts;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CartCrush',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light, useGoogleFonts: useGoogleFonts),
      darkTheme: buildTheme(Brightness.dark, useGoogleFonts: useGoogleFonts),
      home: const AppShell(),
    );
  }
}
