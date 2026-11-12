import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'firebase_options.dart';
import 'ui/deals_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const ProviderScope(child: DealFinderApp()));
}

class DealFinderApp extends StatelessWidget {
  const DealFinderApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Deal Finder',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFFFF9900), useMaterial3: true),
      darkTheme: ThemeData(
          colorSchemeSeed: const Color(0xFFFF9900), brightness: Brightness.dark, useMaterial3: true),
      home: const DealsPage(),
    );
  }
}
