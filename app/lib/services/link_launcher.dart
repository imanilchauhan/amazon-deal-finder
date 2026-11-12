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
    // Mobile: in-app browser (Custom Tabs / SFSafariViewController) keeps users in the app
    // and preserves the ?tag= affiliate parameter. Web: new browser tab.
    final mode = kIsWeb ? LaunchMode.platformDefault : LaunchMode.inAppBrowserView;
    return launchUrl(uri, mode: mode, webOnlyWindowName: '_blank');
  }
}
