import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import 'catalog.dart';

class CollectionSection {
  const CollectionSection(this.heading, this.asins);
  final String heading;
  final List<String> asins;
}

/// A curated collection, built by the website from the same product cache.
class DealCollection {
  const DealCollection({
    required this.slug,
    required this.group,
    required this.title,
    required this.description,
    this.intro = const [],
    this.picks = const [],
    this.topDeals = const [],
    this.sections = const [],
  });

  final String slug;
  final String group;
  final String title;
  final String description;
  final List<String> intro;
  final List<String> picks;
  final List<String> topDeals;
  final List<CollectionSection> sections;

  /// Every product in the collection, in page order.
  List<String> get allAsins => [...picks, ...topDeals, for (final s in sections) ...s.asins];

  String get pageUrl => '${AppConfig.siteUrl}/collections/$slug';

  static List<String> _ids(Object? v) => v is List ? v.whereType<String>().toList() : const [];

  static DealCollection fromJson(Map<String, dynamic> j) => DealCollection(
        slug: j['slug'] as String? ?? '',
        group: j['group'] as String? ?? '',
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        intro: _ids(j['intro']),
        picks: _ids(j['picks']),
        topDeals: _ids(j['topDeals']),
        sections: [
          for (final s in (j['sections'] as List? ?? const []))
            if (s is Map) CollectionSection(s['heading'] as String? ?? '', _ids(s['asins'])),
        ],
      );
}

class Collections {
  const Collections(this.groups, this.items);
  final List<String> groups;
  final List<DealCollection> items;

  static Collections parse(String body) {
    final j = jsonDecode(body) as Map<String, dynamic>;
    return Collections(
      (j['groups'] as List? ?? const []).whereType<String>().toList(),
      [
        for (final c in (j['collections'] as List? ?? const []))
          if (c is Map) DealCollection.fromJson(c.cast<String, dynamic>()),
      ].where((c) => c.slug.isNotEmpty).toList(),
    );
  }
}

class CollectionsRepository {
  CollectionsRepository({http.Client? client, Future<Directory> Function()? dir})
      : _source = CachedJson(AppConfig.collectionsUrl, 'collections.json', client: client, dir: dir);
  final CachedJson _source;

  Future<Collections> load() async => Collections.parse((await _source.load()).$1);
}
