import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../core/providers.dart';
import '../services/push.dart';
import 'theme.dart';
import 'widgets/common.dart';

/// About, contact, socials and the daily notification switch.
class AboutPage extends ConsumerStatefulWidget {
  const AboutPage({super.key});

  static Future<void> open(BuildContext context) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AboutPage()));

  @override
  ConsumerState<AboutPage> createState() => _AboutPageState();
}

class _AboutPageState extends ConsumerState<AboutPage> {
  late bool _push = Push.enabled(ref.read(prefsProvider));
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final links = ref.read(linksProvider);
    final prefs = ref.read(prefsProvider);
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('About CartCrush')),
      body: ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
            child: Text(
              'CartCrush checks Amazon India every few hours and keeps only real discounts: one card per product, '
              'no repeats. Tap a deal to see it, then buy on Amazon.',
              style: t.bodyLarge?.copyWith(height: 1.45),
            ),
          ),
          SwitchListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            title: const Text('Daily deals notification'),
            subtitle: Text(Push.available
                ? 'One notification a day when today\'s deals are ready.'
                : 'Not available in this build.'),
            value: _push,
            onChanged: !Push.available || _busy || prefs == null
                ? null
                : (on) async {
                    setState(() => _busy = true);
                    final result = await Push.setEnabled(prefs, on);
                    if (!mounted) return;
                    setState(() {
                      _push = result;
                      _busy = false;
                    });
                    if (on && !result) {
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                          content: Text('Notifications are off for CartCrush in your phone settings.')));
                    }
                  },
          ),
          const Divider(),
          const SectionTitle('Follow CartCrush'),
          for (final s in socials)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 20),
              leading: CircleAvatar(
                backgroundColor: Brand.coral.withValues(alpha: 0.12),
                child: Text(s.name[0], style: const TextStyle(color: Brand.coral, fontWeight: FontWeight.w800)),
              ),
              title: Text('${s.name} · ${s.handle}'),
              subtitle: Text(s.blurb),
              trailing: const Icon(Icons.open_in_new, size: 18),
              onTap: () => links.openExternal(s.url),
            ),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            leading: const Icon(Icons.mail_outline),
            title: const Text('Email us'),
            subtitle: const Text(AppConfig.email),
            onTap: () => links.email(AppConfig.email, 'CartCrush app'),
          ),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            leading: const Icon(Icons.public),
            title: const Text('Website'),
            subtitle: Text(AppConfig.siteUrl.replaceFirst('https://', '')),
            onTap: () => links.openExternal(AppConfig.siteUrl),
          ),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            leading: const Icon(Icons.privacy_tip_outlined),
            title: const Text('Privacy policy'),
            onTap: () => links.openExternal('${AppConfig.siteUrl}/privacy'),
          ),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20),
            leading: const Icon(Icons.info_outline),
            title: const Text('Affiliate disclosure'),
            onTap: () => links.openExternal('${AppConfig.siteUrl}/affiliate-disclosure'),
          ),
          const Disclosure(withPriceNote: true),
        ],
      ),
    );
  }
}
