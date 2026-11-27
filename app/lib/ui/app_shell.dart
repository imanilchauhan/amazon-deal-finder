import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';
import 'about_page.dart';
import 'collections_page.dart';
import 'deals_page.dart';
import 'glass.dart';
import 'home_page.dart';
import 'saved_page.dart';
import 'theme.dart';
import 'widgets/glass_tab_bar.dart';

/// Bottom tabs: Home, Deals, Collections, Saved. Tabs keep their scroll position.
/// The top bar and the tab bar are frosted glass floating over the content.
class AppShell extends ConsumerWidget {
  const AppShell({super.key});

  static const _titles = ['CartCrush', 'All deals', 'Collections', 'Saved'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tab = ref.watch(tabProvider);
    final savedCount = ref.watch(savedProvider).length;
    return Scaffold(
      extendBody: true,
      extendBodyBehindAppBar: true,
      appBar: GlassAppBar(
        titleSpacing: 20,
        title: tab == 0
            ? Row(children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(colors: [Brand.coral, Brand.deep]),
                    boxShadow: [BoxShadow(color: Brand.coral.withValues(alpha: 0.35), blurRadius: 10)],
                  ),
                  child: const Icon(Icons.favorite, size: 15, color: Colors.white),
                ),
                const SizedBox(width: 9),
                const Text('CartCrush'),
              ])
            : Text(_titles[tab]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: GlassIconButton(
              tooltip: 'About and settings',
              icon: Icons.info_outline,
              size: 40,
              onPressed: () => AboutPage.open(context),
            ),
          ),
        ],
      ),
      body: GlassBackdrop(
        child: IndexedStack(
          index: tab,
          children: const [HomePage(), DealsPage(), CollectionsPage(), SavedPage()],
        ),
      ),
      bottomNavigationBar: GlassTabBar(
        index: tab,
        onSelected: (i) => ref.read(tabProvider.notifier).state = i,
        tabs: [
          const GlassTab(icon: Icons.home_outlined, selectedIcon: Icons.home_rounded, label: 'Home'),
          const GlassTab(icon: Icons.local_offer_outlined, selectedIcon: Icons.local_offer, label: 'Deals'),
          const GlassTab(
              icon: Icons.collections_bookmark_outlined,
              selectedIcon: Icons.collections_bookmark,
              label: 'Collections'),
          GlassTab(
              icon: Icons.favorite_border, selectedIcon: Icons.favorite, label: 'Saved', badge: savedCount),
        ],
      ),
    );
  }
}
