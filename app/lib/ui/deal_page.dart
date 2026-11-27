import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../core/providers.dart';
import '../logic/format.dart';
import '../logic/rules.dart';
import '../models/deal.dart';
import 'glass.dart';
import 'theme.dart';
import 'widgets/common.dart';
import 'widgets/deal_card.dart';

class DealPage extends ConsumerStatefulWidget {
  const DealPage(this.deal, {super.key});
  final Deal deal;

  static Future<void> open(BuildContext context, Deal d) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => DealPage(d)));

  @override
  ConsumerState<DealPage> createState() => _DealPageState();
}

class _DealPageState extends ConsumerState<DealPage> {
  int _photo = 0;

  @override
  Widget build(BuildContext context) {
    final d = widget.deal;
    final now = ref.watch(nowProvider)();
    final fresh = d.priceFresh(now);
    final saved = ref.watch(savedProvider).contains(d.asin);
    final links = ref.read(linksProvider);
    final tax = ref.watch(taxonomyProvider).valueOrNull;
    final catalog = ref.watch(catalogProvider).valueOrNull;
    final similar = catalog == null
        ? <Deal>[]
        : withoutVariants(catalog.live.where((x) =>
                x.asin != d.asin && x.department == d.department && (d.category == 'uncategorised' || x.category == d.category)))
            .where((x) => familyKey(x) != familyKey(d))
            .take(10)
            .toList();
    final t = Theme.of(context).textTheme;
    final photos = d.gallery;

    Future<void> openAmazon() async {
      final ok = await links.openExternal(d.url);
      if (!ok && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Couldn\'t open Amazon. Try again.')));
      }
    }

    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      extendBody: true,
      body: GlassBackdrop(
        child: Stack(children: [
          CustomScrollView(
        slivers: [
          SliverToBoxAdapter(child: SizedBox(height: top + 64)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              child: Glass(
                radius: 30,
                blur: false,
                padding: const EdgeInsets.all(8),
                child: AspectRatio(
                aspectRatio: 1,
                child: Stack(
                  children: [
                    PageView.builder(
                      itemCount: photos.length,
                      onPageChanged: (i) => setState(() => _photo = i),
                      itemBuilder: (_, i) => ProductImage(photos[i], radius: 23, padding: 18),
                    ),
                    if (fresh && d.discountPct > 0)
                      Positioned(left: 12, top: 12, child: DiscountBadge(d.discountPct, big: true)),
                    if (photos.length > 1)
                      Positioned(
                        bottom: 12,
                        left: 0,
                        right: 0,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (var i = 0; i < photos.length; i++)
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                margin: const EdgeInsets.symmetric(horizontal: 3),
                                width: i == _photo ? 18 : 7,
                                height: 7,
                                decoration: BoxDecoration(
                                  color: i == _photo ? Brand.coral : const Color(0xFFD5D5D6),
                                  borderRadius: BorderRadius.circular(99),
                                ),
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (d.brand.isNotEmpty)
                    Text(d.brand, style: t.labelLarge?.copyWith(color: context.tones.muted)),
                  const SizedBox(height: 4),
                  Text(d.title,
                      style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700, height: 1.25),
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 14),
                  if (!d.active)
                    _Note(
                      icon: Icons.history,
                      text: 'This deal has ended. Prices change fast, so check Amazon for today\'s price.',
                    )
                  else ...[
                    PriceLine(price: d.price, mrp: d.originalPrice, currency: d.currency, fresh: fresh, big: true),
                    if (fresh && d.savings > 0) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                            color: context.tones.goodSoft, borderRadius: BorderRadius.circular(10)),
                        child: Text('You save ${money(d.savings, d.currency)} (${d.discountPct}% off)',
                            style: TextStyle(color: context.tones.good, fontWeight: FontWeight.w700)),
                      ),
                    ],
                    if (fresh && d.checkedAt != null) ...[
                      const SizedBox(height: 10),
                      Text('Price as of ${istDateTime(d.checkedAt!)}',
                          style: t.bodySmall?.copyWith(color: context.tones.muted)),
                    ],
                  ],
                  const SizedBox(height: 14),
                  Text('Opens Amazon. ${AppConfig.amazonDisclosure}',
                      style: t.bodySmall?.copyWith(color: context.tones.muted)),
                  if (tax != null) ...[
                    const SizedBox(height: 16),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      Chip(label: Text(tax.departmentName(d.department))),
                      if (d.category != 'uncategorised') Chip(label: Text(tax.categoryName(d.department, d.category))),
                    ]),
                  ],
                ],
              ),
            ),
          ),
          if (similar.isNotEmpty) ...[
            const SliverToBoxAdapter(child: SectionTitle('More deals like this')),
            SliverToBoxAdapter(child: DealRow(similar)),
          ],
          SliverToBoxAdapter(child: Disclosure(withPriceNote: d.active)),
          SliverToBoxAdapter(child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 96)),
        ],
          ),
          // Floating glass controls over the photo.
          Positioned(
            top: top + 8,
            left: 16,
            right: 16,
            child: Row(children: [
              GlassIconButton(
                tooltip: 'Back',
                icon: Icons.arrow_back_ios_new_rounded,
                onPressed: () => Navigator.of(context).maybePop(),
              ),
              const Spacer(),
              GlassIconButton(
                tooltip: saved ? 'Remove from saved' : 'Save deal',
                icon: saved ? Icons.favorite : Icons.favorite_border,
                color: saved ? Brand.coral : null,
                onPressed: () => ref.read(savedProvider.notifier).toggle(d.asin),
              ),
              const SizedBox(width: 10),
              GlassIconButton(
                tooltip: 'Share',
                icon: Icons.ios_share,
                onPressed: () => links.shareDeal(d, showPrice: fresh),
              ),
            ]),
          ),
        ]),
      ),
      // Floating glass action bar: price on the left, Amazon on the right.
      bottomNavigationBar: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Glass(
            radius: 26,
            sigma: 26,
            strength: 1.15,
            padding: const EdgeInsets.fromLTRB(16, 10, 10, 10),
            child: Row(children: [
              if (d.active && fresh)
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(money(d.price, d.currency), style: t.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                      if (d.discountPct > 0)
                        Text('${d.discountPct}% off', style: TextStyle(color: context.tones.good, fontWeight: FontWeight.w700)),
                    ],
                  ),
                )
              else
                const Spacer(),
              FilledButton.icon(
                onPressed: openAmazon,
                icon: const Icon(Icons.open_in_new, size: 18),
                label: Text(d.active ? 'Get this deal on Amazon' : 'See it on Amazon'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 52),
                  padding: const EdgeInsets.symmetric(horizontal: 18),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: context.tones.surface2, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(icon, color: context.tones.muted),
          const SizedBox(width: 10),
          Expanded(child: Text(text)),
        ]),
      );
}
