// Curated "what to eat here" seed — the reliable backbone of dish recommendations
// (Part B). Always works offline; live Reddit/Places mining and the planner LLM
// enrich on top. Keyed by state (broad reuse) with a few city-specific overrides
// for places with a distinct food identity. Dishes are real signature plates.

export interface Dish {
  name: string;
  // One short line: what it is / why to try it.
  description: string;
}

// City/slug-specific overrides take priority over the destination's state.
const dishesByCity: Record<string, Dish[]> = {
  gokarna: [
    { name: "Gokarna thali", description: "banana-leaf veg thali with local sambars" },
    { name: "Filter coffee & neer dosa", description: "coastal Karnataka breakfast staple" },
  ],
  hampi: [
    { name: "Mango-tree thali", description: "unlimited North-Karnataka veg thali by the riverside" },
  ],
  pondicherry: [
    { name: "Tamil-French crêpes", description: "the colonial-Creole fusion Pondy is known for" },
    { name: "Podanlangkai stew & baguette", description: "Pondicherrian Creole cooking" },
  ],
  varkala: [
    { name: "Cliff-side grilled seafood", description: "catch-of-the-day on the North Cliff shacks" },
    { name: "Kerala fish curry & appam", description: "coconut-milk Malabar classic" },
  ],
  udaipur: [
    { name: "Dal baati churma", description: "Rajasthan's baked-wheat-and-lentil signature" },
    { name: "Laal maas", description: "fiery Mathania-chilli mutton curry" },
  ],
  jaisalmer: [
    { name: "Ker sangri", description: "desert-bean-and-berry Marwari dry curry" },
    { name: "Pyaaz kachori", description: "flaky onion-stuffed fried snack" },
  ],
  mcleodganj: [
    { name: "Tibetan thukpa & momos", description: "the Tibetan-refugee kitchens here do it best" },
    { name: "Tingmo with shapta", description: "steamed bread with stir-fried beef/veg" },
  ],
  manali: [
    { name: "Siddu", description: "steamed Himachali stuffed-wheat bun with ghee" },
    { name: "Trout tikka", description: "fresh river trout, a Kullu-valley specialty" },
  ],
  spiti: [
    { name: "Thukpa & tsampa", description: "high-altitude Spitian comfort food" },
    { name: "Chha gosht", description: "barley-flour-and-yoghurt mutton curry" },
  ],
  majuli: [
    { name: "Apong & fish tenga", description: "rice beer and a tangy Assamese fish curry" },
  ],
  ziro: [
    { name: "Apatani bamboo-shoot pork", description: "smoky tribal cooking of the Apatani plateau" },
  ],
  lucknow: [
    { name: "Tunday galouti kebab", description: "melt-in-the-mouth Awadhi minced-meat kebab" },
    { name: "Lucknowi biryani & sheermal", description: "fragrant dum biryani with saffron flatbread" },
  ],
  amritsar: [
    { name: "Amritsari kulcha & chole", description: "crisp stuffed kulcha with spiced chickpeas" },
    { name: "Lassi & dal makhani", description: "thick sweet lassi and slow-cooked black dal" },
  ],
  kolkata: [
    { name: "Phuchka & kathi roll", description: "Kolkata's legendary street snacks" },
    { name: "Kosha mangsho & mishti", description: "slow mutton curry and Bengali sweets" },
  ],
  varanasi: [
    { name: "Kachori sabzi & jalebi", description: "the classic Banarasi breakfast" },
    { name: "Banarasi paan", description: "the city's signature after-meal ritual" },
  ],
  darjeeling: [
    { name: "Momos & thukpa", description: "Tibetan dumplings and noodle soup in the hills" },
    { name: "Darjeeling tea", description: "first-flush brews straight from the estates" },
  ],
  gulmarg: [
    { name: "Rogan josh & yakhni", description: "Kashmiri wazwan mutton classics" },
    { name: "Kahwa & Kashmiri pulao", description: "saffron tea and fruit-studded rice" },
  ],
};

