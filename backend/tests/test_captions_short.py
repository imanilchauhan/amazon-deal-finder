from deal_finder.captions import is_near_duplicate, short_title


def test_short_title_drops_keyword_stuffing():
    t = ("Amazon Brand - Symbol Men's Cotton Rich Solid Polo Tshirt | Collar Tshirts | Half Sleeves "
         "| Plain-Regular Fit (Available in Plus Sizes and Combo Pack of 2)")
    assert short_title(t) == "Amazon Brand Symbol Men's Cotton Rich Solid Polo Tshirt"


def test_short_title_cuts_long_first_segment_at_word_boundary():
    t = "Umadiya Big Size Rolls-Royce Cullinan Model Car Exclusive Alloy Metal Car Pull Back Die-cast Car Toy car with Openable Doors"
    out = short_title(t)
    assert len(out) <= 70 and not out.endswith("…") and t.startswith(out)


def test_short_title_drops_dangling_words():
    assert short_title("Misamo 2-in-1 Oil Dispenser & Sprayer for Kitchen, 500ml") == "Misamo 2-in-1 Oil Dispenser & Sprayer for Kitchen"
    assert not short_title("Some Very Long Product Name That Ends With for the kids and more words beyond limit", max_chars=50).endswith(("for", "the"))


def test_short_title_keeps_short_titles():
    assert short_title("Kindle Paperwhite") == "Kindle Paperwhite"


def test_near_duplicate_colour_variants():
    a = "EooCoo Clear Case for Apple MacBook Neo Cover 13 inch 2026 Blush A3404"
    b = "EooCoo Clear Case for Apple MacBook Neo Cover 13 inch 2026 Indigo A3404"
    assert is_near_duplicate(a, b)
    assert not is_near_duplicate("Cable World RC Drift Car for Kids", "Umadiya Rolls-Royce Cullinan Model Car")
