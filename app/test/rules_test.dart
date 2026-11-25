import 'package:deal_finder/logic/format.dart';
import 'package:deal_finder/logic/rules.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fixtures.dart';

void main() {
  group('Ask', () {
    test('warm jacket under 1000 for my dad', () {
      final a = parseAsk('warm jacket under ₹1,000 for my dad');
      expect(a.max, 1000);
      expect(a.who, Who.men);
      expect(a.words, ['warm', 'jacket']);
    });

    test('gift for mom under 500 and 2k budgets', () {
      final a = parseAsk('gift for mom under 500');
      expect(a.who, Who.women);
      expect(a.max, 500);
      expect(a.words, isEmpty);
      expect(parseAsk('earbuds below 2k').max, 2000);
      expect(parseAsk('watch above 1500').min, 1500);
    });

    test('synonyms: warm matches a hoodie, earphones match earbuds', () {
      expect(titleMatches('Men Fleece Hoodie', ['warm']), isTrue);
      expect(titleMatches('Wireless Earbuds 60H', ['earphones']), isTrue);
      expect(titleMatches('Steel bottle', ['jacket']), isFalse);
    });

    test('askMatches checks price and who', () {
      final jacket = deal('B0JACKET01', title: 'Men Bomber Jacket', price: 899, gender: 'men', department: 'fashion');
      expect(askMatches(jacket, parseAsk('jacket under 1000 for dad')), isTrue);
      expect(askMatches(jacket, parseAsk('jacket under 500')), isFalse);
      expect(askMatches(jacket, parseAsk('jacket for my wife')), isFalse);
    });
  });

  group('themes', () {
    test('winter only Nov–Feb and not AC blankets', () {
      final hoodie = deal('B0HOODIE01', title: 'Fleece Hoodie for Men');
      expect(isWinter(hoodie, DateTime.utc(2026, 12, 1)), isTrue);
      expect(isWinter(hoodie, DateTime.utc(2026, 6, 1)), isFalse);
      expect(isWinter(deal('B0ACBLNKT1', title: 'AC Blanket for summer'), DateTime.utc(2026, 12, 1)), isFalse);
    });

    test('for her excludes kids', () {
      expect(isForHer(deal('B0TOP00001', title: 'Women Floral Top', gender: 'women', department: 'fashion')), isTrue);
      expect(isForHer(deal('B0GIRL0001', title: 'Girls Frock 5 years', gender: 'women', department: 'fashion')),
          isFalse);
    });

    test('dealTag and moods', () {
      final kadai = deal('B0KADAI001', title: 'Non-stick Kadai', department: 'home-kitchen', price: 399, category: 'cookware');
      expect(dealTag(kadai, now), 'Home pick');
      expect(moodsOf(kadai, now), containsAll([Mood.home, Mood.under499]));
    });
  });

  test('one card per product family', () {
    final a = deal('B0SUITCAS1', title: 'HRX Cabin Size Black Suitcase', brand: 'HRX');
    final b = deal('B0SUITCAS2', title: 'HRX Cabin Size Teal Suitcase', brand: 'HRX');
    final c = deal('B0BOTTLE01', title: 'Milton Steel Bottle 1L', brand: 'Milton');
    expect(withoutVariants([a, b, c]).map((d) => d.asin), ['B0SUITCAS1', 'B0BOTTLE01']);
  });

  test('deal of the hour prefers real discounts on categorised products', () {
    final cheap = deal('B0CHEAP001', price: 99, pct: 90);
    final good = deal('B0GOOD0001', price: 999, pct: 70);
    final other = deal('B0OTHER001', price: 999, pct: 80, department: 'uncategorised');
    expect(dealOfTheHour([cheap, good, other], now)?.asin, 'B0GOOD0001');
  });

  group('format', () {
    test('Indian money grouping', () {
      expect(money(123456), '₹1,23,456');
      expect(money(499.5), '₹499.50');
    });

    test('short title and slug match the website', () {
      const t = 'boAt Rockerz 450 Bluetooth On Ear Headphones with Mic, Upto 15 Hours Playback | Adjustable';
      expect(shortTitle(t), 'boAt Rockerz 450 Bluetooth On Ear Headphones with Mic');
      expect(dealSlug(t, 'B0ABC12345'), 'boat-rockerz-450-bluetooth-on-ear-headphones-with-mic-b0abc12345');
    });

    test('IST timestamp', () {
      expect(istDateTime(DateTime.utc(2026, 11, 12, 7, 56)), '12 Nov 2026, 1:26 pm IST');
    });
  });
}