const dishesByState: Record<string, Dish[]> = {
  Goa: [
    { name: "Fish recheado", description: "whole fish stuffed with red Goan masala" },
    { name: "Pork vindaloo", description: "vinegar-and-chilli Portuguese-Goan curry" },
    { name: "Bebinca", description: "layered coconut dessert" },
  ],
  Rajasthan: [
    { name: "Dal baati churma", description: "the state's baked-wheat-and-lentil signature" },
    { name: "Laal maas", description: "fiery Mathania-chilli mutton curry" },
    { name: "Pyaaz kachori", description: "flaky onion-stuffed fried snack" },
  ],
  Kerala: [
    { name: "Kerala sadya", description: "banana-leaf feast of 20+ vegetarian items" },
    { name: "Karimeen pollichathu", description: "pearl-spot fish grilled in banana leaf" },
    { name: "Puttu & kadala curry", description: "steamed rice cake with black-chickpea curry" },
  ],
  Karnataka: [
    { name: "Neer dosa & coastal fish curry", description: "Mangalorean coast staple" },
    { name: "Mysore masala dosa", description: "with the signature red chutney" },
  ],
  Uttarakhand: [
    { name: "Kafuli", description: "green-leaf Garhwali curry" },
    { name: "Bhang ki chutney", description: "tangy roasted-hemp-seed chutney" },
    { name: "Aloo ke gutke", description: "spiced Kumaoni potatoes with bhang" },
  ],
  "Himachal Pradesh": [
    { name: "Siddu", description: "steamed stuffed-wheat bun with ghee" },
    { name: "Dham", description: "festive sit-down rice-and-lentil feast" },
    { name: "Madra", description: "yoghurt-and-chickpea Chamba curry" },
  ],
  "Tamil Nadu": [
    { name: "Chettinad chicken", description: "pepper-forward Chettiar curry" },
    { name: "Filter coffee & idli", description: "the definitive Tamil breakfast" },
  ],
  "Madhya Pradesh": [
    { name: "Poha-jalebi", description: "the classic MP breakfast pairing" },
    { name: "Bhutte ka kees", description: "grated-corn snack" },
  ],
  "Andhra Pradesh": [
    { name: "Andhra meals", description: "fiery rice thali with gongura and pickles" },
  ],
  "Arunachal Pradesh": [
    { name: "Bamboo-shoot pork", description: "smoky tribal cooking" },
    { name: "Thukpa", description: "Himalayan noodle soup" },
  ],
  Assam: [
    { name: "Masor tenga", description: "tangy Assamese fish curry" },
    { name: "Aloo pitika & rice", description: "mashed-potato comfort plate" },
  ],
  Meghalaya: [
    { name: "Jadoh", description: "Khasi red-rice-and-pork dish" },
    { name: "Tungrymbai", description: "fermented-soybean Khasi specialty" },
  ],
  Maharashtra: [
    { name: "Malvani fish thali", description: "coastal Konkan seafood thali with kokum" },
    { name: "Sol kadhi", description: "kokum-and-coconut digestive drink" },
  ],
  "Daman & Diu": [
    { name: "Grilled prawns & Portuguese seafood", description: "fresh catch, Portuguese-influenced" },
  ],
  "Andaman & Nicobar": [
    { name: "Grilled lobster & fish curry", description: "just-caught island seafood" },
    { name: "Coconut prawn curry", description: "coastal Andaman staple" },
  ],
  "Uttar Pradesh": [
    { name: "Awadhi kebab & biryani", description: "rich Nawabi cooking — galouti, sheermal, dum biryani" },
    { name: "Kachori sabzi", description: "spiced fried breakfast staple" },
  ],
  "West Bengal": [
    { name: "Macher jhol & rice", description: "everyday Bengali fish curry" },
    { name: "Rosogolla & mishti doi", description: "iconic Bengali sweets" },
  ],
  Punjab: [
    { name: "Sarson da saag & makki di roti", description: "winter Punjabi comfort food" },
    { name: "Butter chicken & dal makhani", description: "rich Amritsari classics" },
  ],
  Bihar: [
    { name: "Litti chokha", description: "roasted wheat balls with spiced mash" },
    { name: "Sattu paratha", description: "roasted-gram-stuffed flatbread" },
  ],
  Gujarat: [
    { name: "Gujarati thali", description: "sweet-savoury platter with dhokla and farsan" },
    { name: "Fafda-jalebi & thepla", description: "classic Gujarati snacks" },
  ],
  "Jammu & Kashmir": [
    { name: "Rogan josh & yakhni", description: "Kashmiri wazwan mutton classics" },
    { name: "Kahwa", description: "saffron-and-almond green tea" },
  ],
  Ladakh: [
    { name: "Thukpa & momos", description: "warming high-altitude noodle soup and dumplings" },
    { name: "Skyu & butter tea", description: "hearty Ladakhi wheat stew with gur-gur chai" },
  ],
};

// Resolve a destination's signature dishes: city override first, then state.
// Returns [] for places we have no seed for (live/LLM enrichment fills in).
export function dishesFor(input: { slug?: string; name: string; state?: string }): Dish[] {
  const slugKey = (input.slug ?? "").toLowerCase();
  const nameKey = input.name.toLowerCase();
  const city = dishesByCity[slugKey] ?? dishesByCity[nameKey];
  if (city) return city;
  if (input.state && dishesByState[input.state]) return dishesByState[input.state];
  return [];
}
