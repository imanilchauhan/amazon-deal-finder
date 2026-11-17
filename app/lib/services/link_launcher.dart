import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Abstraction so widget tests can verify taps without opening a browser.
abstract class LinkLauncher {
  Future<bool> open(String url);
}

class UrlLauncherLinkLauncher implements LinkLauncher {
  const UrlLauncherLinkLauncher();

  @override
  Future<bool> open(String url) {
    final uri = Uri.parse(url);
    // Mobile: hand the link to the Amazon app or the phone's browser. Amazon's Associates
    // mobile rules forbid showing Amazon pages inside the app (WebViews). Web: new browser tab.
    final mode = kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication;
    return launchUrl(uri, mode: mode, webOnlyWindowName: '_blank');
  }
}
