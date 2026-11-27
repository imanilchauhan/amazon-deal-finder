import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'theme.dart';

/// Glassmorphism kit: a soft colour field behind every screen, and frosted panels on top of it.
///
/// Real blur ([Glass] with `blur: true`) is only used for the few layers that float over
/// scrolling content (bars, the ask field, buttons on photos, sheets). Cards and chips in long
/// lists use the same look without blur ([Glass] with `blur: false`), which keeps scrolling smooth.
/// With "Reduce transparency" / high contrast on, every surface turns opaque.

bool _plain(BuildContext context) => MediaQuery.highContrastOf(context);

/// The colour field: brand coral, peach and lilac washes on the page colour.
class GlassBackdrop extends StatelessWidget {
  const GlassBackdrop({super.key, this.child});
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final a = dark ? 0.55 : 1.0; // washes are quieter in dark mode
    Widget blob(Alignment at, Color c, double opacity, double radius) => Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: at,
                radius: radius,
                colors: [c.withValues(alpha: opacity * a), c.withValues(alpha: 0)],
              ),
            ),
          ),
        );
    return Stack(
      children: [
        Positioned.fill(child: ColoredBox(color: context.tones.bg)),
        if (!_plain(context)) ...[
          blob(const Alignment(-1.1, -0.95), Brand.coral, dark ? 0.32 : 0.30, 1.05),
          blob(const Alignment(1.15, -0.25), const Color(0xFFFFA45C), dark ? 0.20 : 0.28, 0.95),
          blob(const Alignment(-0.9, 0.75), const Color(0xFF8B7CF6), dark ? 0.24 : 0.20, 1.0),
          blob(const Alignment(1.0, 1.1), const Color(0xFF2DD4BF), dark ? 0.14 : 0.14, 0.9),
        ],
        if (child != null) Positioned.fill(child: child!),
      ],
    );
  }
}

/// Colours of a glass surface for the current mode.
class GlassTone {
  const GlassTone._(this.top, this.bottom, this.edge, this.shadow);
  final Color top;
  final Color bottom;
  final Color edge;
  final Color shadow;

  static GlassTone of(BuildContext context, {double strength = 1}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    if (_plain(context)) {
      final s = context.tones.surface;
      return GlassTone._(s, s, context.tones.line, Colors.transparent);
    }
    return dark
        ? GlassTone._(
            Colors.white.withValues(alpha: 0.12 * strength),
            Colors.white.withValues(alpha: 0.05 * strength),
            Colors.white.withValues(alpha: 0.16),
            Colors.black.withValues(alpha: 0.30),
          )
        : GlassTone._(
            Colors.white.withValues(alpha: (0.70 * strength).clamp(0, 1)),
            Colors.white.withValues(alpha: (0.42 * strength).clamp(0, 1)),
            Colors.white.withValues(alpha: 0.75),
            const Color(0xFF5B3A3A).withValues(alpha: 0.10),
          );
  }
}

/// A frosted glass panel.
class Glass extends StatelessWidget {
  const Glass({
    super.key,
    required this.child,
    this.radius = 22,
    this.blur = true,
    this.sigma = 22,
    this.strength = 1,
    this.padding,
    this.shadow = true,
    this.border = true,
  });

  final Widget child;
  final double radius;
  final bool blur;
  final double sigma;
  final double strength;
  final EdgeInsetsGeometry? padding;
  final bool shadow;
  final bool border;

  @override
  Widget build(BuildContext context) {
    final tone = GlassTone.of(context, strength: strength);
    final shape = BorderRadius.circular(radius);
    Widget panel = DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: shape,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [tone.top, tone.bottom],
        ),
        border: border ? Border.all(color: tone.edge, width: 1) : null,
      ),
      child: padding == null ? child : Padding(padding: padding!, child: child),
    );
    if (blur && !_plain(context)) {
      panel = BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
        child: panel,
      );
    }
    panel = ClipRRect(borderRadius: shape, child: panel);
    if (!shadow) return panel;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: shape,
        boxShadow: [BoxShadow(color: tone.shadow, blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: panel,
    );
  }
}

