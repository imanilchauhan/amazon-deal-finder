import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/deal.dart';

class DealRepository {
  DealRepository(this._db);

  final FirebaseFirestore _db;

  /// Real-time feed of active deals, best discount first.
  /// Needs the composite index in firebase/firestore.indexes.json (active ASC, discount_pct DESC).
  Stream<List<Deal>> watchDeals({int limit = 100}) {
    return _db
        .collection('deals')
        .where('active', isEqualTo: true)
        .orderBy('discount_pct', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) => snap.docs
            .map((d) => Deal.tryFromMap(d.id, d.data()))
            .whereType<Deal>()
            .toList());
  }
}
