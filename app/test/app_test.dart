import 'package:deal_finder/core/providers.dart';
import 'package:deal_finder/data/catalog.dart';
import 'package:deal_finder/data/collections.dart';
import 'package:deal_finder/main.dart';
import 'package:deal_finder/models/deal.dart';
import 'package:deal_finder/services/links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fixtures.dart';

class FakeLinks extends Links {
  FakeLinks();
  final opened = <String>[];
  @override
  Future<bool> openExternal(String url) async {
    opened.add(url);
    return true;
  }
}

Catalog sample() => Catalog.parse(catalogJson({
      'B0HEADPH01': entry(),
      'B0JACKET01': entry(
          title: 'QNIM Men Bomber Jacket for Winter', price: 799, mrp: 2499, pct: 68,
          department: 'fashion', category: 'clothing', gender: 'men', brand: 'QNIM'),
      'B0KURTA001': entry(
          title: 'ANNI Designer Embroidered Kurta Set for Women', price: 399, mrp: 2599, pct: 85,
          department: 'fashion', category: 'clothing', gender: 'women', brand: 'ANNI'),
      'B0KADAI001': entry(
          title: 'Prestige Non-stick Kadai 24cm', price: 649, mrp: 1495, pct: 57,
          department: 'home-kitchen', category: 'cookware', brand: 'Prestige'),
    }));

Widget app(FakeLinks links) => ProviderScope(
      overrides: [
        nowProvider.overrideWithValue(() => now),
        catalogProvider.overrideWith((ref) => Stream.value(sample())),
        collectionsProvider.overrideWith((ref) => Stream.value(const Collections(['Winter'], [
              DealCollection(slug: 'winter-essentials', group: 'Winter', title: 'Winter essentials',
                  description: 'd', topDeals: ['B0JACKET01', 'B0HEADPH01', 'B0KURTA001']),
            ]))),
        linksProvider.overrideWithValue(links),
      ],
      child: const CartCrushApp(useGoogleFonts: false),
    );

Future<void> pumpApp(WidgetTester tester, FakeLinks links) async {
  // A tall phone screen so the cards under the hero are laid out.
  tester.view.physicalSize = const Size(1170, 6000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(app(links));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('home shows the deal of the hour and opens Amazon only from a button', (tester) async {
    final links = FakeLinks();
    await pumpApp(tester, links);
    expect(find.text('DEAL OF THE HOUR'), findsOneWidget);
    expect(find.textContaining('ANNI Designer Embroidered Kurta Set'), findsWidgets);
    await tester.tap(find.text('Get this deal on Amazon').first);
    expect(links.opened.single, startsWith('https://www.amazon.in/dp/'));
  });

  testWidgets('Ask from home filters the Deals tab', (tester) async {
    await pumpApp(tester, FakeLinks());
    await tester.enterText(find.byType(TextField).first, 'jacket under 1000 for dad');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.textContaining('1 deals for'), findsOneWidget);
    expect(find.textContaining('QNIM Men Bomber Jacket'), findsWidgets);
  });

  testWidgets('saving a deal shows it on the Saved tab', (tester) async {
    await pumpApp(tester, FakeLinks());
    await tester.tap(find.byTooltip('Save deal').first);
    await tester.pump();
    await tester.tap(find.text('Saved'));
    await tester.pumpAndSettle();
    expect(find.text('1 live · 0 ended'), findsOneWidget);
  });

  testWidgets('deal page shows price time, gallery and the Amazon button', (tester) async {
    final links = FakeLinks();
    await pumpApp(tester, links);
    await tester.tap(find.text('Deals'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Prestige Non-stick Kadai').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('Price as of'), findsOneWidget);
    expect(find.textContaining('You save'), findsOneWidget);
    expect(find.textContaining('As an Amazon Associate'), findsWidgets);
    await tester.tap(find.text('Get this deal on Amazon'));
    expect(links.opened.single, contains('tag=cartcrush004-21'));
  });

  test('a stale price is hidden', () {
    final d = Deal.fromEntry('B0STALE001', entry(checked: now.subtract(const Duration(days: 2))))!;
    expect(d.priceFresh(now), isFalse);
  });
}
