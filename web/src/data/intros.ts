/**
 * Short buying intros shown above the deal grid on department and category pages.
 * Keyed by department slug, or "department/category". Keep each to 120–200 words of
 * advice that stays true whatever deals happen to be live; never quote a specific price.
 */
export const INTROS: Record<string, string[]> = {
  // ---- departments -------------------------------------------------------
  fashion: [
    "Fashion has the deepest discounts on Amazon India, but the listed MRP on clothing is often set high, so a big percentage off is not always a big saving. Compare the deal price with what the same brand charges elsewhere, and check the size chart for each product rather than assuming your usual size, because fits vary a lot between Indian and international brands.",
    "Read the fabric line before you buy: cotton and linen suit Indian summers, while wool blends, fleece and padded jackets make sense from November to February. Easy returns matter more here than anywhere else on the site, so prefer listings that offer free returns or exchanges. The deals below are sorted by biggest discount and re-checked every few hours.",
  ],
  "home-kitchen": [
    "Home and kitchen deals cover everything from cookware and storage boxes to bedsheets, furniture and cleaning supplies. For cookware, check that a pan works on your stove (induction needs a magnetic base) and whether a non-stick coating is PFOA-free. For bedding, thread count matters less than the fabric itself: pure cotton breathes better than polyester blends.",
    "Furniture and large décor items are bulky, so look at the delivery and assembly details and the return policy before ordering. Smaller items such as containers, kitchen tools and cleaning supplies are good candidates for stocking up when a price drops, because you will use them anyway. Prices on this page are checked every few hours, and each deal shows the time it was last confirmed.",
  ],
  "beauty-personal-care": [
    "Beauty and personal care deals are worth it mostly on products you already use, because a new serum or shampoo at 50% off is no bargain if it does not suit your skin or hair. Check the ingredient list for anything you react to, and the expiry or manufacturing date mentioned on the listing or in recent reviews.",
    "Buy from listings sold or fulfilled by Amazon or the brand's own store where possible, since counterfeit cosmetics are a real problem with unknown sellers. Larger packs and combo sets often work out cheaper per ml or per gram, so compare the unit price rather than the pack price. Every deal below shows the regular price, today's price and when we last checked it.",
  ],
  "large-appliances": [
    "Large appliances are where a discount saves you the most money, and also where a wrong choice costs the most. Check the BEE star rating for running costs, the capacity for your household size, and what the warranty covers, especially the compressor or motor, which often has a longer warranty than the rest of the product.",
    "Installation is not always included: geysers, ACs and chimneys may need fittings or an installation visit that is charged separately, so read that part of the listing before comparing prices. Winter is the season for geysers, immersion rods and room heaters, while ACs and refrigerators usually see their best prices before summer and during big sale events. Deals below are re-checked every few hours.",
  ],
  "toys-games": [
    "Toy deals are easiest to judge when you start from the child, not the discount. Check the age range on the box, since small parts make many toys unsafe for children under three, and look for BIS certification on toys sold in India. For remote-control toys, check what batteries they need and whether a charger is included.",
    "Board games and learning toys hold their value well and make good gifts, so a price drop on a well-reviewed game is worth acting on. Outdoor toys such as cycles, scooters and play tents are bulky, so check the assembled size and weight limit. The deals below are sorted by biggest discount and updated through the day.",
  ],
  "mobiles-tablets": [
    "Phone and tablet prices on Amazon India move often, and the headline discount is not the whole story: bank card offers, exchange offers and coupons can change the final price a lot. Compare the deal price here with the price on the product page at checkout, and check which colour and storage variant the discount actually applies to.",
    "For phones, look at how many years of software updates the brand promises, not just the processor and camera. For accessories such as chargers and cables, buy from known brands and check the wattage your phone supports, because a fast charger only charges fast if both ends support it. Deals below show when each price was last checked.",
  ],
  baby: [
    "Baby products are bought again and again, so the best deals here are on things you already know your baby gets on with: the same diaper brand and size, the same wipes, the same lotion. Bulk packs usually bring the price per piece down, but babies move up a size quickly, so do not stock up too far ahead on diapers.",
    "For anything that touches food or skin, check the material (BPA-free plastic, food-grade silicone) and the expiry date. For gear such as strollers and car seats, check the weight and age limits and how easy it is to fold, and read recent reviews for long-term durability. Every deal below shows its regular price and today's price.",
  ],
  "home-improvement-garden": [
    "Home improvement deals cover power tools, hand tools, electrical items, bathroom fittings and gardening supplies. For electrical products such as extension boards, switches and LED bulbs, look for the ISI mark and check the rated load in watts against what you plan to plug in. For power tools, check whether the battery and charger are included or sold separately, because that often explains a low price.",
    "Bathroom fittings and taps vary a lot in quality, so check the material (brass and stainless steel last longer than plastic) and the warranty. For plants and gardening supplies, delivery can affect quality, so read recent reviews about how the product arrived. Deals below are re-checked every few hours.",
  ],
  "computers-accessories": [
    "Computer deals are worth comparing carefully, because a model name can hide several configurations. Check the processor generation, RAM, storage type (SSD rather than a hard disk) and whether the RAM can be upgraded later. For monitors, look at the panel type and refresh rate, and for keyboards and mice, whether they are wired, wireless or Bluetooth.",
    "Storage and networking items such as pen drives, SSDs and routers are easy savings when prices drop, but buy from well-known brands, since fake capacity drives are common with unknown sellers. Laptop bags and sleeves should match your laptop's screen size. The deals below are sorted by biggest discount and updated through the day.",
  ],
  electronics: [
    "Electronics deals cover headphones, speakers, smartwatches, cameras, TVs and gaming gear. For earbuds and headphones, check the battery life with and without noise cancellation, the codec support for your phone, and the warranty. For smartwatches, check which phones the watch works with and what is tracked on the watch versus only in the app.",
    "TVs are a big purchase, so compare the panel type, screen size for your room, the smart TV software and how many years of updates it gets. Installation and wall mounts may be extra. Prices on popular electronics change several times a day, so the time each deal was last checked is shown on its card.",
  ],
  "health-wellness": [
    "Health and wellness deals include supplements, health devices such as BP monitors and thermometers, and personal care appliances like trimmers and massagers. For devices, check that the product is clinically validated or certified, what the warranty covers, and whether it needs special batteries or strips that add to the running cost.",
    "For supplements, check the ingredients, the dose per serving and the expiry date, and buy from the brand's own store or Amazon-fulfilled listings, since fakes are common. A discount is never a reason to start a supplement; check with a doctor if you are unsure whether it suits you. Deals below show the regular price and when each price was checked.",
  ],
  "sports-fitness-outdoors": [
    "Sports and fitness deals are best when they match a habit you already have. For gym equipment such as dumbbells and resistance bands, check the weight range and material; for yoga mats, the thickness and grip. Larger equipment like treadmills and exercise cycles needs floor space, a power point and sometimes assembly, so check the dimensions and maximum user weight.",
    "For sports gear and cycles, sizing matters: check frame size for cycles and the size chart for shoes and clothing. Camping and outdoor gear is seasonal, so prices often drop outside travel seasons. The deals below are sorted by biggest discount and re-checked every few hours.",
  ],

  // ---- busiest categories ---------------------------------------------------
  "fashion/clothing": [
    "Clothing is where you will find the biggest percentage discounts on CartCrush, from kurta sets and sarees to jeans, T-shirts and winter wear. A large discount on clothing is common because the MRP is often set high, so judge a deal by the final price and the fabric, not the percentage alone.",
    "Always open the size chart for the exact product, since sizes are not consistent between brands, and measure a piece you already own if you are unsure. Check the fabric (cotton for daily wear, wool or fleece for winter) and the care instructions. Listings with free returns or exchanges are the safer choice for clothes. In the wedding season, ethnic wear sets and party wear sell out quickly, so a good price on your size is worth taking. Deals below are re-checked every few hours.",
  ],
  "home-kitchen/bedding-bath": [
    "Bedding and bath deals cover bedsheets, blankets, comforters, pillows, towels and bath mats. For bedsheets, fabric matters more than thread count: pure cotton is soft and breathable, while microfibre and polyester blends are cheaper, dry faster and wrinkle less. Check the sheet size against your mattress (single, double, queen or king) and whether pillow covers are included.",
    "For winter, compare blankets and comforters by weight and filling; heavier GSM numbers on towels and blankets usually mean thicker fabric. Read recent reviews for colour fading and shrinkage after the first wash. Bedding is a good thing to buy on a price drop because you will use it for years, and these deals are checked every few hours.",
  ],
  "home-kitchen/furniture": [
    "Furniture deals on Amazon India range from study tables and shoe racks to sofas, beds and office chairs. Before buying, measure the space and check the product's dimensions, including height, and the weight it can hold. Engineered wood is cheaper and lighter than solid wood but does not handle moisture as well.",
    "Most furniture arrives flat-packed, so check whether assembly is free, paid or do-it-yourself, and whether the seller offers a return if the piece arrives damaged. For office chairs, look for adjustable height and lumbar support and the warranty on the gas lift. Furniture is bulky to return, so read recent reviews with photos before ordering. Each deal below shows when its price was last checked.",
  ],
  "beauty-personal-care/skincare": [
    "Skincare deals are worth it on products that already suit your skin, and on the basics everyone uses: a gentle cleanser, a moisturiser and a broad-spectrum sunscreen. For active ingredients such as niacinamide, vitamin C, retinol or salicylic acid, check the concentration and start with one new product at a time.",
    "Buy from the brand's official store or listings fulfilled by Amazon, since fake skincare is common with unknown sellers, and check the manufacturing or expiry date in the listing or recent reviews. Larger sizes and combo packs often cost less per ml. If you have sensitive skin, patch-test anything new before using it on your face. Deals below show the regular price, today's price and the time they were checked.",
  ],
  "large-appliances/heaters-geysers": [
    "Winter is the season for room heaters, geysers and immersion rods, and prices on popular models move often from November to January. For geysers, choose the capacity by use: smaller instant geysers suit a kitchen or a quick hand wash, while storage geysers of 10 to 25 litres suit a bathroom shower. Check the tank material, the BEE star rating and the pressure rating if you live in a high-rise.",
    "Room heaters come in fan, halogen, carbon and oil-filled types; oil-filled heaters are slower to warm up but keep a room warm without drying the air as much. Immersion rods are the cheapest option for heating a bucket of water, but buy ISI-marked rods and never touch the water while one is switched on. Check whether installation is included before comparing geyser prices. These deals are re-checked every few hours.",
  ],
  "fashion/footwear": [
    "Footwear deals cover sports shoes, sneakers, sandals, slippers, formal shoes and heels. Sizing is the main risk: Indian and UK sizes are usually the same, but US and EU sizes differ, so check the size chart for each listing and read reviews that mention whether the shoe runs small or large.",
    "For running and walking shoes, look at the sole type and cushioning rather than the brand name alone. For everyday sandals and slippers, a good grip and a washable upper matter more than looks. Choose listings with easy exchanges if you are between sizes. Deals below are sorted by biggest discount and updated through the day.",
  ],
  "fashion/bags-luggage": [
    "Bags and luggage deals include backpacks, handbags, laptop bags, duffels and trolley bags. For trolley bags, check the size against your airline's cabin and check-in limits, the shell type (hard polycarbonate or soft fabric), the wheels (four spinner wheels are easier to move) and whether there is a TSA lock.",
    "Luggage sets of two or three look like great value, but only if you will use every size. For backpacks and laptop bags, check the laptop compartment size and padding, and the warranty, which on good luggage can run for several years. The wedding and holiday season is when luggage sells fastest, so price drops on popular sizes do not last long. Deals below are re-checked every few hours.",
  ],
  "home-kitchen/cleaning": [
    "Cleaning deals cover mops, brooms, cleaning liquids, scrubbers, dustbins and vacuum cleaners. These are everyday products, so a price drop is a good time to stock up on the ones you already use, especially refills and larger packs, which usually cost less per litre.",
    "For spin mops, check the bucket's build and whether refills are easy to find. For vacuum cleaners, compare suction power, the dust container size and whether it works on both floors and sofas; cordless models are easier to use but need charging. Check the warranty on anything with a motor. Each deal below shows its regular price and when it was last checked.",
  ],
  "baby/diapering": [
    "Diapers and wipes are the most repeated baby purchase, so a good deal on the brand and size you already use is real money saved. Compare the price per diaper rather than the pack price, since bigger packs and combo offers usually work out cheaper.",
    "Babies outgrow sizes quickly, so do not stock up too far ahead; one or two large packs of the current size, and a smaller pack of the next size up, is usually enough. Pant-style diapers are easier for active babies, while tape diapers suit newborns. For wipes, alcohol-free and fragrance-free versions are gentler on the skin. Deals below are checked every few hours.",
  ],
  "fashion/jewellery": [
    "Jewellery deals on CartCrush are mostly fashion and imitation jewellery: earrings, necklace sets, bangles, anklets and bridal sets, with the wedding season the busiest time. Check the material (brass, alloy, oxidised silver or gold plating) and look at real customer photos, since product photos can make plating look richer than it is.",
    "If you have sensitive skin, look for nickel-free or hypoallergenic pieces. For sets, check what is included, such as earrings, maang tikka or a box, and the size of the piece in centimetres. Fashion jewellery is rarely returnable once worn, so read recent reviews first. The deals below are sorted by biggest discount and updated through the day.",
  ],
};

export function introFor(department: string, category?: string): string[] | undefined {
  return category ? INTROS[`${department}/${category}`] : INTROS[department];
}
