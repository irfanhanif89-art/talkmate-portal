export interface ContentBlock {
  type: 'paragraph' | 'bullets' | 'callout' | 'tip' | 'heading' | 'plan-card';
  content?: string;
  items?: string[];
  plans?: PlanCard[];
}

export interface PlanCard {
  name: string;
  price: string;
  setup?: string;
  tagline: string;
  features: string[];
  highlight: boolean;
}

export interface TrainingModule {
  id: number;
  title: string;
  subtitle: string;
  duration: string;
  blocks: ContentBlock[];
}

export const trainingModules: TrainingModule[] = [
  {
    id: 1,
    title: "What is TalkMate?",
    subtitle: "The product in plain English",
    duration: "5 min",
    blocks: [
      {
        type: "paragraph",
        content: "TalkMate is an AI receptionist that answers every phone call for a small business. 24 hours a day, 7 days a week, instantly, in an Australian voice."
      },
      {
        type: "paragraph",
        content: "When a customer calls a TalkMate business, the AI receptionist answers within 2 seconds. It greets the caller, answers their questions, books jobs, takes orders, sends SMS confirmations, and transfers to the owner when needed. The owner does not have to pick up the phone."
      },
      {
        type: "heading",
        content: "What it does on a call"
      },
      {
        type: "bullets",
        items: [
          "Answers every call in under 2 seconds, 24/7",
          "Greets the caller by business name in a professional Australian voice",
          "Answers FAQs based on the business's specific information",
          "Books appointments and jobs",
          "Takes orders",
          "Sends an SMS confirmation to the caller after the call",
          "Transfers to the owner or takes a message when the call needs a human"
        ]
      },
      {
        type: "heading",
        content: "What makes it different"
      },
      {
        type: "bullets",
        items: [
          "It is always available. A human receptionist works 8 hours a day. TalkMate works 24.",
          "It never misses a call. No sick days, no lunch breaks, no busy signals.",
          "It is configured specifically for each business before it goes live.",
          "The owner stays in control through a portal where they can see every call, recording, and transcript."
        ]
      },
      {
        type: "callout",
        content: "Always call it an AI receptionist. Never say AI voice agent, AI bot, chatbot, or voice AI. The product is called TalkMate and it is an AI receptionist."
      }
    ]
  },
  {
    id: 2,
    title: "How it Works",
    subtitle: "From sign-up to live call",
    duration: "5 min",
    blocks: [
      {
        type: "paragraph",
        content: "Here is what happens when a business signs up for TalkMate and what their experience looks like from day one."
      },
      {
        type: "heading",
        content: "Onboarding"
      },
      {
        type: "bullets",
        items: [
          "The business signs up and gets access to the TalkMate portal",
          "They fill in their business details: services, hours, FAQs, how they want calls handled",
          "The TalkMate team configures their AI receptionist based on that information",
          "A dedicated phone number is assigned to their business",
          "They either divert their existing number to TalkMate, or use the TalkMate number directly",
          "The AI receptionist goes live"
        ]
      },
      {
        type: "heading",
        content: "What a caller experiences"
      },
      {
        type: "bullets",
        items: [
          "They call the business number",
          "TalkMate answers within 2 seconds in a professional Australian voice",
          "The AI greets them with the business name",
          "It handles their request: answers a question, books a job, takes an order, or transfers the call",
          "If a booking or order is taken, the caller receives an SMS confirmation",
          "The whole interaction is logged and visible to the business owner in the portal"
        ]
      },
      {
        type: "heading",
        content: "What the business owner sees"
      },
      {
        type: "bullets",
        items: [
          "A portal at app.talkmate.com.au",
          "Every call logged with date, time, duration, and outcome",
          "Full call recordings they can listen to",
          "Transcripts of every conversation",
          "SMS activity showing what was sent to callers",
          "An ROI Dashboard showing the estimated value TalkMate has recovered that month",
          "The ability to update their AI receptionist settings and knowledge base at any time"
        ]
      },
      {
        type: "tip",
        content: "Growth and Pro plan clients also get TalkMate Command, which lets the owner control their AI receptionist via Telegram or WhatsApp. They can update availability, change greetings, and manage their agent from their phone without logging into the portal."
      }
    ]
  },
  {
    id: 3,
    title: "Who it is For",
    subtitle: "The businesses that need this most",
    duration: "5 min",
    blocks: [
      {
        type: "paragraph",
        content: "TalkMate is built for Australian small businesses that take phone calls to run their business. If the phone goes unanswered, they lose money."
      },
      {
        type: "heading",
        content: "Industries TalkMate serves"
      },
      {
        type: "bullets",
        items: [
          "Towing and roadside recovery",
          "Restaurants and takeaway",
          "Trades: plumbing, electrical, HVAC, building",
          "Real estate agencies",
          "Medical, dental, and allied health",
          "Auto mechanics and smash repairers",
          "Beauty salons and hair studios",
          "Gyms and fitness studios",
          "NDIS providers",
          "Retail businesses",
          "Accounting, legal, and professional services"
        ]
      },
      {
        type: "heading",
        content: "The ideal business profile"
      },
      {
        type: "bullets",
        items: [
          "1 to 15 staff",
          "Owner-operated or owner-managed",
          "Takes calls to book jobs, take orders, or answer enquiries",
          "Misses calls during busy periods or after hours",
          "Does not have a full-time dedicated receptionist"
        ]
      },
      {
        type: "heading",
        content: "Not a good fit"
      },
      {
        type: "bullets",
        items: [
          "Large enterprises with existing call centres",
          "Businesses that receive almost no phone calls",
          "Businesses that require highly complex multi-step call handling beyond the current plan"
        ]
      },
      {
        type: "tip",
        content: "The strongest use case is any business where the owner is physically doing the work and cannot always answer the phone. A plumber on a job, a tow truck driver on a call, a restaurant owner during a service rush. Those are the people TalkMate was built for."
      }
    ]
  },
  {
    id: 4,
    title: "Plans and Pricing",
    subtitle: "What you are selling and what each plan includes",
    duration: "8 min",
    blocks: [
      {
        type: "paragraph",
        content: "TalkMate has three plans, each with a one-off setup fee. No lock-in contracts. 14-day money-back guarantee."
      },
      {
        type: "plan-card",
        plans: [
          {
            name: "Starter",
            price: "$299/mo",
            setup: "+ $299 one-off setup fee",
            tagline: "For solo operators and small businesses",
            highlight: false,
            features: [
              "AI receptionist answers every call, 24/7",
              "Books jobs, takes orders, answers FAQs",
              "SMS confirmation sent to every caller",
              "Missed-call win-back SMS (automatic)",
              "Google review follow-up SMS",
              "Train TalkMate knowledge base",
              "Full call log, recordings, and transcripts",
              "Up to 300 calls per month"
            ]
          },
          {
            name: "Growth",
            price: "$499/mo",
            setup: "+ $349 one-off setup fee",
            tagline: "Most popular. For growing businesses.",
            highlight: true,
            features: [
              "Everything in Starter",
              "Two-way SMS Inbox (send and receive SMS with customers)",
              "AI Website Chatbot (embeddable on their website)",
              "TalkMate Command (control agent via Telegram or WhatsApp)",
              "Advanced call flows and routing",
              "Up to 800 calls per month"
            ]
          },
          {
            name: "Pro",
            price: "$799/mo",
            setup: "+ $399 one-off setup fee",
            tagline: "For multi-location and high-volume operators",
            highlight: false,
            features: [
              "Everything in Growth",
              "Up to 3 business locations",
              "Unlimited commands",
              "Dedicated support",
              "Unlimited calls"
            ]
          }
        ]
      },
      {
        type: "heading",
        content: "The cost comparison"
      },
      {
        type: "bullets",
        items: [
          "Full-time receptionist: $55,000 to $65,000 per year in salary alone, plus super and entitlements",
          "TalkMate Starter: $3,588 per year",
          "TalkMate Growth: $5,988 per year",
          "TalkMate Pro: $9,588 per year"
        ]
      },
      {
        type: "tip",
        content: "Growth is the right default recommendation for most prospects. It includes the SMS Inbox and AI Website Chatbot, which are features business owners get genuinely excited about beyond the phone answering."
      },
      {
        type: "callout",
        content: "Every plan has a one-off setup fee: Starter $299, Growth $349, Pro $399. There is no free trial. The offer is a 14-day money-back guarantee. If a client is not satisfied within the first 14 days, they receive a full refund. Always frame it that way."
      }
    ]
  },
  {
    id: 5,
    title: "The Client Portal",
    subtitle: "What your clients log into every day",
    duration: "8 min",
    blocks: [
      {
        type: "paragraph",
        content: "Every TalkMate client gets access to a portal at app.talkmate.com.au. This is where they manage their AI receptionist, see all their calls, and use the tools that come with their plan."
      },
      {
        type: "heading",
        content: "Dashboard"
      },
      {
        type: "paragraph",
        content: "The first thing they see every day. Shows call stats, agent status, and the ROI Dashboard which estimates how much revenue TalkMate has recovered that month based on calls answered, win-backs sent, and chat leads captured."
      },
      {
        type: "heading",
        content: "Calls"
      },
      {
        type: "paragraph",
        content: "Full log of every call the AI receptionist has handled. Each entry shows the caller's number, duration, outcome, and a full transcript. The owner can listen to any call recording directly from the portal."
      },
      {
        type: "heading",
        content: "Train TalkMate (all plans)"
      },
      {
        type: "paragraph",
        content: "A knowledge base editor with six sections: FAQs, Services, Hours, Pricing, Team, and Custom. The owner fills these in and the AI receptionist uses this information on every call. When they update it, the AI is updated within minutes."
      },
      {
        type: "heading",
        content: "SMS Inbox (Growth and Pro)"
      },
      {
        type: "paragraph",
        content: "A two-way SMS inbox where the owner can see and reply to text messages from customers. Incoming SMS from callers, win-back responses, and messages the team sends all appear here in threaded conversations. The inbox has an AI Suggest feature that drafts reply options for the owner."
      },
      {
        type: "heading",
        content: "AI Website Chatbot (Growth and Pro)"
      },
      {
        type: "paragraph",
        content: "The owner can embed a chat widget on their business website. It answers visitor questions 24/7 using their knowledge base, and captures lead details automatically. The owner gets an SMS notification when a new lead comes in through the chatbot."
      },
      {
        type: "heading",
        content: "Settings and Automation"
      },
      {
        type: "paragraph",
        content: "The Settings page has an Automation tab where the owner can configure the missed-call win-back SMS and the Google review follow-up. Both are on by default for new clients. Win-back fires automatically when a short call ends without being answered. The review follow-up sends a Google review link to callers after a completed call."
      },
      {
        type: "tip",
        content: "Knowing the portal matters because your clients will ask questions like 'how do I see my calls?', 'can I reply to customers by SMS?', 'how does the chatbot work?'. Being able to describe these features accurately builds confidence before they sign."
      }
    ]
  },
  {
    id: 6,
    title: "The Rules",
    subtitle: "What to always say and what to never say",
    duration: "3 min",
    blocks: [
      {
        type: "paragraph",
        content: "These are non-negotiable. They exist to protect the brand, stay legally compliant, and make sure every client gets an accurate picture of the product."
      },
      {
        type: "callout",
        content: "Always say AI receptionist. Never say AI voice agent, AI bot, chatbot, voice AI, or virtual assistant. The product is an AI receptionist and that is the only term to use."
      },
      {
        type: "callout",
        content: "Never name the underlying technology platforms. The product is TalkMate. Clients do not need to know what runs underneath it and it should never come up in conversation."
      },
      {
        type: "callout",
        content: "Never offer or imply a free trial. The offer is a 14-day money-back guarantee. These are different things. Always use the money-back guarantee framing."
      },
      {
        type: "callout",
        content: "Never promise a feature that is not on the plan a client is signing up for. SMS Inbox and AI Website Chatbot are Growth and Pro only. Win-back and reviews are all plans. If you are unsure, check before committing."
      },
      {
        type: "callout",
        content: "Pricing is fixed. Starter $299/mo (+$299 setup), Growth $499/mo (+$349 setup), Pro $799/mo (+$399 setup). No negotiation on price. No custom deals."
      },
      {
        type: "tip",
        content: "If a prospect asks something you are not certain about, the right answer is always: 'Let me confirm that and come back to you today.' Never improvise on product details."
      }
    ]
  }
];
