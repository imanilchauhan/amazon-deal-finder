import 'dart:convert';

import 'package:deal_finder/models/deal.dart';

final now = DateTime.utc(2026, 11, 26, 6, 0);

Map<String, dynamic> entry({
  String title = 'boAt Rockerz 450 Bluetooth Headphones',
  double price = 999,
  double mrp = 2990,
  int pct = 67,
  bool active = true,
  String department = 'electronics',
  String category = 'headphones-earbuds',
  String gender = '',
  String brand = 'boAt',
  DateTime? checked,
  List<String>? images,
}) =>
    {
      'title': title,
      'price': price,
      'original_price': mrp,
      'discount_pct': pct,
      'currency': 'INR',
      'image_url': 'https://m.media-amazon.com/images/I/a.jpg',
      if (images != null) 'images': images,
      'url': 'https://www.amazon.in/dp/B0TEST/?tag=cartcrush004-21',
      'active': active,
      'updated_at': (checked ?? now.subtract(const Duration(minutes: 20))).toIso8601String(),
      'first_seen_at': now.subtract(const Duration(days: 1)).toIso8601String(),
      'department': department,
      'category': category,
      'gender': gender,
      'brand': brand,
    };

String catalogJson(Map<String, Map<String, dynamic>> deals) =>
    jsonEncode({'version': 1, 'updated_at': now.toIso8601String(), 'deals': deals});

Deal deal(String asin, {String title = 'Thing', double price = 499, int pct = 50, String department = 'electronics',
        String category = 'headphones-earbuds', String gender = '', String brand = ''}) =>
    Deal.fromEntry(asin, entry(title: title, price: price, mrp: price * 2, pct: pct, department: department,
        category: category, gender: gender, brand: brand))!;
