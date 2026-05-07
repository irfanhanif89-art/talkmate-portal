// Per-industry service templates surfaced in the Agent Builder tab.
// Only used as a default when a business's `services` array is empty —
// once a user saves any services, the saved data is the source of truth.
//
// Two key sets are supported:
//   1. The library-aligned keys actually stored in `businesses.industry`
//      (restaurant, towing, trades, mechanic, dental, medispa, realestate,
//       healthcare, ndis, retail, physio, accounting, cleaning, pest,
//       landscaping)
//   2. The brief's preferred keys (medi_spa, real_estate, pest_control)
//      aliased to the same template arrays so accidental drift is harmless.

export interface ServiceTemplate {
  name: string
  unit: string
}

export interface Service {
  id: string         // uuid, generated on creation, never changes
  name: string       // editable by admin; read-only for clients on template rows
  price: string      // dollar amount, stored as string, blank by default
  unit: string       // template-set hint, e.g. "per job", "per hour"
  enabled: boolean   // active for this business
  custom: boolean    // true only for user-added rows
}

export const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {

  restaurant: [
    { name: 'Standard delivery fee', unit: 'per delivery' },
    { name: 'Catering tray (feeds 10)', unit: 'per tray' },
    { name: 'Large party booking deposit', unit: 'per booking' },
    { name: 'After-hours surcharge', unit: 'per order' },
    { name: 'Special dietary meal (GF / vegan / halal)', unit: 'per meal' },
  ],

  towing: [
    { name: 'Standard callout fee (business hours)', unit: 'per job' },
    { name: 'After-hours callout', unit: 'per job' },
    { name: 'Public holiday callout', unit: 'per job' },
    { name: 'Tow to nearest mechanic (up to 10km)', unit: 'per job' },
    { name: 'Additional kilometres after first 10km', unit: 'per km' },
    { name: 'Long distance tow (50km+)', unit: 'per job' },
    { name: 'Standard car tow (sedan / hatch)', unit: 'per job' },
    { name: '4WD / SUV tow', unit: 'per job' },
    { name: 'Motorcycle tow', unit: 'per job' },
    { name: 'Van or light commercial tow', unit: 'per job' },
    { name: 'Heavy vehicle tow', unit: 'per job' },
    { name: 'Winching (off-road or ditch recovery)', unit: 'per job' },
    { name: 'AWD / 4WD flat tow surcharge', unit: 'per job' },
    { name: 'Accident recovery', unit: 'per job' },
    { name: 'Abandoned / private property tow', unit: 'per job' },
    { name: '20-foot container transport', unit: 'per job' },
    { name: 'Machinery or plant transport', unit: 'per job' },
    { name: 'Interstate or long haul', unit: 'per quote' },
    { name: 'Go jacks (vehicle stuck in park or no keys)', unit: 'per job' },
    { name: 'Lowered ramp / low clearance surcharge', unit: 'per job' },
    { name: 'Vehicle storage (holding yard)', unit: 'per day' },
    { name: 'After-hours release fee', unit: 'per release' },
  ],

  // Trades is special, see TRADE_TEMPLATES below.
  trades: [],

  mechanic: [
    { name: 'Standard logbook service', unit: 'per service' },
    { name: 'Major service', unit: 'per service' },
    { name: 'Labour rate', unit: 'per hour' },
    { name: 'Roadworthy / safety certificate', unit: 'per certificate' },
    { name: 'Tyre fitting', unit: 'per tyre' },
    { name: 'Wheel alignment', unit: 'per job' },
    { name: 'Battery replacement', unit: 'per job' },
    { name: 'AC regas', unit: 'per job' },
    { name: 'Brake pad replacement', unit: 'per axle' },
    { name: 'Pink slip (NSW) / RWC (QLD)', unit: 'per certificate' },
    { name: 'After-hours callout', unit: 'per job' },
  ],

  dental: [
    { name: 'Standard consultation', unit: 'per visit' },
    { name: 'Scale and clean', unit: 'per visit' },
    { name: 'New patient exam', unit: 'per visit' },
    { name: 'Emergency appointment', unit: 'per visit' },
    { name: 'Tooth extraction (simple)', unit: 'per tooth' },
    { name: 'Tooth extraction (surgical)', unit: 'per tooth' },
    { name: 'White filling', unit: 'per tooth' },
    { name: 'Root canal treatment', unit: 'per tooth' },
    { name: 'Dental crown', unit: 'per crown' },
    { name: 'X-ray (OPG)', unit: 'per scan' },
    { name: 'Mouthguard', unit: 'per unit' },
    { name: 'Teeth whitening (take-home kit)', unit: 'per kit' },
  ],

  medispa: [
    { name: 'Skin consultation', unit: 'per visit' },
    { name: 'Anti-wrinkle injection (1 area)', unit: 'per area' },
    { name: 'Dermal filler (0.5ml)', unit: 'per syringe' },
    { name: 'Hydrafacial', unit: 'per session' },
    { name: 'LED light therapy', unit: 'per session' },
    { name: 'Chemical peel', unit: 'per session' },
    { name: 'Microneedling', unit: 'per session' },
    { name: 'IPL photofacial', unit: 'per session' },
    { name: 'Laser hair removal (small area)', unit: 'per session' },
    { name: 'Laser hair removal (large area)', unit: 'per session' },
    { name: 'Eyebrow feathering / microblading', unit: 'per session' },
    { name: 'Lash lift and tint', unit: 'per session' },
  ],

  realestate: [
    { name: 'Property management fee', unit: '% of weekly rent' },
    { name: 'Letting fee', unit: 'per tenancy' },
    { name: 'Lease renewal fee', unit: 'per renewal' },
    { name: 'Routine inspection fee', unit: 'per inspection' },
    { name: 'End of lease inspection', unit: 'per inspection' },
    { name: 'Tribunal representation', unit: 'per appearance' },
    { name: 'Photography package', unit: 'per listing' },
    { name: 'Additional open home', unit: 'per open home' },
    { name: 'Maintenance coordination fee', unit: 'per job' },
    { name: 'Tenant find only (no management)', unit: 'per tenancy' },
  ],

  healthcare: [
    { name: 'Standard consultation (GP)', unit: 'per visit' },
    { name: 'Long consultation', unit: 'per visit' },
    { name: 'Telehealth consultation', unit: 'per visit' },
    { name: 'ECG', unit: 'per test' },
    { name: 'Skin check', unit: 'per visit' },
    { name: 'Wound care', unit: 'per visit' },
    { name: 'Immunisation (non-Medicare)', unit: 'per injection' },
    { name: 'Medical certificate', unit: 'per certificate' },
    { name: 'Mental health care plan', unit: 'per plan' },
    { name: 'Health assessment (75+ or chronic disease)', unit: 'per assessment' },
  ],

  physio: [
    { name: 'Initial assessment', unit: 'per visit' },
    { name: 'Standard treatment', unit: 'per visit' },
    { name: 'Extended treatment', unit: 'per visit' },
    { name: 'Dry needling', unit: 'per session' },
    { name: 'Hydrotherapy', unit: 'per session' },
    { name: 'Clinical pilates (1-on-1)', unit: 'per session' },
    { name: 'Group exercise class', unit: 'per class' },
    { name: 'Pre / post surgical rehabilitation', unit: 'per visit' },
    { name: 'NDIS support (plan managed)', unit: 'per hour' },
    { name: 'WorkCover consultation', unit: 'per visit' },
    { name: 'Home visit', unit: 'per visit' },
  ],

  accounting: [
    { name: 'Individual tax return', unit: 'per return' },
    { name: 'Business tax return (company / trust)', unit: 'per return' },
    { name: 'BAS lodgement', unit: 'per quarter' },
    { name: 'Bookkeeping', unit: 'per hour' },
    { name: 'Payroll processing (up to 5 staff)', unit: 'per month' },
    { name: 'Financial statements preparation', unit: 'per year' },
    { name: 'Company setup / registration', unit: 'per setup' },
    { name: 'Xero / MYOB setup and training', unit: 'per setup' },
    { name: 'Self-managed super fund (SMSF)', unit: 'per year' },
    { name: 'ATO audit representation', unit: 'per hour' },
    { name: 'Business advisory consultation', unit: 'per hour' },
  ],

  cleaning: [
    { name: 'Regular house clean', unit: 'per visit' },
    { name: 'Deep clean', unit: 'per job' },
    { name: 'Bond / end-of-lease clean (2 bed 1 bath)', unit: 'per job' },
    { name: 'Bond / end-of-lease clean (3 bed 2 bath)', unit: 'per job' },
    { name: 'Bond / end-of-lease clean (4 bed 2 bath)', unit: 'per job' },
    { name: 'Carpet steam clean', unit: 'per room' },
    { name: 'Oven clean', unit: 'per oven' },
    { name: 'Window clean (internal)', unit: 'per hour' },
    { name: 'Pressure wash (driveway or paths)', unit: 'per job' },
    { name: 'After-builders clean', unit: 'per job' },
    { name: 'Regular office clean', unit: 'per visit' },
    { name: 'Commercial clean', unit: 'per hour' },
  ],

  pest: [
    { name: 'General pest spray (cockroaches, ants, spiders)', unit: 'per treatment' },
    { name: 'Rodent control (bait and trap)', unit: 'per treatment' },
    { name: 'Termite inspection', unit: 'per inspection' },
    { name: 'Termite barrier treatment', unit: 'per job' },
    { name: 'Pre-purchase pest inspection', unit: 'per inspection' },
    { name: 'Flea treatment', unit: 'per treatment' },
    { name: 'End of lease flea treatment', unit: 'per job' },
    { name: 'Bed bug treatment', unit: 'per room' },
    { name: 'Wasp or bee nest removal', unit: 'per nest' },
    { name: 'Possum removal', unit: 'per job' },
    { name: 'Bird control', unit: 'per job' },
    { name: 'Ongoing quarterly pest plan', unit: 'per year' },
  ],

  landscaping: [
    { name: 'Lawn mow (small block under 400sqm)', unit: 'per visit' },
    { name: 'Lawn mow (medium block 400-800sqm)', unit: 'per visit' },
    { name: 'Lawn mow (large block 800sqm+)', unit: 'per visit' },
    { name: 'Edge and trim', unit: 'per visit' },
    { name: 'Hedge trimming', unit: 'per hour' },
    { name: 'Garden bed weed and tidy', unit: 'per hour' },
    { name: 'Fertilise and feed', unit: 'per treatment' },
    { name: 'Green waste removal', unit: 'per load' },
    { name: 'Irrigation installation or repair', unit: 'per job' },
    { name: 'Turf supply and lay', unit: 'per sqm' },
    { name: 'Retaining wall or paving', unit: 'per quote' },
    { name: 'Tree and stump removal', unit: 'per job' },
    { name: 'Garden design consultation', unit: 'per hour' },
  ],
}

