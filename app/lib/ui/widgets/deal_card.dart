import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../logic/rules.dart';
import '../../models/deal.dart';
import '../deal_page.dart';
import '../glass.dart';
import '../theme.dart';
import 'common.dart';

/// Product card: photo, discount, tag, title, price and a save heart. Taps open the deal page
/// (inside the app); Amazon is only opened from there, by the user.
class DealCard extends ConsumerWidget {
  const DealCard(this.deal, {super.key, this.width});
  final Deal deal;
  final double? width;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = ref.watch(nowProvider)();
    final saved = ref.watch(savedProvider).contains(deal.asin);
    final fresh = deal.priceFresh(now);
    final tag = dealTag(deal, now);
    final t = Theme.of(context).textTheme;

    final card = Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => DealPage.open(context, deal),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 6, 6, 0),
              child: AspectRatio(
                aspectRatio: 1,
                child: Stack(
                  children: [
                    Positioned.fill(child: ProductImage(deal.imageUrl, radius: 17)),
                    if (fresh && deal.discountPct > 0)
                      Positioned(left: 8, top: 8, child: DiscountBadge(deal.discountPct)),
                    Positioned(
                      right: 6,
                      top: 6,
                      child: GlassIconButton(
                        size: 36,
                        tooltip: saved ? 'Remove from saved' : 'Save deal',
                        onPressed: () => ref.read(savedProvider.notifier).toggle(deal.asin),
                        icon: saved ? Icons.favorite : Icons.favorite_border,
                        color: saved ? Brand.coral : const Color(0xFF6B707B),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (tag.isNotEmpty) ...[
                    Text(tag.toUpperCase(),
                        style: t.labelSmall?.copyWith(
                            color: context.tones.muted, fontWeight: FontWeight.w700, letterSpacing: 0.6)),
                    const SizedBox(height: 4),
                  ],
                  Text(deal.shortTitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w600, height: 1.25)),
                  const SizedBox(height: 8),
                  PriceLine(price: deal.price, mrp: deal.originalPrice, currency: deal.currency, fresh: fresh),
                ],
              ),
            ),
          ],
        ),
      ),
    );
    return width == null ? card : SizedBox(width: width, child: card);
  }
}

/// Responsive grid of deal cards (2 columns on phones, more on tablets).
class DealGrid extends StatelessWidget {
  const DealGrid(this.deals, {super.key});
  final List<Deal> deals;

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      sliver: SliverGrid(
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 230,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.56,
        ),
        delegate: SliverChildBuilderDelegate((_, i) => DealCard(deals[i]), childCount: deals.length),
      ),
    );
  }
}

/// A horizontal row of cards.
class DealRow extends StatelessWidget {
  const DealRow(this.deals, {super.key});
  final List<Deal> deals;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 310,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: deals.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => DealCard(deals[i], width: 170),
      ),
    );
  }
}
