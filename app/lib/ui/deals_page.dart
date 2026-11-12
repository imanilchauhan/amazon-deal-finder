import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/deal_providers.dart';
import 'deal_card.dart';

const amazonDisclosure = 'As an Amazon Associate we earn from qualifying purchases.';

class DealsPage extends ConsumerWidget {
  const DealsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final deals = ref.watch(dealsStreamProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Today\'s Deals')),
      body: deals.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Couldn\'t load deals.'),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () => ref.invalidate(dealsStreamProvider),
              child: const Text('Retry'),
            ),
          ]),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const Center(child: Text('No live deals right now. Check back soon!'));
          }
          return GridView.builder(
            key: const ValueKey('deals-grid'),
            padding: const EdgeInsets.all(12),
            // 1 column on phones, 2-5 on tablets / desktop web.
            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
              maxCrossAxisExtent: 340,
              mainAxisExtent: 400,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: items.length,
            itemBuilder: (_, i) => DealCard(deal: items[i]),
          );
        },
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Text(amazonDisclosure,
              textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
        ),
      ),
    );
  }
}
