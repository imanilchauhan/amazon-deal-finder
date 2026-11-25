import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/providers.dart';
import 'services/push.dart';
import 'ui/app_shell.dart';
import 'ui/theme.dart';

Future<void> main() async {
  final binding = WidgetsFlutterBinding.ensureInitialized();
  // Keep the launch screen (logo + name) up until the home page has loaded; never longer than 6 s.
  FlutterNativeSplash.preserve(widgetsBinding: binding);
  Future.delayed(const Duration(seconds: 6), FlutterNativeSplash.remove);
  final prefs = await SharedPreferences.getInstance();
  // Push is optional: without Firebase config the app still works, just without notifications.
  await Push.init();
  runApp(ProviderScope(
    overrides: [prefsProvider.overrideWithValue(prefs)],
    child: const CartCrushApp(),
  ));
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
