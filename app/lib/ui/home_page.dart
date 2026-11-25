import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../core/providers.dart';
import '../data/catalog.dart';
import '../data/collections.dart';
import '../data/taxonomy.dart';
import '../logic/format.dart';
import '../logic/rules.dart';
import '../models/deal.dart';
import '../services/landing.dart';
import 'collections_page.dart';
import 'deal_page.dart';
import 'theme.dart';
import 'widgets/ask_bar.dart';
import 'widgets/common.dart';
import 'widgets/deal_card.dart';

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalog = ref.watch(catalogProvider);
    if (!catalog.isLoading) {
      // Notification permission is asked here, once the user has landed on the home page.
      WidgetsBinding.instance.addPostFrameCallback((_) => Landing.landed(ref.read(prefsProvider)));
    }
    return catalog.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => StateMessage(
        icon: Icons.wifi_off,
        title: 'Couldn\'t load today\'s deals',
        body: 'Check your connection and try again.',
        action: 'Try again',
        onAction: () => ref.invalidate(catalogProvider),
      ),
      data: (c) => RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(catalogProvider);
          ref.invalidate(collectionsProvider);
          await ref.read(catalogProvider.future);
        },
        child: _HomeBody(c),
      ),
    );
  }
}

class _HomeBody extends ConsumerWidget {
  const _HomeBody(this.c);
  final Catalog c;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = ref.watch(nowProvider)();
    final tax = ref.watch(taxonomyProvider).valueOrNull;
    final cols = ref.watch(collectionsProvider).valueOrNull;
    final mood = ref.watch(homeMoodProvider);
    final t = Theme.of(context).textTheme;

    final deals = withoutVariants(c.live.where((d) => d.priceFresh(now)));
    final hero = dealOfTheHour(deals, now);
    final rest = deals.where((d) => d != hero).toList();
    final winter = rest.where((d) => isWinter(d, now)).take(3).toList();
    Deal? firstWhere(bool Function(Deal) f) {
      for (final d in rest) {
        if (f(d)) return d;
      }
      return null;
    }

    final steal = firstWhere((d) => d.price < 500 && d.discountPct >= 50);
    final forHer = firstWhere((d) => isForHer(d) && d != steal);
    final home = firstWhere((d) => d.department == 'home-kitchen' && d != steal && d != forHer);
    final used = {hero, steal, forHer, home}.whereType<Deal>().map((d) => d.asin).toSet();
    final pool = rest.where((d) => !used.contains(d.asin)).toList();
    final crushes =
        (mood == Mood.all ? pool : pool.where((d) => moodsOf(d, now).contains(mood))).take(12).toList();
    final day = DateFormat('EEEE, d MMM').format(now.add(const Duration(hours: 5, minutes: 30)));

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Freshness(checked: c.lastChecked, now: now, offline: c.fromCache),
                const SizedBox(height: 14),
                Text(day.toUpperCase(),
                    style: t.labelMedium?.copyWith(color: context.tones.muted, letterSpacing: 0.8)),
                const SizedBox(height: 6),
                Text('Today\'s best price drops, picked for you.',
                    style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5, height: 1.15)),
                const SizedBox(height: 6),
                Text('Real discounts only, one card per product. ${deals.length} live deals right now.',
                    style: t.bodyMedium?.copyWith(color: context.tones.muted)),
                const SizedBox(height: 16),
                const AskBar(),
              ],
            ),
          ),
        ),
        if (hero != null)
          SliverToBoxAdapter(child: _Hero(hero, reasons(hero, deals, now, (s) => tax?.departmentName(s) ?? 'its category'))),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _Tiles(winter: winter, steal: steal, forHer: forHer, home: home, collections: cols),
          ),
        ),
        const SliverToBoxAdapter(child: SectionTitle('Crush-worthy right now')),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 44,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              children: [
                for (final m in Mood.values)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(moodLabels[m]!),
                      selected: mood == m,
                      onSelected: (_) => ref.read(homeMoodProvider.notifier).state = m,
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 12)),
        if (crushes.isEmpty)
          const SliverToBoxAdapter(
              child: Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Nothing in this mood right now.'))))
        else
          DealGrid(crushes),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: OutlinedButton(
              onPressed: () {
                ref.read(dealsQueryProvider.notifier).state = '';
                ref.read(dealsDepartmentProvider.notifier).state = null;
                ref.read(tabProvider.notifier).state = 1;
              },
              child: Text('See all ${deals.length} deals'),
            ),
          ),
        ),
        if (cols != null && cols.items.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: SectionTitle('Collections', action: 'All', onAction: () => ref.read(tabProvider.notifier).state = 2),
          ),
          SliverToBoxAdapter(child: _CollectionStrip(cols, c)),
        ],
        if (tax != null) ...[
          const SliverToBoxAdapter(child: SectionTitle('Shop by department')),
          SliverToBoxAdapter(child: _Departments(tax, deals)),
        ],
        const SliverToBoxAdapter(child: Disclosure(withPriceNote: true)),
      ],
    );
  }
}

