import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../core/config.dart';
import '../models/deal.dart';

/// The live catalogue: every live deal (biggest discount first) plus recently ended ones,
/// so saved deals can say "ended" instead of disappearing.
class Catalog {
  Catalog({required this.live, required this.all, this.updatedAt, this.fromCache = false});

  final List<Deal> live;
  final Map<String, Deal> all;
  final DateTime? updatedAt;

  /// True when this came from the copy on the phone because the network failed.
  final bool fromCache;

  Deal? byAsin(String asin) => all[asin];

  /// When prices were last checked (the newest check among live deals).
  DateTime? get lastChecked {
    DateTime? newest;
    for (final d in live) {
      final c = d.checkedAt;
      if (c != null && (newest == null || c.isAfter(newest))) newest = c;
    }
    return newest;
  }

  static Catalog parse(String body, {bool fromCache = false}) {
    final json = jsonDecode(body) as Map<String, dynamic>;
    final raw = (json['deals'] as Map?)?.cast<String, dynamic>() ?? const {};
    final all = <String, Deal>{};
    raw.forEach((asin, v) {
      if (v is Map) {
        final d = Deal.fromEntry(asin, v.cast<String, dynamic>());
        if (d != null) all[asin] = d;
      }
    });
    final live = all.values.where((d) => d.active).toList()
      ..sort((a, b) => b.discountPct != a.discountPct ? b.discountPct - a.discountPct : a.asin.compareTo(b.asin));
    final updated = json['updated_at'];
    return Catalog(
      live: live,
      all: all,
      updatedAt: updated is String ? DateTime.tryParse(updated)?.toUtc() : null,
      fromCache: fromCache,
    );
  }
}

/// Fetches a JSON document, keeps a copy on the phone, and falls back to that copy offline.
class CachedJson {
  CachedJson(this.url, this.fileName, {http.Client? client, Future<Directory> Function()? dir})
      : _client = client ?? http.Client(),
        _dir = dir;

  final String url;
  final String fileName;
  final http.Client _client;
  final Future<Directory> Function()? _dir;

  Future<File?> _file() async {
    if (_dir == null) return null;
    return File('${(await _dir()).path}/$fileName');
  }

  /// Returns (body, fromCache).
  Future<(String, bool)> load() async {
    try {
      final res = await _client.get(Uri.parse(url), headers: {'Cache-Control': 'no-cache'}).timeout(
            const Duration(seconds: 20),
          );
      if (res.statusCode == 200 && res.body.trim().startsWith('{')) {
        final body = utf8.decode(res.bodyBytes);
        try {
          await (await _file())?.writeAsString(body, flush: true);
        } catch (_) {
          // A full disk only costs the offline copy.
        }
        return (body, false);
      }
      throw HttpException('HTTP ${res.statusCode}');
    } catch (e) {
      final f = await _file();
      if (f != null && await f.exists()) return (await f.readAsString(), true);
      rethrow;
    }
  }
}

class CatalogRepository {
  CatalogRepository({http.Client? client, Future<Directory> Function()? dir})
      : _source = CachedJson(AppConfig.catalogUrl, 'catalog.json', client: client, dir: dir);
  final CachedJson _source;

  Future<Catalog> load() async {
    final (body, fromCache) = await _source.load();
    return Catalog.parse(body, fromCache: fromCache);
  }
}
