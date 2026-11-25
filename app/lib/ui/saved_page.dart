import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/providers.dart';
import '../models/deal.dart';
import 'deal_page.dart';
import 'theme.dart';
import 'widgets/common.dart';
import 'widgets/deal_card.dart';

/// Deals saved with the heart, kept on this phone. Ended deals stay listed (with a note)
/// until removed.
class SavedPage extends ConsumerWidget {
  const SavedPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(savedProvider);
    final catalog = ref.watch(catalogProvider).valueOrNull;
    final now = ref.watch(nowProvider)();
    if (saved.isEmpty) {
      return const StateMessage(
        icon: Icons.favorite_border,
        title: 'No saved deals yet',
        body: 'Tap the heart on any deal to keep it here. Saved deals stay on this phone.',
      );
    }
    if (catalog == null) return const Center(child: CircularProgressIndicator());
    final live = <Deal>[];
    final gone = <String>[];
    for (final a in saved) {
      final d = catalog.byAsin(a);
      if (d != null && d.priceFresh(now)) {
        live.add(d);
      } else {
        gone.add(a);
      }
    }
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Text('${live.length} live · ${gone.length} ended',
                style: TextStyle(color: context.tones.muted, fontWeight: FontWeight.w600)),
          ),
        ),
        if (live.isNotEmpty) DealGrid(live),
        if (gone.isNotEmpty) ...[
          const SliverToBoxAdapter(child: SectionTitle('Ended')),
          SliverList.builder(
            itemCount: gone.length,
            itemBuilder: (_, i) {
              final d = catalog.byAsin(gone[i]);
              return ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                leading: SizedBox(width: 52, height: 52, child: ProductImage(d?.imageUrl ?? '', padding: 4)),
                title: Text(d?.shortTitle ?? 'Deal no longer listed', maxLines: 2, overflow: TextOverflow.ellipsis),
                subtitle: const Text('Deal ended'),
                onTap: d == null ? null : () => DealPage.open(context, d),
                trailing: IconButton(
                  tooltip: 'Remove',
                  icon: const Icon(Icons.close),
                  onPressed: () => ref.read(savedProvider.notifier).remove(gone[i]),
                ),
              );
            },
          ),
        ],
        const SliverToBoxAdapter(child: Disclosure()),
      ],
    );
  }
}
