import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/catalog.dart';
import '../data/collections.dart';
import '../data/saved.dart';
import '../data/taxonomy.dart';
import '../logic/rules.dart';
import '../services/links.dart';

/// The clock, overridable in tests.
final nowProvider = Provider<DateTime Function()>((ref) => () => DateTime.now().toUtc());

Future<Directory> _cacheDir() => getApplicationSupportDirectory();

final catalogRepositoryProvider = Provider<CatalogRepository>((ref) => CatalogRepository(dir: _cacheDir));
final collectionsRepositoryProvider =
    Provider<CollectionsRepository>((ref) => CollectionsRepository(dir: _cacheDir));

/// Saved copy first (instant open, works offline), then the fresh download replaces it.
final catalogProvider = StreamProvider<Catalog>((ref) => ref.watch(catalogRepositoryProvider).watch());
final collectionsProvider =
    StreamProvider<Collections>((ref) => ref.watch(collectionsRepositoryProvider).watch());
final taxonomyProvider = FutureProvider<Taxonomy>((ref) => Taxonomy.load());

/// Set in main() once SharedPreferences is ready (null in tests = in-memory only).
final prefsProvider = Provider<SharedPreferences?>((ref) => null);
final savedProvider =
    StateNotifierProvider<SavedNotifier, List<String>>((ref) => SavedNotifier(ref.watch(prefsProvider)));

final linksProvider = Provider<Links>((ref) => const Links());

/// Bottom navigation tab, and the query the Deals tab should show (set from the home Ask bar).
final tabProvider = StateProvider<int>((ref) => 0);
final dealsQueryProvider = StateProvider<String>((ref) => '');
final dealsDepartmentProvider = StateProvider<String?>((ref) => null);
final homeMoodProvider = StateProvider<Mood>((ref) => Mood.all);
