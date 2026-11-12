import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/deal_repository.dart';
import '../models/deal.dart';
import '../services/link_launcher.dart';

final firestoreProvider = Provider<FirebaseFirestore>((ref) => FirebaseFirestore.instance);

final dealRepositoryProvider = Provider<DealRepository>(
  (ref) => DealRepository(ref.watch(firestoreProvider)),
);

final dealsStreamProvider = StreamProvider<List<Deal>>(
  (ref) => ref.watch(dealRepositoryProvider).watchDeals(),
);

final linkLauncherProvider = Provider<LinkLauncher>((ref) => const UrlLauncherLinkLauncher());
