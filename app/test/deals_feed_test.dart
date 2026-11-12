import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:deal_finder/models/deal.dart';
import 'package:deal_finder/providers/deal_providers.dart';
import 'package:deal_finder/services/link_launcher.dart';
import 'package:deal_finder/ui/deal_card.dart';
import 'package:deal_finder/ui/deals_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeLauncher implements LinkLauncher {
  FakeLauncher({this.result = true});
  final bool result;
  final opened = <String>[];

  @override
  Future<bool> open(String url) async {
    opened.add(url);
    return result;
  }
}

const headphones = Deal(
  asin: 'B07PR1CL3S',
  title: 'boAt Rockerz 450 Bluetooth On Ear Headphones',
  price: 1299,
  originalPrice: 2399,
  discountPct: 46,
  currency: 'INR',
  imageUrl: 'https://m.media-amazon.com/images/I/61u1VALn6JL._SL1500_.jpg',
  url: 'https://www.amazon.in/dp/B07PR1CL3S/?tag=mytag-21',
);

const flask = Deal(
  asin: 'B01N7GYQ7M',
  title: 'Milton Thermosteel Flip Lid Flask, 1000 ml',
  price: 899,
  originalPrice: 1499,
  discountPct: 40,
  currency: 'INR',
  imageUrl: 'https://m.media-amazon.com/images/I/big.jpg',
  url: 'https://www.amazon.in/dp/B01N7GYQ7M/?tag=mytag-21',
);

Widget harness({required Stream<List<Deal>> stream, LinkLauncher? launcher}) {
  return ProviderScope(
    overrides: [
      dealsStreamProvider.overrideWith((ref) => stream),
      linkLauncherProvider.overrideWithValue(launcher ?? FakeLauncher()),
    ],
    child: const MaterialApp(home: DealsPage()),
  );
}

void main() {
  testWidgets('renders each deal with image, title, prices, discount and buy button', (tester) async {
    // Desktop-web-sized surface so the grid shows several columns.
    tester.view.physicalSize = const Size(1200, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(harness(stream: Stream.value([headphones, flask])));
    await tester.pumpAndSettle();

    expect(find.byType(DealCard), findsNWidgets(2));

    // title
    expect(find.text(headphones.title), findsOneWidget);
    // discounted price + struck-through original price
    expect(find.byKey(const ValueKey('deal-price-B07PR1CL3S')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const ValueKey('deal-price-B07PR1CL3S'))).data, '₹1,299');
    final mrp = tester.widget<Text>(find.byKey(const ValueKey('deal-mrp-B07PR1CL3S')));
    expect(mrp.data, '₹2,399');
    expect(mrp.style?.decoration, TextDecoration.lineThrough);
    expect(find.text('You save ₹1,100'), findsOneWidget);
    // discount badge
    expect(find.text('-46%'), findsOneWidget);
    expect(find.text('-40%'), findsOneWidget);
    // image points at the product image URL
    final img = tester.widget<Image>(find.byKey(const ValueKey('deal-image-B07PR1CL3S')));
    expect((img.image as NetworkImage).url, headphones.imageUrl);
    // action button
    expect(find.widgetWithText(FilledButton, 'Buy on Amazon'), findsNWidgets(2));
    // affiliate disclosure always visible
    expect(find.text(amazonDisclosure), findsOneWidget);
  });

  testWidgets('tapping Buy opens the exact affiliate URL', (tester) async {
    final launcher = FakeLauncher();
    await tester.pumpWidget(harness(stream: Stream.value([headphones]), launcher: launcher));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('deal-buy-B07PR1CL3S')));
    await tester.pump();

    expect(launcher.opened, ['https://www.amazon.in/dp/B07PR1CL3S/?tag=mytag-21']);
  });

  testWidgets('shows a snackbar when the link cannot be opened', (tester) async {
    await tester.pumpWidget(harness(stream: Stream.value([headphones]), launcher: FakeLauncher(result: false)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('deal-buy-B07PR1CL3S')));
    await tester.pumpAndSettle();
    expect(find.text('Could not open the link'), findsOneWidget);
  });

  testWidgets('updates live when the Firestore stream emits new data', (tester) async {
    final controller = StreamController<List<Deal>>();
    addTearDown(controller.close);
    await tester.pumpWidget(harness(stream: controller.stream));

    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    controller.add([headphones]);
    await tester.pumpAndSettle();
    expect(find.byType(DealCard), findsOneWidget);

    controller.add([headphones, flask]);
    await tester.pumpAndSettle();
    expect(find.byType(DealCard), findsNWidgets(2));
  });

  testWidgets('empty state', (tester) async {
    await tester.pumpWidget(harness(stream: Stream.value(const [])));
    await tester.pumpAndSettle();
    expect(find.textContaining('No live deals'), findsOneWidget);
  });

  testWidgets('error state offers retry', (tester) async {
    await tester.pumpWidget(harness(stream: Stream.error(Exception('permission-denied'))));
    await tester.pumpAndSettle();
    expect(find.text('Couldn\'t load deals.'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('broken product image falls back to an icon', (tester) async {
    // flutter_test's HTTP client returns 400 for every request, so the errorBuilder runs.
    await tester.pumpWidget(harness(stream: Stream.value([headphones])));
    await tester.pumpAndSettle();
    // Let the (mocked) HTTP request fail outside FakeAsync, then rebuild.
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pumpAndSettle();
    expect(find.byIcon(Icons.image_not_supported_outlined), findsOneWidget);
  });

  group('Deal.tryFromMap', () {
    test('parses a backend document', () {
      final d = Deal.tryFromMap('B07PR1CL3S', {
        'asin': 'B07PR1CL3S',
        'title': 'boAt',
        'price': 1299,
        'original_price': 2399.0,
        'discount_pct': 46,
        'currency': 'INR',
        'image_url': 'https://m.media-amazon.com/x.jpg',
        'url': 'https://www.amazon.in/dp/B07PR1CL3S/?tag=mytag-21',
        'updated_at': Timestamp.fromDate(DateTime.utc(2026, 11, 5)),
      })!;
      expect(d.price, 1299.0);
      expect(d.savings, 1100.0);
      expect(d.updatedAt, DateTime.utc(2026, 11, 5));
    });

    test('rejects malformed or non-Amazon documents', () {
      expect(Deal.tryFromMap('x', {'title': 'no price'}), isNull);
      expect(
        Deal.tryFromMap('x', {'title': 't', 'price': 1, 'original_price': 2, 'url': 'https://evil.example'}),
        isNull,
      );
    });
  });

  test('formatMoney uses Indian grouping for INR', () {
    expect(formatMoney(129999, 'INR'), '₹1,29,999');
    expect(formatMoney(19.5, 'USD'), '\$19.50');
  });
}
