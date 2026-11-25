/// Same rules as the website (web/src/lib/themes.ts, ask.ts, variants.ts), so the app and
/// the site pick, label and filter deals the same way.
library;

import '../models/deal.dart';

// ---- themes ----------------------------------------------------------------------------

final _winterRx = RegExp(
    r'\b(winter|thermal|woolen|woollen|wool|fleece|sweater|sweatshirt|hoodie|jacket|puffer|cardigan|shawl|stole|muffler|beanie|gloves|blanket|quilt|comforter|razai|dohar|room heater|heater|geyser|water heater|electric blanket|hot water bag|warmer)\b',
    caseSensitive: false);
final _notWinterRx = RegExp(
    r'\bac\s+(comforter|blanket|quilt|dohar|duvet)|\bsummer\b|\bcooling\b|\bstorage\b|\borgani[sz]er\b|\bvacuum bag',
    caseSensitive: false);
final _kidsRx = RegExp(r'\b(girls?|kids?|baby|babies|toddler|infant|child|children|years?)\b', caseSensitive: false);
const _giftDepts = {'electronics', 'toys-games'};
const _giftCats = {'watches', 'jewellery', 'bags-luggage', 'fragrance', 'smartwatches-bands', 'headphones-earbuds'};
const _homeDepts = {'home-kitchen', 'large-appliances', 'home-improvement-garden'};
const _winterMonths = {11, 12, 1, 2}; // Nov–Feb

bool isWinter(Deal d, DateTime now) =>
    _winterMonths.contains(now.month) && _winterRx.hasMatch(d.title) && !_notWinterRx.hasMatch(d.title);

bool isForHer(Deal d) =>
    d.gender == 'women' &&
    (d.department == 'fashion' || d.department == 'beauty-personal-care') &&
    !_kidsRx.hasMatch(d.title);

enum Mood { all, winter, her, gifts, home, under499 }

const moodLabels = {
  Mood.all: 'All deals',
  Mood.winter: 'Winter',
  Mood.her: 'For her',
  Mood.gifts: 'Gifts',
  Mood.home: 'Home',
  Mood.under499: 'Under ₹499',
};

Set<Mood> moodsOf(Deal d, DateTime now) => {
      if (isWinter(d, now)) Mood.winter,
      if (isForHer(d)) Mood.her,
      if (_giftDepts.contains(d.department) || _giftCats.contains(d.category)) Mood.gifts,
      if (_homeDepts.contains(d.department)) Mood.home,
      if (d.price < 500) Mood.under499,
    };

/// One short, factual label for a card, or '' for none.
String dealTag(Deal d, DateTime now) {
  if (isWinter(d, now)) return 'Winter warmer';
  if (isForHer(d)) return 'For her';
  if (_giftCats.contains(d.category) || _giftDepts.contains(d.department)) return 'Gift idea';
  if (d.department == 'home-kitchen') return 'Home pick';
  if (d.price < 500) return 'Under ₹500';
  return '';
}

// ---- one card per product family ----------------------------------------------------

final _variantWords = RegExp(
    r'\b(black|white|blue|navy|red|green|sea green|olive|grey|gray|silver|gold|golden|rose|pink|peach|purple|violet|maroon|wine|yellow|orange|brown|beige|cream|teal|multicolou?r|small|medium|large|xl|xxl|xs|s|m|l|cabin|check[- ]?in|pack|set|of|combo|size|sizes|\d+(\.\d+)?\s?(l|ml|kg|g|gb|tb|cm|mm|inch|inches|feet|ft|pcs|pieces|litre|liter)?)\b',
    caseSensitive: false);
const _familyStop = {
  'for', 'with', 'and', 'the', 'in', 'to', 'a', 'men', 'mens', 'women', 'womens', 'unisex', 'boys', 'girls', //
  'kids', 'adults', 'adult', 'new', 'latest', 'stylish', 'premium',
};

/// Same product in another colour/size/pack gets the same key.
String familyKey(Deal d) {
  final words = d.title
      .toLowerCase()
      .replaceAll(_variantWords, ' ')
      .replaceAll(RegExp(r'[^a-z0-9 ]+'), ' ')
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .toList();
  final brand = d.brand.toLowerCase().trim();
  final b = brand.isEmpty ? <String>[] : brand.split(RegExp(r'\s+'));
  var startsWithBrand = b.isNotEmpty && b.length <= words.length;
  for (var i = 0; startsWithBrand && i < b.length; i++) {
    if (words[i] != b[i]) startsWithBrand = false;
  }
  final rest = startsWithBrand ? words.sublist(b.length) : words;
  return '$brand|${rest.where((w) => !_familyStop.contains(w)).take(3).join(' ')}';
}

/// Keep the first deal of each product family (lists are already sorted best first).
List<Deal> withoutVariants(Iterable<Deal> deals) {
  final seen = <String>{};
  return [for (final d in deals) if (seen.add(familyKey(d))) d];
}

// ---- Ask CartCrush ------------------------------------------------------------------------

enum Who { men, women, kids }

class Ask {
  const Ask({this.words = const [], this.max, this.min, this.who});
  final List<String> words;
  final int? max;
  final int? min;
  final Who? who;
  bool get isEmpty => words.isEmpty && max == null && min == null && who == null;
}

