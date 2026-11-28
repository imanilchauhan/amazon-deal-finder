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

  /// The copy kept on the phone from the last successful download, if any.
  Future<String?> saved() async {
    try {
      final f = await _file();
      if (f != null && await f.exists()) return await f.readAsString();
    } catch (_) {
      // An unreadable copy is the same as none.
    }
    return null;
  }

  Future<File?> _etagFile() async {
    final f = await _file();
    return f == null ? null : File('${f.path}.etag');
  }

  /// Downloads the current document and keeps a copy on the phone. Sends the saved copy's ETag,
  /// so when nothing changed the server answers with a tiny 304 and the saved copy is reused.
  Future<String> fetch() async {
    String? etag;
    String? saved;
    try {
      final ef = await _etagFile();
      if (ef != null && await ef.exists()) {
        saved = await this.saved();
        if (saved != null) etag = (await ef.readAsString()).trim();
      }
    } catch (_) {
      etag = null;
    }
    final res = await _client.get(Uri.parse(url), headers: {
      if (etag != null && etag.isNotEmpty) 'If-None-Match': etag,
    }).timeout(const Duration(seconds: 20));
    if (res.statusCode == 304 && saved != null) return saved;
    if (res.statusCode != 200 || !res.body.trim().startsWith('{')) throw HttpException('HTTP ${res.statusCode}');
    final body = utf8.decode(res.bodyBytes);
    try {
      await (await _file())?.writeAsString(body, flush: true);
      final ef = await _etagFile();
      final tag = res.headers['etag'];
      if (ef != null) {
        if (tag != null && tag.isNotEmpty) {
          await ef.writeAsString(tag, flush: true);
        } else if (await ef.exists()) {
          await ef.delete();
        }
      }
    } catch (_) {
      // A full disk only costs the offline copy.
    }
    return body;
  }

  /// Network first, the saved copy when offline. Returns (body, fromCache).
  Future<(String, bool)> load() async {
    try {
      return (await fetch(), false);
    } catch (e) {
      final body = await saved();
      if (body != null) return (body, true);
      rethrow;
    }
  }

  /// Instant open: the saved copy first (if any), then the fresh download. A failed download
  /// after a saved copy is not an error: the copy stays, now flagged as offline (fromCache).
  Stream<(String, bool)> watch() async* {
    final body = await saved();
    if (body != null) yield (body, false);
    try {
      yield (await fetch(), false);
    } catch (e) {
      if (body == null) rethrow;
      yield (body, true);
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

  Stream<Catalog> watch() => _source.watch().map((r) => Catalog.parse(r.$1, fromCache: r.$2));
}
