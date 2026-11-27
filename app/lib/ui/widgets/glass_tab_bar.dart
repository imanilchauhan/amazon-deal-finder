import 'package:flutter/material.dart';

import '../glass.dart';
import '../theme.dart';

class GlassTab {
  const GlassTab({required this.icon, required this.selectedIcon, required this.label, this.badge = 0});
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final int badge;
}

/// A floating frosted capsule with the app's tabs; the selected tab sits on a coral pill.
class GlassTabBar extends StatelessWidget {
  const GlassTabBar({super.key, required this.tabs, required this.index, required this.onSelected});
  final List<GlassTab> tabs;
  final int index;
  final ValueChanged<int> onSelected;

  static const height = 66.0;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18),
        child: Glass(
          radius: 999,
          sigma: 26,
          strength: 1.1,
          child: SizedBox(
            height: height,
            child: LayoutBuilder(builder: (context, box) {
              final w = box.maxWidth / tabs.length;
              return Stack(children: [
                AnimatedPositioned(
                  duration: const Duration(milliseconds: 320),
                  curve: Curves.easeOutBack,
                  left: w * index + 6,
                  top: 6,
                  width: w - 12,
                  height: height - 12,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(999),
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Brand.coral.withValues(alpha: 0.22), Brand.coral.withValues(alpha: 0.12)],
                      ),
                      border: Border.all(color: Brand.coral.withValues(alpha: 0.25)),
                    ),
                  ),
                ),
                Row(children: [
                  for (var i = 0; i < tabs.length; i++)
                    Expanded(
                      child: Semantics(
                        selected: i == index,
                        button: true,
                        label: tabs[i].label,
                        child: InkResponse(
                          onTap: () => onSelected(i),
                          radius: 36,
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Badge(
                                isLabelVisible: tabs[i].badge > 0,
                                label: Text('${tabs[i].badge}'),
                                backgroundColor: Brand.coral,
                                child: Icon(i == index ? tabs[i].selectedIcon : tabs[i].icon,
                                    color: i == index ? Brand.deep : onSurface.withValues(alpha: 0.72), size: 24),
                              ),
                              const SizedBox(height: 3),
                              ExcludeSemantics(
                                child: Text(
                                  tabs[i].label,
                                  style: TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: i == index ? FontWeight.w800 : FontWeight.w600,
                                    color: i == index ? Brand.deep : onSurface.withValues(alpha: 0.72),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ]),
              ]);
            }),
          ),
        ),
      ),
    );
  }
}