/// A round glass button, for icons over photos and in bars.
class GlassIconButton extends StatelessWidget {
  const GlassIconButton({super.key, required this.icon, required this.onPressed, this.tooltip, this.color,
      this.size = 44});
  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final button = Glass(
      radius: size / 2,
      sigma: 16,
      shadow: false,
      child: SizedBox.square(
        dimension: size,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: Icon(icon, size: size * 0.48, color: color ?? Theme.of(context).colorScheme.onSurface),
          ),
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

/// A glass pill chip; `selected` fills it with ink (or white in dark mode).
class GlassChip extends StatelessWidget {
  const GlassChip({super.key, required this.label, this.selected = false, this.onTap, this.icon});
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = selected ? (dark ? Brand.ink : Colors.white) : Theme.of(context).colorScheme.onSurface;
    final content = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 16, color: fg), const SizedBox(width: 6)],
        Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: fg)),
      ]),
    );
    final tap = Material(
      type: MaterialType.transparency,
      child: InkWell(customBorder: const StadiumBorder(), onTap: onTap, child: content),
    );
    if (selected) {
      return Semantics(
        selected: true,
        button: true,
        child: DecoratedBox(
          decoration: ShapeDecoration(
            shape: const StadiumBorder(),
            color: dark ? Colors.white : Brand.ink,
          ),
          child: tap,
        ),
      );
    }
    return Semantics(button: true, child: Glass(radius: 999, blur: false, shadow: false, child: tap));
  }
}

/// A glass top bar: transparent app bar over a frosted strip, so content blurs as it scrolls under.
class GlassAppBar extends StatelessWidget implements PreferredSizeWidget {
  const GlassAppBar({super.key, required this.title, this.actions, this.leading, this.titleSpacing});
  final Widget title;
  final List<Widget>? actions;
  final Widget? leading;
  final double? titleSpacing;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final tone = GlassTone.of(context, strength: 0.85);
    return AppBar(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      scrolledUnderElevation: 0,
      elevation: 0,
      leading: leading,
      titleSpacing: titleSpacing,
      title: title,
      actions: actions,
      flexibleSpace: ClipRect(
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: _plain(context) ? 0 : 24, sigmaY: _plain(context) ? 0 : 24),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [tone.top, tone.bottom],
              ),
              border: Border(bottom: BorderSide(color: tone.edge)),
            ),
          ),
        ),
      ),
    );
  }
}

/// Space for the glass top bar / floating tab bar at the start / end of a scroll view
/// (the bars float over the content, so scroll views start below them).
class GlassTopGap extends StatelessWidget {
  const GlassTopGap({super.key, this.extra = 0});
  final double extra;
  @override
  Widget build(BuildContext context) =>
      SliverToBoxAdapter(child: SizedBox(height: MediaQuery.paddingOf(context).top + extra));
}

class GlassBottomGap extends StatelessWidget {
  const GlassBottomGap({super.key, this.extra = 16});
  final double extra;
  @override
  Widget build(BuildContext context) =>
      SliverToBoxAdapter(child: SizedBox(height: MediaQuery.paddingOf(context).bottom + extra));
}

/// A bottom sheet on glass.
Future<T?> showGlassSheet<T>(BuildContext context, {required WidgetBuilder builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.25),
    builder: (ctx) => Padding(
      padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
      child: SafeArea(
        top: false,
        child: Glass(
          radius: 28,
          sigma: 30,
          strength: 1.15,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 38,
                height: 5,
                decoration: BoxDecoration(
                  color: Theme.of(ctx).colorScheme.onSurface.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              Flexible(child: builder(ctx)),
            ],
          ),
        ),
      ),
    ),
  );
}