final _who = <Who, RegExp>{
  Who.women: RegExp(
      r'\b(women|woman|womens|ladies|her|she|mom|mother|mum|wife|girlfriend|sister|daughter in law|bhabhi|didi|aunt)\b',
      caseSensitive: false),
  Who.men: RegExp(r'\b(men|man|mens|him|he|dad|father|papa|husband|boyfriend|brother|bhai|uncle)\b',
      caseSensitive: false),
  Who.kids: RegExp(r'\b(kids?|child|children|son|daughter|baby|toddler|boy|girl)\b', caseSensitive: false),
};
final _askStop = ('a an the for my me to of and or with in on at under below less than within upto up over above '
        'from best good nice cheap cheapest new buy deal deals gift gifts present something some any i need want '
        'looking find show please')
    .split(' ')
    .toSet();
const _synonyms = <String, List<String>>{
  'warm': ['jacket', 'sweater', 'sweatshirt', 'hoodie', 'thermal', 'blanket', 'heater', 'shawl', 'fleece', 'cardigan'],
  'winter': ['jacket', 'sweater', 'sweatshirt', 'hoodie', 'thermal', 'blanket', 'heater', 'shawl', 'fleece', 'cardigan'],
  'earphones': ['earbuds', 'earphone', 'headphone', 'neckband'],
  'phone': ['phone', 'mobile'],
};

int? _amount(String s) {
  final m = RegExp(r'^(\d+(?:\.\d+)?)(k)?$', caseSensitive: false).firstMatch(s.replaceAll(RegExp(r'[,₹\s]'), ''));
  if (m == null) return null;
  return (double.parse(m.group(1)!) * (m.group(2) != null ? 1000 : 1)).round();
}

/// "warm jacket under ₹1,000 for my dad" → words [warm, jacket], max 1000, who men.
Ask parseAsk(String text) {
  var t = ' ${text.toLowerCase()} ';
  const num = r'₹?\s?([\d,]+(?:\.\d+)?k?)';
  int? max;
  int? min;
  Who? who;
  final under = RegExp(r'\b(?:under|below|less than|within|upto|up to|max|<)\s*(?:rs\.?|inr)?\s*' + num,
          caseSensitive: false)
      .firstMatch(t);
  if (under != null) {
    max = _amount(under.group(1)!);
    t = t.replaceFirst(under.group(0)!, ' ');
  }
  final over = RegExp(r'\b(?:over|above|more than|from|min|>)\s*(?:rs\.?|inr)?\s*' + num, caseSensitive: false)
      .firstMatch(t);
  if (over != null) {
    min = _amount(over.group(1)!);
    t = t.replaceFirst(over.group(0)!, ' ');
  }
  for (final e in _who.entries) {
    if (e.value.hasMatch(t)) {
      who = e.key;
      t = t.replaceAll(e.value, ' ');
      break;
    }
  }
  final words = t
      .replaceAll(RegExp(r'[^a-z0-9\s-]'), ' ')
      .split(RegExp(r'\s+'))
      .where((w) => w.length > 1 && !_askStop.contains(w) && !RegExp(r'^\d+$').hasMatch(w))
      .toList();
  return Ask(words: words, max: max, min: min, who: who);
}

/// True when the title fits every keyword (a keyword with synonyms fits any of them).
bool titleMatches(String title, List<String> words) {
  final t = title.toLowerCase();
  return words.every((w) {
    final alts = _synonyms[w] ?? [w.replaceAll(RegExp(r's$'), '')];
    return alts.any(t.contains);
  });
}

bool askMatches(Deal d, Ask a) {
  if (a.max != null && d.price > a.max!) return false;
  if (a.min != null && d.price < a.min!) return false;
  if (a.who != null) {
    final want = a.who!.name;
    if (d.gender.isNotEmpty && d.gender != want && d.gender != 'unisex') return false;
  }
  return titleMatches('${d.title} ${d.brand}', a.words);
}

// ---- home page picks ---------------------------------------------------------------------

/// Hero pick: a strong, real discount on something people browse for, boosted for season and audience.
Deal? dealOfTheHour(List<Deal> deals, DateTime now) {
  int score(Deal d) => d.discountPct + (isWinter(d, now) ? 8 : 0) + (isForHer(d) ? 8 : 0);
  final pool = deals
      .where((d) => d.discountPct >= 30 && d.price >= 199 && d.department != 'uncategorised' && d.imageUrl.isNotEmpty)
      .toList()
    ..sort((a, b) => score(b) - score(a));
  return pool.isEmpty ? null : pool.first;
}

/// "Why it's a crush" reasons for the hero deal.
List<String> reasons(Deal d, List<Deal> all, DateTime now, String Function(String) deptName) {
  final out = <String>[];
  if (all.where((x) => x.department == d.department).every((x) => x.discountPct <= d.discountPct)) {
    out.add('Biggest discount in ${deptName(d.department).toLowerCase()} today');
  }
  for (final cap in [300, 500, 1000, 2000]) {
    if (d.price < cap) {
      out.add('Under ₹$cap');
      break;
    }
  }
  if (isWinter(d, now)) {
    out.add('Winter pick');
  } else if (isForHer(d)) {
    out.add('For her');
  }
  return out.take(3).toList();
}
