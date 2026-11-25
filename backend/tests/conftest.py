"""Shared fixtures + an in-memory Firestore fake (just the surface DealStore uses)."""
from __future__ import annotations

import copy
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from deal_finder.models import Deal, affiliate_url  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)


def make_deal(asin="B0TESTASIN", price=1299.0, original=2399.0, title="Boat Rockerz 450 Wireless Headphones", **kw) -> Deal:
    from deal_finder.models import compute_discount_pct

    return Deal(
        asin=asin,
        title=title,
        price=price,
        original_price=original,
        discount_pct=kw.pop("discount_pct", compute_discount_pct(price, original)),
        currency=kw.pop("currency", "INR"),
        image_url=kw.pop("image_url", "https://m.media-amazon.com/images/I/61abc.jpg"),
        url=kw.pop("url", affiliate_url(asin, "mytag-21", "www.amazon.in")),
        marketplace=kw.pop("marketplace", "in"),
        scraped_at=kw.pop("scraped_at", "2026-11-05T12:00:00+00:00"),
    )


@pytest.fixture
def deal() -> Deal:
    return make_deal()


# ---------------- Firestore fake ----------------
def _deep_merge(dst: dict, src: dict) -> dict:
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            _deep_merge(dst[k], v)
        else:
            dst[k] = copy.deepcopy(v)
    return dst


class FakeSnap:
    def __init__(self, db, coll, doc_id):
        self.id = doc_id
        self._data = copy.deepcopy(db.data.get(coll, {}).get(doc_id))
        self.reference = FakeDocRef(db, coll, doc_id)

    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        return copy.deepcopy(self._data)


class FakeDocRef:
    def __init__(self, db, coll, doc_id):
        self.db, self.coll, self.id = db, coll, doc_id

    def get(self):
        return FakeSnap(self.db, self.coll, self.id)

    def set(self, data, merge=False):
        self.db.writes += 1
        if self.db.fail_writes:
            raise RuntimeError("quota exceeded")
        store = self.db.data.setdefault(self.coll, {})
        if merge and self.id in store:
            _deep_merge(store[self.id], data)
        else:
            store[self.id] = copy.deepcopy(data)

    def update(self, data):
        self.db.writes += 1
        self.db.data[self.coll][self.id].update(copy.deepcopy(data))


class FakeQuery:
    def __init__(self, db, coll, filters, order=None, cap=None):
        self.db, self.coll, self.filters, self.order, self.cap = db, coll, filters, order, cap

    def where(self, filter=None):  # noqa: A002
        return FakeQuery(self.db, self.coll, self.filters + [filter], self.order, self.cap)

    def order_by(self, field, direction="ASCENDING"):
        return FakeQuery(self.db, self.coll, self.filters, (field, str(direction).upper().startswith("DESC")), self.cap)

    def limit(self, n):
        return FakeQuery(self.db, self.coll, self.filters, self.order, n)

    def stream(self):
        rows = []
        for doc_id, data in list(self.db.data.get(self.coll, {}).items()):
            ok = True
            for f in self.filters:
                field, op, value = f if isinstance(f, tuple) else (f.field_path, f.op_string, f.value)
                have = data.get(field)
                if op == "==":
                    ok &= have == value
                elif op == "<":
                    ok &= have is not None and have < value
                else:
                    raise AssertionError(f"unsupported op {op}")
            if ok:
                rows.append((doc_id, data))
        if self.order:
            field, desc = self.order
            rows.sort(key=lambda r: r[1].get(field), reverse=desc)
        if self.cap is not None:
            rows = rows[: self.cap]
        for doc_id, _ in rows:
            self.db.reads = getattr(self.db, "reads", 0) + 1
            yield FakeSnap(self.db, self.coll, doc_id)


class FakeCollection(FakeQuery):
    def __init__(self, db, name):
        super().__init__(db, name, [])

    def document(self, doc_id):
        return FakeDocRef(self.db, self.coll, doc_id)


class FakeBatch:
    def __init__(self, db):
        self.db, self.ops = db, []

    def set(self, ref, data, merge=False):
        self.ops.append(("set", ref, data, merge))

    def update(self, ref, data):
        self.ops.append(("update", ref, data))

    def commit(self):
        for op in self.ops:
            if op[0] == "set":
                op[1].set(op[2], merge=op[3])
            else:
                op[1].update(op[2])


class FakeFirestore:
    def __init__(self):
        self.data: dict[str, dict] = {}
        self.writes = 0
        self.fail_writes = False
        self.fail_reads = False

    def collection(self, name):
        return FakeCollection(self, name)

    def get_all(self, refs):
        if self.fail_reads:
            raise RuntimeError("deadline exceeded")
        return [r.get() for r in refs]

    def batch(self):
        return FakeBatch(self)


@pytest.fixture
def fake_db():
    return FakeFirestore()
