import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../models/deal.dart';
import '../providers/deal_providers.dart';

String formatMoney(double amount, String currency) {
  final whole = amount == amount.roundToDouble();
  final locale = currency == 'INR' ? 'en_IN' : 'en_US';
  return NumberFormat.simpleCurrency(locale: locale, name: currency, decimalDigits: whole ? 0 : 2)
      .format(amount);
}

class DealCard extends ConsumerWidget {
  const DealCard({super.key, required this.deal});

  final Deal deal;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Card(
      key: ValueKey('deal-${deal.asin}'),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Stack(
            children: [
              Container(
                height: 170,
                color: Colors.white,
                padding: const EdgeInsets.all(12),
                child: Image.network(
                  deal.imageUrl,
                  key: ValueKey('deal-image-${deal.asin}'),
                  fit: BoxFit.contain,
                  semanticLabel: deal.title,
                  errorBuilder: (_, __, ___) =>
                      const Center(child: Icon(Icons.image_not_supported_outlined, size: 48)),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.red.shade600, borderRadius: BorderRadius.circular(8)),
                  child: Text('-${deal.discountPct}%',
                      key: ValueKey('deal-discount-${deal.asin}'),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: Text(deal.title,
                maxLines: 2, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.end,
              spacing: 8,
              children: [
                Text(formatMoney(deal.price, deal.currency),
                    key: ValueKey('deal-price-${deal.asin}'),
                    style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                Text(formatMoney(deal.originalPrice, deal.currency),
                    key: ValueKey('deal-mrp-${deal.asin}'),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      decoration: TextDecoration.lineThrough,
                      color: theme.colorScheme.onSurfaceVariant,
                    )),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 2, 12, 0),
            child: Text('You save ${formatMoney(deal.savings, deal.currency)}',
                style: TextStyle(color: Colors.green.shade700)),
          ),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.all(12),
            child: FilledButton.icon(
              key: ValueKey('deal-buy-${deal.asin}'),
              icon: const Icon(Icons.shopping_cart_outlined),
              label: const Text('Buy on Amazon'),
              onPressed: () async {
                final ok = await ref.read(linkLauncherProvider).open(deal.url);
                if (!ok && context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(const SnackBar(content: Text('Could not open the link')));
                }
              },
            ),
          ),
        ],
      ),
    );
  }
}
