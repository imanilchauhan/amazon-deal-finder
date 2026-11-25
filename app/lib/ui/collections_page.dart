import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';
import '../data/catalog.dart';
import '../data/collections.dart';
import '../models/deal.dart';
import 'theme.dart';
import 'widgets/common.dart';
import 'widgets/deal_card.dart';

List<Deal> _resolve(Catalog c, Iterable<String> asins, DateTime now) =>
    [for (final a in asins) if (c.byAsin(a) case final d? when d.priceFresh(now)) d];

/// All collections, grouped like the website (Winter, Gifts, Everyday basics…).
class CollectionsPage extends ConsumerWidget {
  const CollectionsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cols = ref.watch(collectionsProvider);
    final catalog = ref.watch(catalogProvider).valueOrNull;
    return cols.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => StateMessage(
        icon: Icons.wifi_off,
        title: 'Couldn\'t load collections',
        action: 'Try again',
        onAction: () => ref.invalidate(collectionsProvider),
      ),
      data: (cs) {
        if (catalog == null) return const Center(child: CircularProgressIndicator());
        final groups = [
          for (final g in cs.groups)
            (g, cs.items.where((c) => c.group == g && c.allAsins.isNotEmpty).toList()),
        ].where((x) => x.$2.isNotEmpty).toList();
        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(collectionsProvider);
            await ref.read(collectionsProvider.future);
          },
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Text('Curated shelves that stay useful: the best live deals for each, refreshed all day.',
                      style: TextStyle(color: context.tones.muted)),
                ),
              ),
              for (final (group, items) in groups) ...[
                SliverToBoxAdapter(child: SectionTitle(group)),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 260,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.05,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (_, i) => CollectionTile(items[i], catalog),
                      childCount: items.length,
                    ),
                  ),
                ),
              ],
              const SliverToBoxAdapter(child: Disclosure()),
            ],
          ),
        );
      },
    );
  }
}

class CollectionTile extends ConsumerWidget {
  const CollectionTile(this.col, this.catalog, {super.key});
  final DealCollection col;
  final Catalog catalog;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = ref.watch(nowProvider)();
    final items = _resolve(catalog, col.allAsins, now);
    final t = Theme.of(context).textTheme;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => CollectionPage.open(context, col),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Row(children: [
                  for (final d in items.take(3))
                    Expanded(
                      child: Padding(
                          padding: const EdgeInsets.only(right: 4), child: ProductImage(d.imageUrl, padding: 4)),
                    ),
                ]),
              ),
              const SizedBox(height: 10),
              Text(col.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800, height: 1.2)),
              const SizedBox(height: 2),
              Text('${items.length} picks', style: t.bodySmall?.copyWith(color: context.tones.muted)),
            ],
          ),
        ),
      ),
    );
  }
}

class CollectionPage extends ConsumerWidget {
  const CollectionPage(this.col, {super.key});
  final DealCollection col;

  static Future<void> open(BuildContext context, DealCollection c) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => CollectionPage(c)));

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalog = ref.watch(catalogProvider).valueOrNull;
    final now = ref.watch(nowProvider)();
    final t = Theme.of(context).textTheme;
    final blocks = catalog == null
        ? <(String, List<Deal>)>[]
        : [
            ('Our picks', _resolve(catalog, col.picks, now)),
            ('Top deals right now', _resolve(catalog, col.topDeals, now)),
            for (final s in col.sections) (s.heading, _resolve(catalog, s.asins, now)),
          ].where((b) => b.$2.isNotEmpty).toList();
    return Scaffold(
      appBar: AppBar(
        title: Text(col.group),
        actions: [
          IconButton(
            tooltip: 'Open on the website',
            icon: const Icon(Icons.public),
            onPressed: () => ref.read(linksProvider).openExternal(col.pageUrl),
          ),
        ],
      ),
      body: catalog == null
          ? const Center(child: CircularProgressIndicator())
          : CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(col.title,
                            style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4)),
                        const SizedBox(height: 8),
                        for (final p in col.intro.take(2))
                          Padding(
                            padding: const EdgeInsets.only(bottom: 6),
                            child: Text(p, style: TextStyle(color: context.tones.muted, height: 1.4)),
                          ),
                      ],
                    ),
                  ),
                ),
                if (blocks.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: StateMessage(icon: Icons.inventory_2_outlined, title: 'No live deals here right now'),
                  ),
                for (final (heading, deals) in blocks) ...[
                  SliverToBoxAdapter(child: SectionTitle(heading)),
                  DealGrid(deals),
                ],
                const SliverToBoxAdapter(child: Disclosure(withPriceNote: true)),
              ],
            ),
    );
  }
}