// Aliases so the brief's preferred industry keys (with underscores) work
// even if a business row is created with them later.
SERVICE_TEMPLATES['medi_spa'] = SERVICE_TEMPLATES.medispa
SERVICE_TEMPLATES['real_estate'] = SERVICE_TEMPLATES.realestate
SERVICE_TEMPLATES['pest_control'] = SERVICE_TEMPLATES.pest
SERVICE_TEMPLATES['restaurants'] = SERVICE_TEMPLATES.restaurant

export const TRADE_TEMPLATES: Record<string, ServiceTemplate[]> = {

  plumber: [
    { name: 'Callout fee', unit: 'per job' },
    { name: 'Labour rate', unit: 'per hour' },
    { name: 'After-hours callout', unit: 'per job' },
    { name: 'Emergency callout (burst pipe, gas leak, sewage)', unit: 'per job' },
    { name: 'Blocked drain (standard)', unit: 'per job' },
    { name: 'Blocked drain (with CCTV camera)', unit: 'per job' },
    { name: 'Leaking tap repair', unit: 'per tap' },
    { name: 'Toilet repair or replacement', unit: 'per job' },
    { name: 'Hot water system replacement (electric)', unit: 'per unit' },
    { name: 'Hot water system replacement (gas)', unit: 'per unit' },
    { name: 'Pipe reline', unit: 'per metre' },
    { name: 'Gas fitting', unit: 'per hour' },
    { name: 'Travel outside service area', unit: 'per km' },
  ],

  electrician: [
    { name: 'Callout fee', unit: 'per job' },
    { name: 'Labour rate', unit: 'per hour' },
    { name: 'After-hours callout', unit: 'per job' },
    { name: 'Emergency callout', unit: 'per job' },
    { name: 'Power point installation', unit: 'per point' },
    { name: 'Light fitting installation', unit: 'per fitting' },
    { name: 'Safety switch (RCD) installation', unit: 'per switch' },
    { name: 'Switchboard upgrade', unit: 'per job' },
    { name: 'Smoke alarm installation', unit: 'per alarm' },
    { name: 'Ceiling fan installation', unit: 'per fan' },
    { name: 'EV charger installation', unit: 'per job' },
    { name: 'Air conditioning installation (split system)', unit: 'per unit' },
    { name: 'Electrical inspection and certificate', unit: 'per certificate' },
    { name: 'Travel outside service area', unit: 'per km' },
  ],

  locksmith: [
    { name: 'Standard callout fee (business hours)', unit: 'per job' },
    { name: 'After-hours callout', unit: 'per job' },
    { name: 'Emergency lockout (residential)', unit: 'per job' },
    { name: 'Emergency lockout (commercial)', unit: 'per job' },
    { name: 'Car lockout', unit: 'per job' },
    { name: 'Car key cut and program (standard)', unit: 'per key' },
    { name: 'Car key cut and program (transponder / chip)', unit: 'per key' },
    { name: 'Lock rekey (standard cylinder)', unit: 'per lock' },
    { name: 'Lock rekey (trilock or euro cylinder)', unit: 'per lock' },
    { name: 'Deadbolt supply and install', unit: 'per lock' },
    { name: 'High-security deadbolt supply and install', unit: 'per lock' },
    { name: 'Gate lock supply and install', unit: 'per lock' },
    { name: 'Master key system setup', unit: 'per job' },
    { name: 'Safe opening', unit: 'per job' },
    { name: 'Safe lock replacement', unit: 'per job' },
    { name: 'CCTV installation', unit: 'per camera' },
    { name: 'Access control system', unit: 'per door' },
    { name: 'Security screen door lock', unit: 'per door' },
    { name: 'Duplicate key cut (standard)', unit: 'per key' },
    { name: 'Duplicate key cut (restricted / high-security)', unit: 'per key' },
  ],

  builder: [
    { name: 'Callout fee', unit: 'per job' },
    { name: 'Labour rate', unit: 'per hour' },
    { name: 'After-hours callout', unit: 'per job' },
    { name: 'Fence repair or replacement', unit: 'per metre' },
    { name: 'Deck repair', unit: 'per hour' },
    { name: 'Gutter clean and inspection', unit: 'per job' },
    { name: 'Pressure washing (driveway or paths)', unit: 'per job' },
    { name: 'Fly screen repair or replacement', unit: 'per screen' },
    { name: 'Door hardware replacement', unit: 'per door' },
    { name: 'Flat-pack furniture assembly', unit: 'per hour' },
    { name: 'Tile repair', unit: 'per hour' },
    { name: 'Painting (interior, per room)', unit: 'per room' },
    { name: 'Plastering or patching', unit: 'per hour' },
    { name: 'Materials markup', unit: '% on materials' },
  ],

  air_conditioning: [
    { name: 'Callout fee', unit: 'per job' },
    { name: 'Labour rate', unit: 'per hour' },
    { name: 'After-hours callout', unit: 'per job' },
    { name: 'Split system supply and install (2.5kW)', unit: 'per unit' },
    { name: 'Split system supply and install (5.0kW)', unit: 'per unit' },
    { name: 'Split system supply and install (7.0kW+)', unit: 'per unit' },
    { name: 'AC service and clean (split system)', unit: 'per unit' },
    { name: 'AC regas', unit: 'per unit' },
    { name: 'Ducted system service', unit: 'per system' },
    { name: 'Thermostat replacement', unit: 'per unit' },
    { name: 'Warranty repair', unit: 'per job' },
    { name: 'Travel outside service area', unit: 'per km' },
  ],
}

export const TRADE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'builder', label: 'Builder / Handyman' },
  { value: 'air_conditioning', label: 'Air Conditioning / HVAC' },
]

// Build the default services array from a template. Used when a business
// has no saved services yet — once they save anything, it's never replaced.
function templateToServices(templates: ServiceTemplate[]): Service[] {
  return templates.map(t => ({
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: t.name,
    unit: t.unit,
    price: '',
    enabled: true,
    custom: false,
  }))
}

// Single entry point used by both admin + client UIs. Always returns the
// saved data when present; only falls back to a template when nothing is saved.
export function getInitialServices(args: {
  industry: string | null
  trade_type: string | null
  saved: Service[] | null | undefined
}): Service[] {
  if (args.saved && args.saved.length > 0) return args.saved

  if (args.industry === 'trades') {
    if (!args.trade_type) return []
    return templateToServices(TRADE_TEMPLATES[args.trade_type] ?? [])
  }

  return templateToServices(SERVICE_TEMPLATES[args.industry ?? ''] ?? [])
}

// Re-export for components that need to build a fresh template themselves.
export { templateToServices }
