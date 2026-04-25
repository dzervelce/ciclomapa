/*
 * Velokarte: Latvian translations for common OSM tags, used in popup details.
 * Originally Brazilian Portuguese; translated to Latvian. Map keys are OSM tag
 * names and values; values here are the human-readable labels rendered in popups.
 */
export const osmi18n: Record<string, string | null> = {
  /*
   * Cycleway tags
   */

  // Surface types
  surface: 'Segums',
  asphalt: 'Asfalts',
  concrete: 'Betons',
  gravel: 'Grants',
  dirt: 'Zeme',
  grass: 'Zāle',
  sand: 'Smiltis',
  paving_stones: 'Bruģis',
  paved: 'Cietais segums',

  // Properties
  maxspeed: 'Maksimālais ātrums',
  oneway: 'Vienvirziena?',
  'oneway:bicycle': 'Vienvirziena velosipēdiem?',

  // Road types
  path: 'Taka',
  tertiary: 'Terciārais ceļš',
  secondary: 'Sekundārais ceļš',
  primary: 'Galvenais ceļš',
  trunk: 'Šoseja',
  unclassified: 'Neklasificēts',
  living_street: 'Dzīvojamā zona',
  residential: 'Dzīvojamā ielā',
  service: 'Servisa ceļš',
  tunnel: 'Tunelis?',
  pedestrian: 'Gājēju zona',
  lane: 'Josla',
  buffered_lane: 'Buferēta josla',
  shared_lane: 'Koplietošanas josla',
  share_busway: 'Kopā ar autobusu joslu',
  opposite_share_busway: 'Pretējā autobusu josla',
  sidepath: 'Sānu ceļš',
  opposite_track: 'Pretējais ceļš',
  opposite_lane: 'Pretējā josla',
  opposite_buffered_lane: 'Pretējā buferētā josla',
  opposite_shared_lane: 'Pretējā koplietošanas josla',

  /*
   * POI tags
   */

  // Bike parking
  covered: 'Ar nojumi?',
  access: 'Piekļuve',
  capacity: 'Ietilpība',
  cyclestreets_id: '',
  maxstay: 'Maksimālais ilgums',
  surveillance: 'Novērošana?',
  supervised: 'Uzraudzīts?',
  lit: 'Apgaismots?',
  bicycle_parking: 'Veids',

  // Bike parking types
  stands: 'Apgriezts U',
  wall_loops: 'Sienas turētājs',
  rack: 'Režģis',
  wave: 'Vilnis',
  ground_slots: 'Zemes spraugas',
  wide_stands: 'Liels apgriezts U',
  anchors: 'Enkurs',
  shed: 'Nojume',
  bollard: '',
  informal: 'Neformāls',
  streetpod: '',
  tree: 'Koks',
  rope: 'Virve',
  'two-tier': '',
  floor: '',
  handlebar_holder: '',

  // Bike sharing & rental
  ref: 'Atsauce',
  network: 'Tīkls',
  description: 'Apraksts',
  'payment:cash': 'Maksājums ar skaidru naudu?',
  'payment:credit_cards': 'Maksājums ar kredītkarti?',
  'payment:debit_cards': 'Maksājums ar debetkarti?',
  'payment:bilhete_único': '',
  'payment:mobile_app': 'Maksājums ar lietotni?',
  operator: 'Operators',
  'operator:type': 'Operatora veids',

  // Bike sharing operator types
  government: 'Valsts',
  religious: 'Reliģisks',
  ngo: 'NVO',
  community: 'Sabiedrisks',
  consortium: 'Konsorcijs',
  cooperative: 'Kooperatīvs',

  // Bike shops
  repair: 'Remonts',
  second_hand: 'Lietoti',
  phone: 'Tālrunis',
  'phone:2': 'Tālrunis 2',
  'phone:3': 'Tālrunis 3',
  level: 'Stāvs',
  start_date: 'Kopš',
  'service:bicycle:chaintool': 'Ķēžu instrumenti?',
  'service:bicycle:repair': 'Remonts?',
  'service:bicycle:rental': 'Noma?',
  'service:bicycle:pump': 'Sūknis?',
  'service:bicycle:diy': 'Pašapkalpošanās?',
  'service:bicycle:cleaning': 'Tīrīšana?',
  'service:bicycle:second_hand': 'Lietoti velosipēdi?',
  'service:bicycle:charging': 'Uzlāde?',
  'service:bicycle:retail': 'Velosipēdu pārdošana?',
  'service:bicycle:parts': 'Detaļas?',
  'service:bicycle:tools': 'Pieejamie instrumenti',

  //////////////////////////

  // Generic
  website: 'Vietne',
  opening_hours: 'Darba laiki',
  note: 'Komentārs',
  'note:pt': 'Komentārs',
  email: 'E-pasts',
  wheelchair: 'Pieejams ratiņkrēslam?',
  yes: 'Jā',
  no: 'Nē',
  unknown: 'Nezināms',
  free: 'Bez maksas?',
  fee: 'Maksas?',
  only: 'Tikai',
  tyres: 'Riepas',
  public: 'Publiska',
  private: 'Privāta',
  limited: 'Ierobežota',
  designated: '',
  permissive: 'Atļauts?',
  customers: 'Klientiem',
  'addr:street': 'Iela',
  'addr:housenumber': 'Numurs',

  // Custom internal tags (not from OSM!)
  'ciclomapa:address': 'Adrese',

  //////////////////////////

  /*
   * Ignored OSM tags
   */
  id: null,
  amenity: null,
  name: null,
  'name:pt': null,
  source: null,
  shop: null,
  alt_name: null,
  'addr:housename': null,
  'addr:door': null,
  'addr:postcode': null,
  'addr:unit': null,
  'addr:city': null,
  'addr:state': null,
  'addr:country': null,
  'addr:suburb': null,
  'addr:room': null,
  internet_access: null,
  'internet_access:key': null,
  'internet_access:ssid': null,
  'pt:bicycle_parking': null,
  'bicycle_parking:pt': null,
  'survey:date': null,
  'disused:amenity': null,
};
