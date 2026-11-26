/// Where the app gets its data and what it says. Override at build time with
/// `--dart-define=SITE_URL=...` (e.g. a preview deploy).
class AppConfig {
  AppConfig._();

  static const siteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'https://cartcrush.in');

  /// Product cache written by the scraper after every run (no Firestore reads).
  static const catalogUrl = String.fromEnvironment(
    'CATALOG_URL',
    defaultValue: 'https://cartcrush-cards.imanilchauhan3.workers.dev/catalog.json',
  );

  /// Collections, built with the website from the same cache.
  static String get collectionsUrl => '$siteUrl/app-data/collections.json';

  /// The once-a-day "new deals" notification (Firebase Cloud Messaging topic).
  static const pushTopic = 'daily-deals';

  static const email = 'crushcart004.21@gmail.com';

  static const amazonDisclosure = 'As an Amazon Associate, CartCrush earns from qualifying purchases.';
  static const priceDisclaimer =
      'Prices and availability are accurate as of the date and time shown and are subject to change. '
      'The price and availability shown on Amazon at the time of purchase will apply.';

  /// Amazon only lets us show a price for 24 hours after it was checked.
  static const priceFreshFor = Duration(hours: 24);
}

class Social {
  const Social(this.name, this.handle, this.url, this.blurb);
  final String name;
  final String handle;
  final String url;
  final String blurb;
}

const socials = <Social>[
  Social('Instagram', '@crush_cart_deals', 'https://instagram.com/crush_cart_deals',
      'Deal videos every hour from 9 AM to 10 PM.'),
  Social('Facebook', 'CartCrush Deals', 'https://facebook.com/1430044273527286',
      'Every deal with a direct link, plus a collection of the week on Sundays.'),
  Social('X', '@cartcrushdeals', 'https://x.com/cartcrushdeals', 'The fastest way to catch new price drops.'),
];
