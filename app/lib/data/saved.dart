import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Saved deals, kept on the phone only (no account, nothing sent anywhere).
class SavedNotifier extends StateNotifier<List<String>> {
  SavedNotifier(this._prefs) : super(_prefs?.getStringList(key) ?? const []);

  static const key = 'saved_asins';
  final SharedPreferences? _prefs;

  bool isSaved(String asin) => state.contains(asin);

  void toggle(String asin) {
    state = isSaved(asin) ? state.where((a) => a != asin).toList() : [asin, ...state];
    _prefs?.setStringList(key, state);
  }

  void remove(String asin) {
    state = state.where((a) => a != asin).toList();
    _prefs?.setStringList(key, state);
  }
}
