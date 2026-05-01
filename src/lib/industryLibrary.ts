// Industry-aware onboarding pre-fill library.
// Pure data — no imports from application code.
// Consumed by the onboarding wizard to pre-populate services, FAQs,
// escalation rules, recommended voice, and greeting text per industry.

export interface ServiceItem {
  name: string
  category: string
  description: string
  priceRange?: string
}

export interface FAQItem {
  question: string
  answer: string
}

export interface IndustryData {
  label: string
  emoji: string
  color: string
  recommendedVoiceId: string
  recommendedVoiceName: string
  greetingTemplate: string   // use {{businessName}} as placeholder
  services: ServiceItem[]
  faqs: FAQItem[]
  escalationRules: string
  videoUrl: string | null    // null = hide the video button
  seasonalNote?: string
}

export const INDUSTRY_LIBRARY: Record<string, IndustryData> = {

  restaurant: {
    label: "Restaurant & Takeaway",
    emoji: "🍽️",
    color: "#e84393",
    recommendedVoiceId: "snyKKuaGYk1VUEh42zbW",
    recommendedVoiceName: "Chris",
    greetingTemplate: "{{businessName}}, hey — how can I help?",
    services: [
      { name: "Table Reservations", category: "Bookings", description: "Taken by phone, walk-in, or online" },
      { name: "Takeaway Orders", category: "Food", description: "Phone orders for collection" },
      { name: "Function Bookings", category: "Events", description: "Private dining, group bookings, set menus" },
      { name: "Dietary Queries", category: "General", description: "Gluten free, vegan, nut allergy, dairy free" },
      { name: "Hours & Location", category: "General", description: "Trading hours, parking, access info" },
    ],
    faqs: [
      { question: "Are you open on weekends / public holidays? Is there a surcharge?", answer: "Yeah we're open — there's a [X]% surcharge on weekends and [X]% on public holidays. We always let people know upfront." },
      { question: "Do you take walk-ins or do I need to book?", answer: "We take both — but for Friday and Saturday nights we'd recommend booking ahead. What night were you thinking?" },
      { question: "Do you have gluten free / vegan options?", answer: "Yeah we do — a few options on the menu. Anything else to flag? Any allergies we should know about?" },
      { question: "We're a big group — can you fit us?", answer: "Depends on numbers and timing — how many are you and what date are you looking at? We can usually accommodate groups with a bit of notice." },
      { question: "Are you BYO? Do you charge corkage?", answer: "We are BYO — corkage is $[X] per bottle. Wine only." },
    ],
    escalationRules: "If caller is calling about a complaint or incident that happened during a visit → take their name and number and let them know the manager will call back same day.\nIf caller has a severe allergy requiring kitchen confirmation → transfer immediately.\nIf caller is asking about a large function (10+ people) or corporate event → transfer to manager or take callback details.",
    videoUrl: null,
  },

  towing: {
    label: "Towing & Transport",
    emoji: "🚗",
    color: "#00e5b4",
    recommendedVoiceId: "IKne3meq5aSn9XLyUdCD",
    recommendedVoiceName: "Charlie",
    greetingTemplate: "{{businessName}} — what's going on?",
    services: [
      { name: "Emergency Breakdown Tow", category: "Emergency", description: "24/7 roadside response" },
      { name: "Car Lockout", category: "Emergency", description: "Keys locked in vehicle, no damage" },
      { name: "Jump Start", category: "Roadside", description: "Battery boost, quick fix" },
      { name: "Fuel Delivery", category: "Roadside", description: "Petrol or diesel to your location" },
      { name: "Long Distance Tow", category: "Towing", description: "Interstate or regional towing" },
      { name: "Accident Recovery", category: "Emergency", description: "Post-crash tow and recovery" },
    ],
    faqs: [
      { question: "How long will you be?", answer: "Whereabouts are you? Once I know your location I can give you a proper time." },
      { question: "It's an AWD / 4WD — is that okay?", answer: "Yep, we'll bring a flatbed for that — only safe way to tow an AWD without damaging the diff." },
      { question: "I've got RACV / NRMA — does that cover this?", answer: "Depends on your cover level — worth calling them first. If they're sending someone, great. If you'd rather not wait we can come straight out and sort the billing separately." },
      { question: "How much per km?", answer: "We charge $[X] per km beyond the first [X]. Can I get your pickup and drop-off so I can give you a total?" },
      { question: "Someone at the accident scene is pressuring me to sign something.", answer: "Don't sign anything at the scene. Call your insurance first — they'll organise your tow and it protects you. We can come to you right now." },
    ],
    escalationRules: "If caller is in an unsafe location (freeway, highway shoulder, dark road at night) → treat as priority, get location immediately, reassure on ETA before anything else.\nIf caller has been in an accident and sounds shaken → confirm nobody is injured before proceeding.\nIf caller is being pressured to sign at an accident scene → advise not to sign and escalate to senior operator.\nIf caller mentions children are in the vehicle → priority response.",
    videoUrl: null,
  },

  realestate: {
    label: "Real Estate",
    emoji: "🏠",
    color: "#4a9eff",
    recommendedVoiceId: "gEdKKVxVhNCulBgRQ9GW",
    recommendedVoiceName: "Charlotte (Pro)",
    greetingTemplate: "{{businessName}}, hi — how can I help you today?",
    services: [
      { name: "Property Enquiries", category: "Sales", description: "Availability, price guides, inspection bookings" },
      { name: "Rental Enquiries", category: "Rentals", description: "Availability, bond, applications, inspections" },
      { name: "Appraisal Requests", category: "Landlord", description: "Free market appraisals, no obligation" },
      { name: "Property Management", category: "Landlord", description: "Fee structure, switching agents, maintenance" },
      { name: "Landlord Enquiries", category: "Landlord", description: "Management fees, rental yield, vacancy" },
    ],
    faqs: [
      { question: "Is this property still available?", answer: "Yes it is — when would you like to come and have a look? I can get you booked in for the next inspection." },
      { question: "What's your management fee?", answer: "Our standard management fee is [X]% of the weekly rent. That covers everything — rent collection, maintenance, inspections and statements. There's also a letting fee of [X] weeks when a new tenant moves in. No hidden charges." },
      { question: "I want to switch property managers — how does that work?", answer: "Pretty straightforward — we handle the transfer and communication with your current manager. Usually takes a couple of weeks. What's the property address?" },
      { question: "Can I get a market appraisal on my property?", answer: "Absolutely — we do that for free, no obligation. When would suit you for someone to come out and have a look?" },
      { question: "Are pets considered for this property?", answer: "I'd have to check that with the landlord — can I grab your name and number and have someone call you back? What kind of pet do you have?" },
    ],
    escalationRules: "If caller wants to make an offer on a property → transfer to the listing agent immediately.\nIf a tenant is reporting urgent maintenance (no hot water, gas leak, roof leak, no working locks) → transfer immediately or take number for urgent callback within 1 hour.\nIf caller is a landlord wanting to discuss switching agents → transfer to a senior property manager within 24 hours.",
    videoUrl: null,
  },

  trades: {
    label: "Trades & Services",
    emoji: "🔧",
    color: "#f59e0b",
    recommendedVoiceId: "IKne3meq5aSn9XLyUdCD",
    recommendedVoiceName: "Charlie",
    greetingTemplate: "{{businessName}}, hey — what do you need done?",
    services: [
      { name: "Emergency Callout", category: "Emergency", description: "Burst pipes, power out, gas leaks — 24/7", priceRange: "$150–$350" },
      { name: "Free Quote", category: "General", description: "On-site quote, no obligation" },
      { name: "Plumbing", category: "Plumbing", description: "Leaks, blockages, hot water, taps, bathrooms", priceRange: "$110–$180/hr" },
      { name: "Electrical", category: "Electrical", description: "Faults, switchboards, lighting, safety switches", priceRange: "$110–$180/hr" },
      { name: "Carpentry", category: "Building", description: "Repairs, decks, fencing, fit-outs", priceRange: "$80–$120/hr" },
      { name: "General Maintenance", category: "General", description: "Ongoing property maintenance and repairs" },
    ],
    faqs: [
      { question: "Do you charge a callout fee?", answer: "Yeah, there's a callout of $[X] — that covers the first 30 minutes on site. If you go ahead with the work it comes off the total." },
      { question: "Will you call me if it's going to cost more than the quote?", answer: "Always — we never do extra work without calling first. You'll always know the price before we proceed." },
      { question: "Are you licensed and insured?", answer: "Yeah, fully licensed and insured — I can send you the details before we arrive if you'd like." },
      { question: "How quickly can you come?", answer: "Depends whether it's an emergency or a regular job — what's going on? If it's urgent we'll prioritise it." },
      { question: "Can you give me a rough price over the phone?", answer: "Hard to give a firm number without seeing it — too many variables. For a standard job you're usually looking at $[X] to $[Y]. We'll give you a written quote on site." },
    ],
    escalationRules: "If caller reports a gas leak → advise them to leave the property immediately and call 000 before calling us. Transfer immediately.\nIf caller has no hot water, no power, or water coming through the ceiling → treat as emergency priority.\nIf caller is a property manager with multiple jobs → transfer to the business owner.",
    videoUrl: null,
  },

  healthcare: {
    label: "Healthcare & Clinics",
    emoji: "🏥",
    color: "#10b981",
    recommendedVoiceId: "56bWURjYFHyYyVf490Dp",
    recommendedVoiceName: "Emma",
    greetingTemplate: "{{businessName}}, hi — how can I help you today?",
    services: [
      { name: "Appointment Booking", category: "Bookings", description: "New and returning patient appointments" },
      { name: "Medicare / Care Plan Enquiries", category: "Billing", description: "Gap fees, rebates, care plans explained" },
      { name: "Urgent Appointments", category: "Emergency", description: "Same-day or next-day urgent slots" },
      { name: "New Patient Registration", category: "Admin", description: "Accepting new patients, what to bring" },
      { name: "Results and Referrals", category: "Admin", description: "Following up on results or specialist referrals" },
    ],
    faqs: [
      { question: "Do you bulk bill?", answer: "We [do / don't] bulk bill — [if not: our standard consult is $[X] and the Medicare rebate is around $[X], so your gap is about $[X]]. Would you like to book in?" },
      { question: "Are you accepting new patients?", answer: "Yes we are — do you have a Medicare card? I can get you set up as a new patient right now." },
      { question: "I need to see a doctor today — do you have anything?", answer: "Let me check — can I get your name and date of birth? And is this urgent or can it wait until later today?" },
      { question: "What do I need to bring for my first appointment?", answer: "Your Medicare card, any current medications, and if you have a referral bring that along. We'll take care of the rest." },
      { question: "Can I get a referral over the phone?", answer: "Referrals do need a consultation — but if your specialist has sent through details we can check. Can I get your name?" },
    ],
    escalationRules: "If caller describes symptoms of a medical emergency (chest pain, difficulty breathing, stroke symptoms, severe bleeding) → advise them to call 000 immediately. Do not book an appointment.\nIf caller is distressed or sounds unwell → transfer to reception immediately.\nIf caller mentions a mental health crisis → provide Lifeline number 13 11 14 and transfer immediately.",
    videoUrl: null,
  },

  ndis: {
    label: "NDIS Provider",
    emoji: "💙",
    color: "#6366f1",
    recommendedVoiceId: "cvpTJfe9LINpHIOmB2Hp",
    recommendedVoiceName: "Charlotte (Warm)",
    greetingTemplate: "{{businessName}}, hi — how can I help you today?",
    services: [
      { name: "Support Coordination", category: "NDIS", description: "Helping participants navigate and use their plan" },
      { name: "Daily Living Support", category: "NDIS", description: "Assistance with daily activities at home" },
      { name: "Community Access", category: "NDIS", description: "Getting out and about, social activities" },
      { name: "Therapy Services", category: "NDIS", description: "OT, speech, psychology, physio via NDIS" },
      { name: "Plan Management", category: "NDIS", description: "Managing NDIS budgets and invoices" },
    ],
    faqs: [
      { question: "Are you a registered NDIS provider?", answer: "Yes, we're a registered NDIS provider. We can work with plan-managed, self-managed, and agency-managed participants." },
      { question: "My plan is up for review — can you help?", answer: "Absolutely — we can support you through the review process. Can I get your name and I'll have one of our coordinators call you back?" },
      { question: "How do I start? I've just got my NDIS plan.", answer: "Congratulations on your plan — first step is telling us a bit about your goals. Can I take your details and have a coordinator reach out today?" },
      { question: "What areas do you cover?", answer: "We cover [areas] — can I ask whereabouts you're located so I can confirm?" },
      { question: "Do you charge anything on top of the NDIS rate?", answer: "No — we only charge the NDIS price guide rate. No additional fees beyond what your plan covers." },
    ],
    escalationRules: "If participant is in distress or describing a safety concern → transfer immediately.\nIf caller is a family member concerned about a participant's safety or welfare → transfer to a senior coordinator immediately.\nIf participant is asking about plan review, NDIS Appeals, or AAT process → transfer to a support coordinator — do not advise without specialist involvement.",
    videoUrl: null,
  },

  retail: {
    label: "Retail",
    emoji: "🛍️",
    color: "#f97316",
    recommendedVoiceId: "snyKKuaGYk1VUEh42zbW",
    recommendedVoiceName: "Chris",
    greetingTemplate: "{{businessName}}, hey — how can I help?",
    services: [
      { name: "Stock Enquiries", category: "General", description: "Availability, sizes, colours, models" },
      { name: "Click and Collect", category: "Orders", description: "Buy online, collect in store" },
      { name: "Returns and Exchanges", category: "Returns", description: "Faulty goods and change of mind policy" },
      { name: "Gift Services", category: "General", description: "Gift wrapping, gift cards, layby" },
      { name: "Price Match", category: "Sales", description: "Matching competitor prices — same product, authorised retailer" },
      { name: "Product Advice", category: "General", description: "Help choosing the right product" },
    ],
    faqs: [
      { question: "Do you have [product] in stock?", answer: "Let me check that for you — what's the exact model or item? Yes we have it — do you want to come in today or would you like me to hold one?" },
      { question: "I've seen it cheaper at [competitor] — do you price match?", answer: "Depends on the retailer and the product. If it's the exact same model at an authorised store, we'll look at it. Where did you see it?" },
      { question: "I bought this last week and it's not working — can I get a refund?", answer: "Absolutely — if there's a genuine fault you have every right to a refund or replacement under Australian Consumer Law. Bring it in with your receipt and we'll sort it out." },
      { question: "I changed my mind — can I return it?", answer: "Change of mind isn't required under the law, but if it's unused and in the original packaging we'll see what we can do. Do you have the receipt?" },
      { question: "Do you do gift wrapping / layby / gift cards?", answer: "Yes to all three — just come in and we can help you out." },
    ],
    escalationRules: "If caller is reporting a product safety issue or injury caused by a product → transfer to the owner or manager immediately.\nIf caller is aggressive or threatening about a return dispute → transfer to the owner. Do not attempt to resolve escalated disputes.\nIf caller is asking about a large or wholesale order → transfer to the owner.",
    videoUrl: null,
  },

  dental: {
    label: "Dental Practice",
    emoji: "🦷",
    color: "#06b6d4",
    recommendedVoiceId: "56bWURjYFHyYyVf490Dp",
    recommendedVoiceName: "Emma",
    greetingTemplate: "{{businessName}}, hi — how can I help you today?",
    services: [
      { name: "Checkup & Clean", category: "General", description: "New and existing patient examinations", priceRange: "$200–$400" },
      { name: "Emergency Appointments", category: "Emergency", description: "Toothache, cracked tooth, same-day" },
      { name: "New Patient Registration", category: "Admin", description: "Accepting new patients, what to bring" },
      { name: "Billing & Health Fund", category: "Billing", description: "Gap fees, HICAPS, payment plans" },
      { name: "Cosmetic Consultations", category: "Cosmetic", description: "Whitening, veneers, Invisalign" },
    ],
    faqs: [
      { question: "Do you bulk bill?", answer: "We don't bulk bill adults — dental isn't covered under Medicare except for kids under the Child Dental Benefits Schedule. We accept all major health funds and process your claim on the spot through HICAPS so you just pay the gap." },
      { question: "How much is a checkup and clean?", answer: "For a new patient with x-rays it's usually $[X] to $[X]. If you have extras cover your fund will cover a portion — most cover 60 to 80 percent on general dental." },
      { question: "I've got a toothache — can I come in today?", answer: "Let me check our emergency slots — can I get your name? What's going on — sharp pain, dull ache, or sensitivity to temperature?" },
      { question: "I'm really anxious about dentists.", answer: "No judgment at all — we see nervous patients all the time. Just let me flag that for the dentist so they know to take their time with you. First visit is just a checkup, nothing scary." },
      { question: "Do you do payment plans for big treatments?", answer: "Yes — for larger treatments we offer interest-free payment plans. We can go through the options at your consultation." },
    ],
    escalationRules: "If caller is describing severe dental pain keeping them awake → prioritise for same-day or next morning appointment.\nIf caller describes facial swelling, difficulty swallowing, or fever alongside dental pain → advise them to go to hospital emergency immediately. This may be a spreading dental abscess.\nIf caller is in significant distress → transfer to a senior receptionist or dentist immediately.",
    videoUrl: null,
  },

  medispa: {
    label: "Medi-Spa & Beauty",
    emoji: "💆",
    color: "#ec4899",
    recommendedVoiceId: "cvpTJfe9LINpHIOmB2Hp",
    recommendedVoiceName: "Charlotte (Warm)",
    greetingTemplate: "{{businessName}}, hi — how can I help you today?",
    services: [
      { name: "Anti-Wrinkle Consultations", category: "Injectables", description: "First-time and returning patients", priceRange: "$150–$750" },
      { name: "Dermal Filler", category: "Injectables", description: "Lips, cheeks, jawline, tear trough", priceRange: "$500–$1,200/ml" },
      { name: "Skin Treatments", category: "Skin", description: "Needling, LED, HydraFacial, peels", priceRange: "$80–$450" },
      { name: "Laser & IPL", category: "Laser", description: "Hair removal, pigmentation, redness", priceRange: "$80–$350/session" },
      { name: "Consultation Bookings", category: "General", description: "All new patients start with a consultation" },
    ],
    faqs: [
      { question: "I've never had anything done — where do I start?", answer: "That's totally normal — most of our clients feel that way for their first visit. We always start with a consultation so you know exactly what we'd recommend and why. Nothing happens on the day unless you're completely comfortable." },
      { question: "Is there downtime? I've got an event coming up.", answer: "For anti-wrinkle — basically none. For filler there can be some swelling and bruising for a few days. We'd always recommend at least 2 weeks before a big event. When's the date?" },
      { question: "Will I look overdone?", answer: "Our approach is always conservative, especially for a first treatment. You can always add more at the touch-up — but you can't take it away. The goal is for people to not even notice you've had anything done." },
      { question: "Are you a registered nurse? Who does the injecting?", answer: "All our injectors are registered nurses or cosmetic doctors — we can confirm who you'll be seeing when you book. You can also check credentials on the AHPRA website." },
      { question: "How much is anti-wrinkle / lip filler?", answer: "Anti-wrinkle starts from $[X] per area. Lip filler is from $[X] per ml. The exact amount depends on what you need — which is why we do a consultation first. Want to book one in?" },
    ],
    escalationRules: "If a patient reports a reaction, swelling beyond normal, or skin blanching after treatment → transfer to the treating practitioner immediately. This is a potential vascular occlusion — treat as urgent.\nIf a patient is asking about dissolving filler from another clinic that went wrong → transfer to the nurse or doctor immediately.\nIf a patient becomes distressed during a consultation about body image → end the clinical conversation and transfer to a practitioner or the clinic owner.",
    videoUrl: null,
  },

  mechanic: {
    label: "Mechanic & Automotive",
    emoji: "🔩",
    color: "#64748b",
    recommendedVoiceId: "IKne3meq5aSn9XLyUdCD",
    recommendedVoiceName: "Charlie",
    greetingTemplate: "{{businessName}}, hey — what's going on with the car?",
    services: [
      { name: "Log Book Service", category: "Service", description: "Manufacturer-scheduled, warranty maintained", priceRange: "$200–$500" },
      { name: "Basic Service", category: "Service", description: "Oil, filter, safety check, fluid top-up", priceRange: "$150–$280" },
      { name: "Major Service", category: "Service", description: "Full service including belts, plugs, brakes", priceRange: "$350–$600" },
      { name: "Roadworthy Certificate", category: "Compliance", description: "Pink slip (NSW) or RWC (VIC/QLD)", priceRange: "$40–$100" },
      { name: "Brake & Suspension", category: "Repairs", description: "Pads, rotors, calipers, shocks, alignment" },
      { name: "Diagnostics", category: "Diagnostics", description: "Check engine light, fault code reading", priceRange: "$80–$200" },
    ],
    faqs: [
      { question: "How much for a basic service on my car?", answer: "Depends on the car — what year and model? For most everyday cars you're looking at around $150 to $250 for a basic service." },
      { question: "Do I have to go to the dealer to keep my warranty?", answer: "Nah — that's a common one. You can use any licensed mechanic for log book servicing and keep your warranty. We stamp the logbook." },
      { question: "Will you call me if there's extra work needed?", answer: "Always — we never proceed on anything extra without your go-ahead first. You'll always know the price before we touch it." },
      { question: "My check engine light is on.", answer: "Most of the time it's not as dramatic as it sounds — usually a sensor or emissions fault. Bring it in and we'll scan the code. What make and model is it?" },
      { question: "Can I drop it off in the morning and pick it up this afternoon?", answer: "Usually yes — for a basic service we're usually done same day. What did you need in?" },
    ],
    escalationRules: "If caller describes brakes grinding (metal on metal) → flag as urgent safety issue. Advise them to minimise driving until inspected. Book within 24 hours.\nIf caller says the car is unsafe to drive → offer to arrange towing to the workshop.\nIf caller has been quoted a very large amount elsewhere and wants a second opinion → transfer to the senior mechanic or owner.",
    videoUrl: null,
  },

  physio: {
    label: "Physio & Allied Health",
    emoji: "🏃",
    color: "#84cc16",
    recommendedVoiceId: "56bWURjYFHyYyVf490Dp",
    recommendedVoiceName: "Emma",
    greetingTemplate: "{{businessName}}, hi — how can I help?",
    services: [
      { name: "Initial Consultation", category: "Bookings", description: "New patient assessment and treatment plan", priceRange: "$130–$200" },
      { name: "Follow-up Appointment", category: "Bookings", description: "Returning patient treatments", priceRange: "$90–$160" },
      { name: "Medicare Care Plan Sessions", category: "Billing", description: "GP referral rebated sessions, gap explained" },
      { name: "WorkCover & CTP", category: "Billing", description: "Workplace and motor vehicle injury claims" },
      { name: "NDIS Therapy", category: "Billing", description: "NDIS-funded physiotherapy sessions" },
      { name: "Clinical Pilates", category: "Group", description: "Supervised small group rehab sessions", priceRange: "$35–$80" },
    ],
    faqs: [
      { question: "Do you bulk bill?", answer: "We don't bulk bill for standard appointments, but if you have a Medicare care plan from your GP you'll get a rebate of around $60 per session. Our fee is $[X] so the gap is about $[Y]. We process it on the spot." },
      { question: "I've got a care plan from my GP — does that mean it's free?", answer: "Not quite — the care plan gives you a Medicare rebate of about $60 per session. We charge $[X] so there's a gap of $[Y]. Bring the referral and we'll process it on the day." },
      { question: "Do I need a referral?", answer: "Not to book with us — you can come straight in. But if you want the Medicare rebate you'll need to see your GP first and get a care plan. Do you already have one?" },
      { question: "How many sessions will I need?", answer: "Honestly depends on what's going on. For something like a mild muscle strain, 3 to 4 sessions is often enough. For more chronic issues it can take longer. The physio will give you a better idea after the first assessment." },
      { question: "I'm on WorkCover — do you see WorkCover patients?", answer: "Yes, we do. We'll need your claim number and the insurer's name before we book. Can you grab those details?" },
    ],
    escalationRules: "If caller is describing symptoms of serious spinal injury, nerve compression with limb weakness, or post-surgical complication → advise them to see their GP or go to emergency before booking physio.\nIf caller is in severe acute pain → transfer to the physio to triage on the spot rather than booking a standard appointment.\nIf caller is an NDIS participant with a complex support need → transfer to the NDIS-trained practitioner.",
    videoUrl: null,
  },

  accounting: {
    label: "Accounting & Bookkeeping",
    emoji: "📊",
    color: "#8b5cf6",
    recommendedVoiceId: "gEdKKVxVhNCulBgRQ9GW",
    recommendedVoiceName: "Charlotte (Pro)",
    greetingTemplate: "{{businessName}}, hi — how can I help you today?",
    services: [
      { name: "Tax Returns", category: "Tax", description: "Individual, sole trader, company, trust" },
      { name: "BAS Lodgement", category: "Compliance", description: "Quarterly BAS preparation and lodgement" },
      { name: "Bookkeeping", category: "Ongoing", description: "Xero, MYOB, QuickBooks — weekly or monthly" },
      { name: "EOFY Planning", category: "Advisory", description: "Tax minimisation strategies before June 30" },
      { name: "New Business Setup", category: "Advisory", description: "Structure, ABN, GST, registrations" },
      { name: "ATO Debt and Disputes", category: "Urgent", description: "ATO letters, payment plans, audits" },
    ],
    faqs: [
      { question: "I've received a letter from the ATO — what do I do?", answer: "Bring it in or email it to us right now. Most ATO letters have specific deadlines — some as short as 28 days. We'll look at it before you do anything else." },
      { question: "I missed a BAS — how bad is it?", answer: "Don't panic — the ATO has a failure to lodge penalty but it can often be reduced or waived if you lodge as soon as possible. Let me get you booked in urgently and we'll sort it out." },
      { question: "Do you do individual tax returns?", answer: "Yes — personal returns, sole trader, company, and trust. What's your situation — PAYG or do you run your own business?" },
      { question: "Is it better to be a sole trader or a company?", answer: "Depends on your income and circumstances — there's no single right answer. Worth 30 minutes to get the structure right from the start. When can you come in?" },
      { question: "I need my tax done before June 30.", answer: "Actually your return for this financial year isn't due until October 31 — or May next year if you're lodging through a tax agent. But if you want to get started now, let's get you booked in." },
    ],
    escalationRules: "If caller has received an ATO audit notice → transfer to a senior accountant immediately. Do not take a message for callback.\nIf caller owes a large amount to the ATO and is distressed → transfer immediately — do not advise on payment plans without an accountant present.\nIf caller has a query requiring legal advice → explain that is outside accounting scope and recommend a solicitor. Do not attempt to advise.",
    videoUrl: null,
  },

  cleaning: {
    label: "Cleaning Services",
    emoji: "🧹",
    color: "#14b8a6",
    recommendedVoiceId: "56bWURjYFHyYyVf490Dp",
    recommendedVoiceName: "Emma",
    greetingTemplate: "{{businessName}}, hey — how can I help?",
    services: [
      { name: "Bond / End of Lease Clean", category: "Bond", description: "Full exit clean, re-clean guarantee", priceRange: "$300–$1,200" },
      { name: "Regular Domestic Clean", category: "Regular", description: "Fortnightly or weekly home cleaning", priceRange: "$100–$260" },
      { name: "One-Off Deep Clean", category: "Once-off", description: "Spring clean, pre-sale, post-reno" },
      { name: "Airbnb Turnover Clean", category: "Short-term", description: "Between-guest service with linen" },
      { name: "Post-Construction Clean", category: "Specialist", description: "Dust, debris, paint removal after reno" },
    ],
    faqs: [
      { question: "How much for a bond clean on a [X]-bedroom house?", answer: "For a standard [X]-bed you're usually looking at $[X] to $[X] depending on condition. Does it have a garage? Are you after carpets steam-cleaned as well?" },
      { question: "Does the bond clean come with a guarantee?", answer: "We guarantee the clean — if the real estate agent finds anything in our scope on the exit inspection, we'll come back at no charge within 48 hours. We can't guarantee the bond itself — that's the agent's decision." },
      { question: "Do I need to be home?", answer: "Not for regular cleans — most clients give us a key or an access code. We'll send you a text when we're done." },
      { question: "Can I have the same cleaner each time?", answer: "Yes — we aim to match you with a regular cleaner once you've been set up. It usually takes 2 to 3 visits to find the right fit." },
      { question: "What's included in the bond clean — does it include the oven?", answer: "The oven is included in our bond clean checklist. We work off the real estate exit checklist so nothing gets missed." },
    ],
    escalationRules: "If a customer calls to report damage to their property during a clean → transfer to the business owner immediately. Document everything.\nIf a bond clean has been rejected by the real estate agent → transfer to the operations manager immediately — re-clean needs to be booked within 48 hours.\nIf a customer is distressed or threatening a payment dispute → transfer to the owner. Do not attempt to resolve on the phone.",
    videoUrl: null,
  },

  pest: {
    label: "Pest Control",
    emoji: "🐛",
    color: "#a16207",
    recommendedVoiceId: "IKne3meq5aSn9XLyUdCD",
    recommendedVoiceName: "Charlie",
    greetingTemplate: "{{businessName}}, hey — what are you dealing with?",
    services: [
      { name: "General Pest Treatment", category: "General", description: "Cockroaches, ants, spiders, silverfish", priceRange: "$200–$400" },
      { name: "Termite Inspection", category: "Termite", description: "Visual and thermal imaging inspection", priceRange: "$250–$600" },
      { name: "Termite Barrier", category: "Termite", description: "Chemical barrier installation and monitoring", priceRange: "$3,000–$8,000" },
      { name: "Rodent Control", category: "Rodent", description: "Rats and mice — baiting, exclusion, proofing", priceRange: "$250–$500" },
      { name: "Pre-Purchase Inspection", category: "Inspection", description: "Building and pest before property settlement", priceRange: "$400–$800" },
      { name: "Bed Bugs & Fleas", category: "Specialist", description: "Full treatment with follow-up", priceRange: "$200–$1,500" },
    ],
    faqs: [
      { question: "I've got cockroaches — can you come quickly?", answer: "We can usually get someone there within 24 to 48 hours. Are they mostly in the kitchen? And have you seen them during the day as well as night? That tells us which species we're dealing with." },
      { question: "I saw flying white ants — is that serious?", answer: "Could be — swarming termites is worth investigating quickly. Can you describe where you saw them? Inside or outside? We should get an inspection done this week." },
      { question: "I had it treated 2 weeks ago and they're still there.", answer: "That can happen — some species need a few weeks for the full effect. If numbers haven't dropped at all though, it's worth us coming back for another look. Is this within your warranty period?" },
      { question: "I've got a possum in the roof.", answer: "Possums are protected wildlife — we can't legally remove them, that's a job for a licensed wildlife handler or your council. What we can do is seal the entry points once it's gone so it can't come back." },
      { question: "How long before I can use the house after treatment?", answer: "Usually 2 to 4 hours once the treatment dries. We'll confirm the exact re-entry time when we're on site. You'll need to cover fish tanks and remove pets during the treatment." },
    ],
    escalationRules: "If caller mentions a child or pet has ingested bait or been exposed to chemicals → advise them to call Poison Information 13 11 26 immediately.\nIf caller has found active termites in a structural or load-bearing area → treat as urgent. Book within 24 hours.\nIf caller is a commercial food premises with a cockroach complaint → transfer to the commercial operator. This is a health department compliance issue.",
    videoUrl: null,
  },

  landscaping: {
    label: "Landscaping & Gardens",
    emoji: "🌿",
    color: "#22c55e",
    recommendedVoiceId: "IKne3meq5aSn9XLyUdCD",
    recommendedVoiceName: "Charlie",
    greetingTemplate: "{{businessName}}, hey — what can I help you with?",
    services: [
      { name: "Lawn Mowing", category: "Maintenance", description: "Regular mowing, edging, blowing", priceRange: "$60–$250" },
      { name: "Garden Maintenance", category: "Maintenance", description: "Weeding, pruning, mulching, hedges", priceRange: "$60–$120/hr" },
      { name: "Turf Supply & Lay", category: "Landscaping", description: "All varieties, ground prep included", priceRange: "$20–$45/m²" },
      { name: "Landscaping Design & Build", category: "Landscaping", description: "Patios, retaining walls, paving" },
      { name: "Garden Clean-Up", category: "Once-off", description: "Overgrown or neglected gardens" },
      { name: "Irrigation Systems", category: "Landscaping", description: "Design, install, repair", priceRange: "$1,500–$5,000" },
    ],
    faqs: [
      { question: "How much to mow my lawn?", answer: "Depends on the size — roughly how big is the block? For an average suburban backyard front and back you're usually looking at $[X] to $[X] including edging." },
      { question: "Does the quote include taking the green waste away?", answer: "Worth confirming upfront — green waste removal is often quoted separately. Do you want it included? I'll make sure it's clear on the quote." },
      { question: "Can you give me a rough price for laying turf?", answer: "For supply and lay you're usually looking at $25 to $45 per square metre. Ground prep is often extra depending on the condition. What's the approximate area?" },
      { question: "Do you need to come out to quote or can you do it from photos?", answer: "For maintenance work we can often work from photos and a description. For paving, retaining walls, or full landscaping we really need to see the site — it's usually a 20-minute visit and saves surprises on both sides." },
      { question: "How long before the lawn is established after laying turf?", answer: "Most varieties you're walking on it comfortably within 4 to 6 weeks. The first 2 weeks of watering is critical — we'll leave you with full care instructions." },
    ],
    escalationRules: "If caller wants to remove a large tree → confirm whether it is council-regulated before proceeding. Do not quote tree removal without knowing the permit situation.\nIf caller is a property developer or building company with a large commercial project → transfer to the business owner.\nIf caller reports damage to their property during a job → transfer to the owner immediately.",
    videoUrl: null,
  },

}
