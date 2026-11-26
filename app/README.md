# CartCrush app (Flutter, Android + iOS)

Reads the same product cache as the website (`catalog.json` on the cards Worker) and
`/app-data/collections.json` from the site — no Firestore reads from the app.

- Prices older than 24 h are hidden (Amazon Associates rule); every price shows its timestamp.
- Amazon links open in the Amazon app / browser (`LaunchMode.externalApplication`), never a WebView.
- One daily "new deals" push via the FCM topic `daily-deals` (no price alerts), sent by
  `.github/workflows/push.yml`.

```sh
flutter pub get
flutter test
flutter build apk --release --split-per-abi   # Android
flutter build ios --release                   # iOS (needs Xcode + Apple developer account)
```

App id: `com.cartcrush.app` (Android and iOS). Firebase project `deal-finder-d7a62`
(`flutterfire configure --project=deal-finder-d7a62 --platforms=android,ios`).
The site defaults to https://cartcrush.in (override with `--dart-define=SITE_URL=...`).
