/// Build-time switches used only to take store screenshots, e.g.
/// `flutter build ios --simulator --dart-define=CC_SCREENSHOTS=true --dart-define=CC_START_TAB=1`.
/// All default to off, so normal builds behave exactly as before.
class Screenshots {
  Screenshots._();

  /// No notification prompt, so it never covers a screenshot.
  static const enabled = bool.fromEnvironment('CC_SCREENSHOTS');

  /// Tab to start on (0 Home, 1 Deals, 2 Collections, 3 Saved).
  static const startTab = int.fromEnvironment('CC_START_TAB');

  /// Open the deal page of the home page's deal of the hour once deals have loaded.
  static const openHero = bool.fromEnvironment('CC_OPEN_HERO');

  /// Pretend these products are saved (comma-separated count of live deals to save).
  static const savedCount = int.fromEnvironment('CC_SAVED');
}
