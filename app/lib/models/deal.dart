import '../core/config.dart';
import '../logic/format.dart' as fmt;

/// One product from the product cache (catalog.json), same fields as the Firestore document.
class Deal {
  const Deal({
    required this.asin,
    required this.title,
    required this.price,
    required this.originalPrice,
    required this.discountPct,
    required this.imageUrl,
    required this.url,
    this.currency = 'INR',
    this.images = const [],
    this.active = true,
    this.checkedAt,
    this.firstSeenAt,
    this.department = 'uncategorised',
    this.category = 'uncategorised',
    this.brand = '',
    this.gender = '',
    this.source = 'scraper',
  });

  final String asin;
  final String title;
  final double price;
  final double originalPrice;
  final int discountPct;
  final String currency;
  final String imageUrl;
  final List<String> images;
  final String url;
  final bool active;
  final DateTime? checkedAt;
  final DateTime? firstSeenAt;
  final String department;
  final String category;
  final String brand;
  final String gender;
  final String source;

  double get savings => originalPrice - price;
  String get shortTitle => fmt.shortTitle(title);
  String get slug => fmt.dealSlug(title, asin);
  String get pageUrl => '${AppConfig.siteUrl}/deals/$slug';

  /// All photos, main first (at least the main image).
  List<String> get gallery => images.isNotEmpty ? images : [if (imageUrl.isNotEmpty) imageUrl];

  /// Amazon lets us show a price only for 24 hours after it was checked.
  bool priceFresh(DateTime now) =>
      active && checkedAt != null && now.difference(checkedAt!) <= AppConfig.priceFreshFor;

  static DateTime? _time(Object? v) => v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toUtc() : null;
  static double? _num(Object? v) => v is num ? v.toDouble() : null;
  static String _str(Object? v, [String fallback = '']) => v is String ? v : fallback;

  /// Null for malformed entries so one bad product can't break the app.
  static Deal? fromEntry(String asin, Map<String, dynamic> m) {
    final price = _num(m['price']);
    final original = _num(m['original_price']);
    final url = _str(m['url']);
    final title = _str(m['title']).trim();
    if (price == null || original == null || title.isEmpty) return null;
    if (!url.startsWith('https://www.amazon.')) return null;
    final imgs = (m['images'] is List)
        ? (m['images'] as List).whereType<String>().where((u) => u.startsWith('https://')).toList()
        : <String>[];
    return Deal(
      asin: asin,
      title: title,
      price: price,
      originalPrice: original,
      discountPct: (m['discount_pct'] as num?)?.toInt() ?? 0,
      currency: _str(m['currency'], 'INR'),
      imageUrl: _str(m['image_url']),
      images: imgs,
      url: url,
      active: m['active'] == true,
      checkedAt: _time(m['updated_at']),
      firstSeenAt: _time(m['first_seen_at']),
      department: _str(m['department'], 'uncategorised'),
      category: _str(m['category'], 'uncategorised'),
      brand: _str(m['brand']),
      gender: _str(m['gender']),
      source: _str(m['source'], 'scraper'),
    );
  }
}
