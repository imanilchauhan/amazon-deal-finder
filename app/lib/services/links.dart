import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../logic/format.dart';
import '../models/deal.dart';

/// Opening and sharing links. Amazon's rules for apps: open Amazon in the Amazon app or the
/// browser, never inside the app (no WebView).
class Links {
  const Links();

  Future<bool> openExternal(String url) =>
      launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

  Future<bool> email(String to, String subject) =>
      launchUrl(Uri(scheme: 'mailto', path: to, queryParameters: {'subject': subject}));

  /// Shares our deal page (not a bare Amazon link), with the disclosure.
  Future<void> shareDeal(Deal d, {required bool showPrice}) async {
    final price = showPrice ? ' at ${money(d.price, d.currency)} (${d.discountPct}% off)' : '';
    await SharePlus.instance.share(ShareParams(
      text: '${d.shortTitle}$price\n${d.pageUrl}\n#ad',
      subject: d.shortTitle,
    ));
  }
}