class _Hero extends ConsumerWidget {
  const _Hero(this.d, this.why);
  final Deal d;
  final List<String> why;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => DealPage.open(context, d),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('DEAL OF THE HOUR',
                    style: t.labelSmall?.copyWith(color: Brand.coral, fontWeight: FontWeight.w800, letterSpacing: 1)),
                const SizedBox(height: 10),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 130,
                      height: 130,
                      child: Stack(children: [
                        Positioned.fill(child: ProductImage(d.imageUrl)),
                        Positioned(left: 6, top: 6, child: DiscountBadge(d.discountPct)),
                      ]),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(d.shortTitle,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700, height: 1.2)),
                          const SizedBox(height: 8),
                          PriceLine(price: d.price, mrp: d.originalPrice, currency: d.currency),
                          const SizedBox(height: 4),
                          Text('You save ${money(d.savings, d.currency)}',
                              style: TextStyle(color: context.tones.good, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ],
                ),
                if (why.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Text('Why it\'s a crush', style: t.labelLarge?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  for (final r in why)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(children: [
                        const Icon(Icons.check_circle, size: 16, color: Brand.coral),
                        const SizedBox(width: 8),
                        Expanded(child: Text(r)),
                      ]),
                    ),
                ],
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => ref.read(linksProvider).openExternal(d.url),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  child: const Text('Get this deal on Amazon'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tiles extends ConsumerWidget {
  const _Tiles({required this.winter, this.steal, this.forHer, this.home, this.collections});
  final List<Deal> winter;
  final Deal? steal;
  final Deal? forHer;
  final Deal? home;
  final Collections? collections;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    DealCollection? winterCol;
    for (final c in collections?.items ?? const <DealCollection>[]) {
      if (c.group == 'Winter') {
        winterCol = c;
        break;
      }
    }
    final tiles = <Widget>[
      if (winter.isNotEmpty)
        _Tile(
          kicker: 'Winter edit',
          title: 'Stay warm from ${money(winter.map((d) => d.price).reduce((a, b) => a < b ? a : b))}',
          tint: Brand.winter,
          images: winter.map((d) => d.imageUrl).toList(),
          onTap: () => winterCol != null
              ? CollectionPage.open(context, winterCol)
              : _toDeals(ref, 'winter'),
        ),
      if (steal != null)
        _Tile(
          kicker: 'Under ₹499',
          title: '${snippet(steal!.shortTitle)} · ${money(steal!.price)}',
          tint: Brand.coral,
          images: [steal!.imageUrl],
          onTap: () => DealPage.open(context, steal!),
        ),
      if (forHer != null)
        _Tile(
          kicker: 'For her',
          title: '${snippet(forHer!.shortTitle)} · ${forHer!.discountPct}% off',
          tint: Brand.her,
          images: [forHer!.imageUrl],
          onTap: () => DealPage.open(context, forHer!),
        ),
      if (home != null)
        _Tile(
          kicker: 'Home',
          title: '${snippet(home!.shortTitle)} · ${home!.discountPct}% off',
          tint: Brand.homeTint,
          images: [home!.imageUrl],
          onTap: () => DealPage.open(context, home!),
        ),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 0.92,
      children: tiles,
    );
  }

  void _toDeals(WidgetRef ref, String q) {
    ref.read(dealsQueryProvider.notifier).state = q;
    ref.read(tabProvider.notifier).state = 1;
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.kicker, required this.title, required this.tint, required this.images, required this.onTap});
  final String kicker;
  final String title;
  final Color tint;
  final List<String> images;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      color: Color.alphaBlend(tint.withValues(alpha: 0.08), context.tones.surface),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(kicker.toUpperCase(),
                  style: t.labelSmall?.copyWith(color: tint, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
              const SizedBox(height: 4),
              Text(title, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w700, height: 1.2)),
              const SizedBox(height: 8),
              Expanded(
                child: Row(
                  children: [
                    for (final img in images.take(3))
                      Expanded(
                        child: Padding(padding: const EdgeInsets.only(right: 4), child: ProductImage(img, padding: 4)),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CollectionStrip extends StatelessWidget {
  const _CollectionStrip(this.cols, this.catalog);
  final Collections cols;
  final Catalog catalog;

  @override
  Widget build(BuildContext context) {
    final items = cols.items.where((c) => c.allAsins.length >= 3).take(8).toList();
    return SizedBox(
      height: 200,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => SizedBox(width: 230, child: CollectionTile(items[i], catalog)),
      ),
    );
  }
}

class _Departments extends ConsumerWidget {
  const _Departments(this.tax, this.deals);
  final Taxonomy tax;
  final List<Deal> deals;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final counts = <String, int>{};
    for (final d in deals) {
      counts[d.department] = (counts[d.department] ?? 0) + 1;
    }
    final shelves = tax.departments.where((d) => (counts[d.slug] ?? 0) > 0).toList()
      ..sort((a, b) => counts[b.slug]! - counts[a.slug]!);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final d in shelves)
            ActionChip(
              avatar: Text(d.icon),
              label: Text('${d.name} · ${counts[d.slug]}'),
              onPressed: () {
                ref.read(dealsQueryProvider.notifier).state = '';
                ref.read(dealsDepartmentProvider.notifier).state = d.slug;
                ref.read(tabProvider.notifier).state = 1;
              },
            ),
        ],
      ),
    );
  }
}
