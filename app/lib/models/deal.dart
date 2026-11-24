import 'package:cloud_firestore/cloud_firestore.dart';

/// Mirrors the `deals/{asin}` document written by the Python backend.
class Deal {
  const Deal({
    required this.asin,
    required this.title,
    required this.price,
    required this.originalPrice,
    required this.discountPct,
    required this.currency,
    required this.imageUrl,
    required this.url,
    this.updatedAt,
  });

  final String asin;
  final String title;
  final double price;
  final double originalPrice;
  final int discountPct;
  final String currency;
  final String imageUrl;
  final String url;
  final DateTime? updatedAt;

  double get savings => originalPrice - price;

  /// Returns null for malformed documents so one bad row can't break the feed.
  static Deal? tryFromMap(String id, Map<String, dynamic> m) {
    final price = (m['price'] as num?)?.toDouble();
    final original = (m['original_price'] as num?)?.toDouble();
    final url = m['url'] as String?;
    final title = m['title'] as String?;
    if (price == null || original == null || url == null || title == null) return null;
    if (!url.startsWith('https://www.amazon.')) return null;
    final ts = m['updated_at'];
    return Deal(
      asin: (m['asin'] as String?) ?? id,
      title: title,
      price: price,
      originalPrice: original,
      discountPct: (m['discount_pct'] as num?)?.toInt() ?? 0,
      currency: (m['currency'] as String?) ?? 'INR',
      imageUrl: (m['image_url'] as String?) ?? '',
      url: url,
      updatedAt: ts is Timestamp ? ts.toDate().toUtc() : (ts is DateTime ? ts.toUtc() : null),
    );
  }
}
