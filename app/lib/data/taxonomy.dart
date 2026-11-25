import 'dart:convert';

import 'package:flutter/services.dart';

class Department {
  const Department(this.slug, this.name, this.icon, this.categories);
  final String slug;
  final String name;
  final String icon;
  final Map<String, String> categories; // slug -> name
}

/// Departments and categories (assets/taxonomy.json, the same file the website and scraper use).
class Taxonomy {
  const Taxonomy(this.departments);
  final List<Department> departments;

  Department? department(String slug) {
    for (final d in departments) {
      if (d.slug == slug) return d;
    }
    return null;
  }

  String departmentName(String slug) => department(slug)?.name ?? 'Other';

  String categoryName(String dep, String cat) =>
      department(dep)?.categories[cat] ?? cat.replaceAll('-', ' ');

  static Taxonomy parse(String body) {
    final j = jsonDecode(body) as Map<String, dynamic>;
    return Taxonomy([
      for (final d in (j['departments'] as List))
        Department(
          d['slug'] as String,
          d['name'] as String,
          d['icon'] as String? ?? '',
          {for (final c in (d['categories'] as List)) c['slug'] as String: c['name'] as String},
        ),
    ]);
  }

  static Future<Taxonomy> load([AssetBundle? bundle]) async =>
      parse(await (bundle ?? rootBundle).loadString('assets/taxonomy.json'));
}
