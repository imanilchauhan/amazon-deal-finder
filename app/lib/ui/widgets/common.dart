import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/config.dart';
import '../../logic/format.dart';
import '../glass.dart';
import '../theme.dart';

/// A product photo on white, never cropped (Amazon photos are on white backgrounds).
class ProductImage extends StatelessWidget {
  const ProductImage(this.url, {super.key, this.radius = 14, this.padding = 10});
  final String url;
  final double radius;
  final double padding;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: ColoredBox(
        color: Colors.white,
        child: Padding(
          padding: EdgeInsets.all(padding),
          child: url.isEmpty
              ? const _NoImage()
              : CachedNetworkImage(
                  imageUrl: url,
                  fit: BoxFit.contain,
                  fadeInDuration: const Duration(milliseconds: 150),
                  placeholder: (_, __) => const SizedBox.expand(),
                  errorWidget: (_, __, ___) => const _NoImage(),
                ),
        ),
      ),
    );
  }
}

class _NoImage extends StatelessWidget {
  const _NoImage();
  @override
  Widget build(BuildContext context) =>
      const Center(child: Icon(Icons.image_not_supported_outlined, color: Color(0xFFB8BCC6)));
}

/// "−62%" badge.
class DiscountBadge extends StatelessWidget {
  const DiscountBadge(this.pct, {super.key, this.big = false});
  final int pct;
  final bool big;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: big ? 12 : 8, vertical: big ? 6 : 4),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFFF6B6F), Brand.coral]),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.55)),
        boxShadow: [BoxShadow(color: Brand.coral.withValues(alpha: 0.30), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      child: Text('−$pct%',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: big ? 16 : 12)),
    );
  }
}

/// Price, struck MRP and saving (or the reason a price can't be shown).
class PriceLine extends StatelessWidget {
  const PriceLine({super.key, required this.price, required this.mrp, required this.currency,
      this.fresh = true, this.big = false});
  final double price;
  final double mrp;
  final String currency;
  final bool fresh;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    if (!fresh) {
      return Text('Check today\'s price on Amazon',
          style: t.bodyMedium?.copyWith(color: context.tones.muted, fontWeight: FontWeight.w600));
    }
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.end,
      spacing: 8,
      children: [
        Text(money(price, currency),
            style: (big ? t.headlineMedium : t.titleMedium)?.copyWith(fontWeight: FontWeight.w800)),
        if (mrp > price)
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Text(money(mrp, currency),
                style: t.bodySmall?.copyWith(
                    color: context.tones.muted, decoration: TextDecoration.lineThrough, fontSize: big ? 15 : 12)),
          ),
      ],
    );
  }
}

/// The disclosure Amazon requires wherever we show deals.
class Disclosure extends StatelessWidget {
  const Disclosure({super.key, this.withPriceNote = false});
  final bool withPriceNote;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).textTheme.bodySmall?.copyWith(color: context.tones.muted, height: 1.4);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(AppConfig.amazonDisclosure, style: s),
          if (withPriceNote) ...[const SizedBox(height: 6), Text(AppConfig.priceDisclaimer, style: s)],
        ],
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 12, 10),
      child: Row(
        children: [
          Expanded(
            child: Text(title,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3)),
          ),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
        ],
      ),
    );
  }
}

/// Loading / error / empty states.
class StateMessage extends StatelessWidget {
  const StateMessage({super.key, required this.icon, required this.title, this.body, this.action, this.onAction});
  final IconData icon;
  final String title;
  final String? body;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 44, color: context.tones.muted),
            const SizedBox(height: 12),
            Text(title, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
            if (body != null) ...[
              const SizedBox(height: 6),
              Text(body!, textAlign: TextAlign.center, style: TextStyle(color: context.tones.muted)),
            ],
            if (action != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onAction, child: Text(action!)),
            ],
          ],
        ),
      ),
    );
  }
}

/// "Prices checked 12 min ago" pill.
class Freshness extends StatelessWidget {
  const Freshness({super.key, required this.checked, required this.now, this.offline = false});
  final DateTime? checked;
  final DateTime now;
  final bool offline;

  @override
  Widget build(BuildContext context) {
    final label = offline
        ? 'Offline · showing saved copy'
        : checked == null
            ? 'Prices checked recently'
            : 'Prices checked ${ago(checked!, now)}';
    return Glass(
      radius: 999,
      blur: false,
      shadow: false,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(shape: BoxShape.circle, color: offline ? Colors.orange : context.tones.good),
        ),
        const SizedBox(width: 6),
        Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelMedium)),
      ]),
    );
  }
}
