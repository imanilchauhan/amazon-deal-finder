import 'dart:io';

import 'package:deal_finder/data/catalog.dart';
import 'package:deal_finder/data/collections.dart';
import 'package:deal_finder/models/deal.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fixtures.dart';

void main() {
  test('parses the product cache: live first by discount, ended kept, bad entries skipped', () {
    final c = Catalog.parse(catalogJson({
      'B0LOW00001': entry(pct: 30),
      'B0HIGH0001': entry(pct: 80, images: ['https://m.media-amazon.com/images/I/a.jpg', 'https://m.media-amazon.com/images/I/b.jpg']),
      'B0ENDED001': entry(active: false),
      'B0BADURL01': {...entry(), 'url': 'https://evil.example/x'},
      'B0NOPRICE1': {...entry(), 'price': null},
    }));
    expect(c.live.map((d) => d.asin), ['B0HIGH0001', 'B0LOW00001']);
    expect(c.byAsin('B0ENDED001')?.active, isFalse);
    expect(c.byAsin('B0BADURL01'), isNull);
    expect(c.byAsin('B0HIGH0001')!.gallery, hasLength(2));
  });

  test('prices are shown only for 24 hours after the last check', () {
    final fresh = Deal.fromEntry('B0A', entry(checked: now.subtract(const Duration(hours: 23))))!;
    final stale = Deal.fromEntry('B0B', entry(checked: now.subtract(const Duration(hours: 25))))!;
    final ended = Deal.fromEntry('B0C', entry(active: false))!;
    expect(fresh.priceFresh(now), isTrue);
    expect(stale.priceFresh(now), isFalse);
    expect(ended.priceFresh(now), isFalse);
  });

  test('falls back to the copy on the phone when offline', () async {
    final dir = await Directory.systemTemp.createTemp('cc');
    final online = CatalogRepository(
      client: MockClient((_) async => http.Response(catalogJson({'B0A0000001': entry()}), 200)),
      dir: () async => dir,
    );
    expect((await online.load()).fromCache, isFalse);
    final offline = CatalogRepository(
      client: MockClient((_) async => throw const SocketException('offline')),
      dir: () async => dir,
    );
    final c = await offline.load();
    expect(c.fromCache, isTrue);
    expect(c.live.single.asin, 'B0A0000001');
    await dir.delete(recursive: true);
  });

  test('sends the saved ETag and reuses the saved copy on 304', () async {
    final dir = await Directory.systemTemp.createTemp('cc');
    String? sent;
    var calls = 0;
    final repo = CatalogRepository(
      client: MockClient((req) async {
        calls++;
        sent = req.headers['if-none-match'];
        if (calls == 1) {
          return http.Response(catalogJson({'B0A0000001': entry()}), 200, headers: {'etag': '"v1"'});
        }
        return http.Response('', 304, headers: {'etag': '"v1"'});
      }),
      dir: () async => dir,
    );
    expect((await repo.load()).live.single.asin, 'B0A0000001');
    expect(sent, isNull);
    final again = await repo.load();
    expect(sent, '"v1"');
    expect(again.live.single.asin, 'B0A0000001');
    expect(again.fromCache, isFalse);
  });

  test('opens instantly from the saved copy, then shows the fresh download', () async {
    final dir = await Directory.systemTemp.createTemp('cc');
    final first = CatalogRepository(
      client: MockClient((_) async => http.Response(catalogJson({'B0A0000001': entry()}), 200)),
      dir: () async => dir,
    );
    expect((await first.watch().toList()).map((c) => c.live.single.asin), ['B0A0000001']);

    final next = CatalogRepository(
      client: MockClient((_) async => http.Response(catalogJson({'B0A0000002': entry()}), 200)),
      dir: () async => dir,
    );
    final seen = await next.watch().toList();
    expect(seen.map((c) => c.live.single.asin), ['B0A0000001', 'B0A0000002']);
    expect(seen.every((c) => !c.fromCache), isTrue);

    final offline = CatalogRepository(
      client: MockClient((_) async => throw const SocketException('offline')),
      dir: () async => dir,
    );
    final off = await offline.watch().toList();
    expect(off.map((c) => c.fromCache), [false, true]);
    expect(off.last.live.single.asin, 'B0A0000002');
    await dir.delete(recursive: true);
  });

  test('with no saved copy and no network the error reaches the screen', () async {
    final dir = await Directory.systemTemp.createTemp('cc');
    final repo = CatalogRepository(
      client: MockClient((_) async => throw const SocketException('offline')),
      dir: () async => dir,
    );
    expect(repo.watch().toList(), throwsA(isA<SocketException>()));
    await dir.delete(recursive: true);
  });

  test('parses collections', () {
    final cs = Collections.parse('{"groups":["Winter"],"collections":[{"slug":"winter-essentials","group":"Winter",'
        '"title":"Winter essentials","description":"d","intro":["i"],"picks":["B0A"],"topDeals":["B0B"],'
        '"sections":[{"heading":"Jackets","asins":["B0C","B0D"]}]}]}');
    expect(cs.items.single.allAsins, ['B0A', 'B0B', 'B0C', 'B0D']);
    expect(cs.groups, ['Winter']);
  });
}
