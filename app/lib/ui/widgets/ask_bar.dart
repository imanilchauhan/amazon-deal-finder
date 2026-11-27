import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../glass.dart';
import '../theme.dart';

/// "Ask: gift for mom under ₹500" — sends the sentence to the Deals tab, which turns it into
/// filters (keywords, price, who it's for). Runs on the phone, no AI service.
class AskBar extends ConsumerStatefulWidget {
  const AskBar({super.key, this.initial = '', this.onSubmitted});
  final String initial;
  final ValueChanged<String>? onSubmitted;

  @override
  ConsumerState<AskBar> createState() => _AskBarState();
}

class _AskBarState extends ConsumerState<AskBar> {
  late final _c = TextEditingController(text: widget.initial);

  @override
  void didUpdateWidget(AskBar old) {
    super.didUpdateWidget(old);
    if (widget.initial != old.initial && widget.initial != _c.text) _c.text = widget.initial;
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _submit(String text) {
    if (widget.onSubmitted != null) {
      widget.onSubmitted!(text.trim());
      return;
    }
    ref.read(dealsQueryProvider.notifier).state = text.trim();
    ref.read(dealsDepartmentProvider.notifier).state = null;
    ref.read(tabProvider.notifier).state = 1;
    FocusScope.of(context).unfocus();
  }

  @override
  Widget build(BuildContext context) {
    // A frosted field: blurs whatever scrolls behind it.
    return Glass(
      radius: 999,
      sigma: 18,
      strength: 1.1,
      child: TextField(
        controller: _c,
        textInputAction: TextInputAction.search,
        onSubmitted: _submit,
        decoration: InputDecoration(
          filled: false,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(999), borderSide: const BorderSide(color: Brand.coral, width: 1.5)),
          hintText: 'Ask: gift for mom under ₹500',
          prefixIcon: const Icon(Icons.auto_awesome, color: Brand.coral),
          suffixIcon: Padding(
            padding: const EdgeInsets.all(5),
            child: Material(
              color: Brand.coral,
              shape: const CircleBorder(),
              child: IconButton(
                tooltip: 'Find deals',
                icon: const Icon(Icons.arrow_forward, color: Colors.white, size: 20),
                onPressed: () => _submit(_c.text),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
