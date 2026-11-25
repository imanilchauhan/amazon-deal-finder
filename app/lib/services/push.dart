import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/config.dart';
import '../firebase_options.dart';

/// The once-a-day "today's new deals" notification: a Firebase Cloud Messaging topic, no
/// account and no personal data. Never price alerts (Amazon's rules forbid them).
class Push {
  Push._();

  static const _key = 'push_daily_deals';
  static bool _ready = false;

  static bool get available => _ready;

  /// Call once at start-up. Safe when Firebase isn't configured: the app works without push.
  static Future<void> init(SharedPreferences prefs) async {
    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      _ready = true;
    } catch (e) {
      debugPrint('push unavailable: $e');
      return;
    }
    if (prefs.getBool(_key) ?? true) {
      await setEnabled(prefs, true);
    }
  }

  static bool enabled(SharedPreferences? prefs) => _ready && (prefs?.getBool(_key) ?? true);

  /// Ask permission (Android 13+, iOS) and join or leave the daily topic.
  static Future<bool> setEnabled(SharedPreferences prefs, bool on) async {
    if (!_ready) return false;
    final m = FirebaseMessaging.instance;
    try {
      if (on) {
        final s = await m.requestPermission();
        final ok = s.authorizationStatus == AuthorizationStatus.authorized ||
            s.authorizationStatus == AuthorizationStatus.provisional;
        if (!ok) {
          await prefs.setBool(_key, false);
          return false;
        }
        await m.subscribeToTopic(AppConfig.pushTopic);
      } else {
        await m.unsubscribeFromTopic(AppConfig.pushTopic);
      }
      await prefs.setBool(_key, on);
      return on;
    } catch (e) {
      debugPrint('push setting failed: $e');
      return false;
    }
  }
}
