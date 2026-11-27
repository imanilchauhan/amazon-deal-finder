import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/screenshots.dart';
import 'push.dart';

/// The first time the home page has something to show (deals, or the offline message):
/// take the launch screen down, then ask for notification permission once.
class Landing {
  Landing._();

  static bool _done = false;

  static void landed(SharedPreferences? prefs) {
    if (_done) return;
    _done = true;
    FlutterNativeSplash.remove();
    if (prefs != null && Push.available && !Screenshots.enabled) {
      Future.delayed(const Duration(milliseconds: 1200), () => Push.start(prefs));
    }
  }
}
