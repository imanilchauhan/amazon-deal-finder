import 'package:intl/intl.dart';

final _inr0 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _inr2 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);

/// ₹1,23,456 (Indian grouping); paise only when the amount has them.
String money(num amount, [String currency = 'INR']) {
  final whole = amount == amount.roundToDouble();
  if (currency == 'INR') return (whole ? _inr0 : _inr2).format(amount);
  final f = NumberFormat.currency(locale: 'en_US', symbol: currency == 'USD' ? r'$' : '$currency ',
      decimalDigits: whole ? 0 : 2);
  return f.format(amount);
}

final _split = RegExp(r'\s*[|(\[,–—:]\s*|\s+-\s+');
const _dangling = {'for', 'with', 'and', '&', 'of', 'in', 'to', 'the', 'a', '-', '|'};

/// Strip Amazon keyword stuffing: "Brand Product Name" (same rule as the website).
String shortTitle(String title, {int maxChars = 70, int minChars = 25}) {
  var out = '';
  for (final part in title.split(_split)) {
    final p = part.trim();
    if (p.isEmpty) continue;
    out = '$out $p'.trim();
    if (out.length >= minChars) break;
  }
  if (out.isEmpty) out = title.trim();
  if (out.length > maxChars) {
    var cut = '';
    for (final w in out.split(RegExp(r'\s+'))) {
      if (cut.length + w.length + 1 > maxChars) break;
      cut = '$cut $w'.trim();
    }
    out = cut;
  }
  final words = out.split(RegExp(r'\s+'));
  while (words.length > 1 && _dangling.contains(words.last.toLowerCase())) {
    words.removeLast();
  }
  return words.join(' ');
}

String slugify(String text) {
  var s = text.toLowerCase().replaceAll(RegExp(r'[^\w\s-]'), '').replaceAll(RegExp(r'[\s_-]+'), '-');
  s = s.replaceAll(RegExp(r'^-+|-+$'), '');
  if (s.length > 80) s = s.substring(0, 80);
  return s.replaceAll(RegExp(r'-+$'), '');
}

/// The website's deal page slug: "boat-rockerz-450-b0abc12345".
String dealSlug(String title, String asin) {
  final base = slugify(shortTitle(title));
  return base.isEmpty ? asin.toLowerCase() : '$base-${asin.toLowerCase()}';
}

/// "12 Nov 2026, 1:26 pm IST"
String istDateTime(DateTime when) {
  final ist = when.toUtc().add(const Duration(hours: 5, minutes: 30));
  return '${DateFormat('d MMM yyyy, h:mm').format(ist)} ${DateFormat('a').format(ist).toLowerCase()} IST';
}

/// "5 min ago", "3 h ago", "2 d ago"
String ago(DateTime when, DateTime now) {
  final m = now.difference(when).inMinutes;
  if (m < 1) return 'just now';
  if (m < 60) return '$m min ago';
  final h = (m / 60).round();
  return h < 24 ? '$h h ago' : '${(h / 24).round()} d ago';
}

/// A product name cut to about [max] characters at a word boundary, for small captions.
String snippet(String title, [int max = 28]) {
  if (title.length <= max) return title;
  final cut = title.substring(0, max + 1).replaceAll(RegExp(r'\s+\S*$'), '');
  return '${cut.replaceAll(RegExp(r'[\s,|–-]+$'), '')}…';
}
