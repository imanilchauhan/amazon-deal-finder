import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';
import '../logic/format.dart';
import '../logic/rules.dart';
import 'theme.dart';
import 'widgets/ask_bar.dart';
import 'widgets/common.dart';
import 'widgets/deal_card.dart';

enum Sort { discount, priceLow, newest }

const _sortLabels = {Sort.discount: 'Biggest discount', Sort.priceLow: 'Lowest price', Sort.newest: 'Newest'};

final dealsSortProvider = StateProvider<Sort>((ref) => Sort.discount);

/// Every live deal, filtered by the Ask/search sentence and department, one card per product.
class DealsPage extends ConsumerWidget {
  const DealsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalog = ref.watch(catalogProvider);
    final query = ref.watch(dealsQueryProvider);
    final dept = ref.watch(dealsDepartmentProvider);
    final sort = ref.watch(dealsSortProvider);
    final tax = ref.watch(taxonomyProvider).valueOrNull;
    final now = ref.watch(nowProvider)();

    return catalog.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => StateMessage(
        icon: Icons.wifi_off,
        title: 'Couldn\'t load deals',
        action: 'Try again',
        onAction: () => ref.invalidate(catalogProvider),
      ),
      data: (c) {
        final ask = parseAsk(query);
        var list = c.live.where((d) => d.priceFresh(now));
        if (dept != null) list = list.where((d) => d.department == dept);
        if (!ask.isEmpty) list = list.where((d) => askMatches(d, ask));
        final sorted = list.toList();
        switch (sort) {
          case Sort.discount:
            break; // the catalogue is already biggest discount first
          case Sort.priceLow:
            sorted.sort((a, b) => a.price.compareTo(b.price));
          case Sort.newest:
            sorted.sort((a, b) => (b.firstSeenAt ?? DateTime(2000)).compareTo(a.firstSeenAt ?? DateTime(2000)));
        }
        final deals = withoutVariants(sorted);
        final counts = <String, int>{};
        for (final d in c.live) {
          counts[d.department] = (counts[d.department] ?? 0) + 1;
        }
        final depts = (tax?.departments ?? const []).where((d) => (counts[d.slug] ?? 0) > 0).toList()
          ..sort((a, b) => counts[b.slug]! - counts[a.slug]!);

        return RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(catalogProvider);
            await ref.read(catalogProvider.future);
          },
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  child: AskBar(
                    initial: query,
                    onSubmitted: (q) {
                      ref.read(dealsQueryProvider.notifier).state = q;
                      FocusScope.of(context).unfocus();
                    },
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 50,
                  child: ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    scrollDirection: Axis.horizontal,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: const Text('All'),
                          selected: dept == null,
                          onSelected: (_) => ref.read(dealsDepartmentProvider.notifier).state = null,
                        ),
                      ),
                      for (final d in depts)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text('${d.icon} ${d.name}'),
                            selected: dept == d.slug,
                            onSelected: (_) => ref.read(dealsDepartmentProvider.notifier).state = d.slug,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 8, 8),
                  child: Row(
                    children: [
                      Expanded(child: _Summary(count: deals.length, ask: ask, raw: query)),
                      PopupMenuButton<Sort>(
                        tooltip: 'Sort',
                        initialValue: sort,
                        onSelected: (s) => ref.read(dealsSortProvider.notifier).state = s,
                        itemBuilder: (_) => [
                          for (final s in Sort.values) PopupMenuItem(value: s, child: Text(_sortLabels[s]!)),
                        ],
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Text(_sortLabels[sort]!, style: const TextStyle(fontWeight: FontWeight.w600)),
                            const Icon(Icons.expand_more),
                          ]),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (deals.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: StateMessage(
                    icon: Icons.search_off,
                    title: 'No deals match that right now',
                    body: 'Try fewer words or a higher budget.',
                    action: 'Clear filters',
                    onAction: () {
                      ref.read(dealsQueryProvider.notifier).state = '';
                      ref.read(dealsDepartmentProvider.notifier).state = null;
                    },
                  ),
                )
              else
                DealGrid(deals),
              const SliverToBoxAdapter(child: Disclosure(withPriceNote: true)),
            ],
          ),
        );
      },
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.count, required this.ask, required this.raw});
  final int count;
  final Ask ask;
  final String raw;

  @override
  Widget build(BuildContext context) {
    final bits = <String>[
      if (ask.who != null) 'for ${ask.who!.name}',
      if (ask.max != null) 'under ${money(ask.max!)}',
      if (ask.min != null) 'from ${money(ask.min!)}',
    ];
    final title = raw.isEmpty ? '$count deals' : '$count deals for “${raw.length > 40 ? '${raw.substring(0, 40)}…' : raw}”';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        if (bits.isNotEmpty) Text(bits.join(' · '), style: TextStyle(color: context.tones.muted, fontSize: 13)),
      ],
    );
  }
}
