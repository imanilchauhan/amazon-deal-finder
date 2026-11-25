import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';
import 'about_page.dart';
import 'collections_page.dart';
import 'deals_page.dart';
import 'home_page.dart';
import 'saved_page.dart';
import 'theme.dart';

/// Bottom tabs: Home, Deals, Collections, Saved. Tabs keep their scroll position.
class AppShell extends ConsumerWidget {
  const AppShell({super.key});

  static const _titles = ['CartCrush', 'All deals', 'Collections', 'Saved'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(tabProvider);
    final savedCount = ref.watch(savedProvider).length;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: tab == 0
            ? Row(children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: const BoxDecoration(color: Brand.coral, shape: BoxShape.circle),
                  child: const Icon(Icons.favorite, size: 15, color: Colors.white),
                ),
                const SizedBox(width: 8),
                const Text('CartCrush'),
              ])
            : Text(_titles[tab]),
        actions: [
          IconButton(
            tooltip: 'About and settings',
            icon: const Icon(Icons.info_outline),
            onPressed: () => AboutPage.open(context),
          ),
        ],
      ),
      body: IndexedStack(
        index: tab,
        children: const [HomePage(), DealsPage(), CollectionsPage(), SavedPage()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: tab,
        onDestinationSelected: (i) => ref.read(tabProvider.notifier).state = i,
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(
              icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer), label: 'Deals'),
          const NavigationDestination(
              icon: Icon(Icons.collections_bookmark_outlined),
              selectedIcon: Icon(Icons.collections_bookmark),
              label: 'Collections'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: savedCount > 0,
              label: Text('$savedCount'),
              child: const Icon(Icons.favorite_border),
            ),
            selectedIcon: const Icon(Icons.favorite),
            label: 'Saved',
          ),
        ],
      ),
    );
  }
}
