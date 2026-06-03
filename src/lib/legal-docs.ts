// Legal document content used by the onboarding T&C step, the standalone
// /accept-terms page, and the API route that records acceptance. Versions
// are bumped when text changes, which forces re-acceptance on next login.

export const TOS_VERSION = 'v3.0-2026-06'
export const PRIVACY_VERSION = 'v3.0-2026-06'
export const DPA_VERSION = 'v2.0-2026-06'

// TalkMate's own ABN. Set to "TBC" until business registration completes —
// then update this single constant and it propagates through every legal doc.
// Bumping the value alone does NOT change the document version, since the
// legal substance has not changed; bump the version only when policy text
// materially changes.
export const TALKMATE_ABN = 'TBC'

export type DocumentType = 'terms_of_service' | 'privacy_policy' | 'data_processing_agreement'

export interface LegalDoc {
  id: DocumentType
  title: string
  version: string
  acceptanceLabel: string
  body: string
}

export const TERMS_OF_SERVICE: LegalDoc = {
  id: 'terms_of_service',
  title: 'Terms of Service',
  version: TOS_VERSION,
  acceptanceLabel: 'I have read and agree to the TalkMate Terms of Service',
  body: `TALKMATE TERMS OF SERVICE
Version 3.0, June 2026

1. INTRODUCTION
These Terms of Service govern your use of the TalkMate platform operated by TalkMate Pty Ltd (ABN ${TALKMATE_ABN}), a company registered in Queensland, Australia. By completing the onboarding process and activating your TalkMate account you agree to be bound by these terms.

2. THE SERVICE
TalkMate provides AI-powered voice agent services, business communication tools, and related software (the Service). The Service includes the TalkMate Voice Agent, TalkMate Command, the TalkMate client portal, and any related features including Social DM Nurture where applicable to your plan.

3. SUBSCRIPTION AND PAYMENT
3.1 The Service is provided on a monthly subscription basis at the rates displayed at talkmate.com.au/pricing at the time of subscription.
3.2 Subscriptions are billed monthly in advance. Payment is processed by Stripe.
3.3 There are no setup fees on any plan.
3.4 You may cancel your subscription at any time from your portal settings. Cancellation takes effect at the end of the current billing period.
3.5 TalkMate reserves the right to change subscription pricing with 30 days written notice to existing subscribers.

4. MONEY-BACK GUARANTEE
4.1 If TalkMate is not working for your business within the first 14 days of your agent going live, contact us at hello@talkmate.com.au for a full refund of your first month's subscription.
4.2 The guarantee applies once per business. It does not apply to account reactivations.

5. YOUR RESPONSIBILITIES
5.1 You are responsible for ensuring your use of TalkMate complies with all applicable Australian laws.
5.2 You are responsible for informing your callers that calls may be recorded. TalkMate recommends enabling the call recording disclosure feature in your agent settings.
5.3 You are responsible for ensuring your customers are aware of how their data is handled, in accordance with the Australian Privacy Act 1988.
5.4 You must not use TalkMate for any unlawful purpose or in any way that could damage, disable, or impair the Service.

6. CALL RECORDING AND TRANSCRIPTION
6.1 Calls answered by TalkMate are recorded and transcribed for the purpose of providing the Service.
6.2 Call recordings and transcripts are stored on Australian servers.
6.3 You can configure TalkMate to include a recording disclosure at the start of every call from your agent settings. TalkMate recommends this be enabled.
6.4 Call recordings are retained for 90 days by default. You can adjust this in your account settings.

7. INTELLECTUAL PROPERTY
7.1 TalkMate retains ownership of all intellectual property in the TalkMate platform, software, and technology.
7.2 You retain ownership of all data you provide to TalkMate and all contact data collected through your use of the Service.

8. LIMITATION OF LIABILITY
8.1 TalkMate is not liable for any indirect, incidental, or consequential losses arising from your use of the Service.
8.2 TalkMate's total liability to you for any claim arising under these terms is limited to the amount you paid for the Service in the 3 months preceding the claim.
8.3 TalkMate does not guarantee that the Service will be available at all times. Planned maintenance and unexpected outages may occur.

9. TERMINATION
9.1 TalkMate may suspend or terminate your account if you breach these terms.
9.2 On termination you may export your contact data within 30 days. After 30 days data will be deleted.

10. SOCIAL MEDIA INTEGRATION
10.1 Where your subscription plan includes Social DM Nurture, TalkMate will connect to your Instagram Business Account and Facebook Business Page using official Meta Platforms APIs on your behalf.
10.2 By connecting your Instagram or Facebook accounts you authorise TalkMate to receive and send messages through those accounts for the purpose of providing the Social DM Nurture service.
10.3 You are responsible for ensuring your use of TalkMate's Social DM Nurture feature complies with Meta's Terms of Service and Platform Policies. TalkMate's access operates within the permissions you grant and within the constraints of Meta's Messaging Platform rules, including the 24-hour messaging window.
10.4 TalkMate responds only to messages that are first initiated by the lead contacting your account. TalkMate does not send unsolicited messages to any individual.
10.5 You acknowledge that Meta may change their API policies, features, or rate limits at any time. TalkMate will use reasonable efforts to adapt to such changes and will notify you if they materially affect the Social DM Nurture service. TalkMate is not liable for service interruptions caused by changes to Meta's platform or API policies.
10.6 You may disconnect your Instagram or Facebook accounts at any time from your portal settings. On disconnection TalkMate will immediately cease processing messages from those accounts.
10.7 Message content received and sent through Social DM Nurture is stored on Australian servers. See the Privacy Policy for data retention details.

11. GOVERNING LAW
These terms are governed by the laws of Queensland, Australia.

12. CONTACT
TalkMate Pty Ltd
hello@talkmate.com.au
talkmate.com.au
Gold Coast, Queensland, Australia`,
}

export const PRIVACY_POLICY: LegalDoc = {
  id: 'privacy_policy',
  title: 'Privacy Policy',
  version: PRIVACY_VERSION,
  acceptanceLabel: 'I have read and agree to the TalkMate Privacy Policy',
  body: `TALKMATE PRIVACY POLICY
Version 3.0, June 2026

1. INTRODUCTION
TalkMate Pty Ltd is committed to protecting personal information in accordance with the Australian Privacy Act 1988. This policy explains how we collect, use, store, and disclose personal information.

2. INFORMATION WE COLLECT ABOUT YOU (THE BUSINESS OWNER)
2.1 Account information: your name, business name, email address, phone number, and billing details when you create an account.
2.2 Usage data: how you use the TalkMate portal, which features you access, and when.
2.3 Payment information: processed and stored by Stripe. TalkMate does not store credit card numbers.

3. INFORMATION WE PROCESS ON YOUR BEHALF (CALLER DATA)
3.1 When your customers call your TalkMate-powered number, we process their call on your behalf.
3.2 This may include their phone number, name if provided during the call, the content of their conversation with TalkMate, and any details they provide such as addresses, preferences, or enquiry details.
3.3 This data belongs to you. You are the data controller. TalkMate is the data processor. See our Data Processing Agreement for full details.
3.4 We do not use your customers' data for any purpose other than providing the TalkMate service to you.

4. SOCIAL MEDIA MESSAGE DATA
4.1 Where your subscription plan includes Social DM Nurture and you have connected your Instagram Business Account or Facebook Business Page, TalkMate receives and stores direct message conversations sent to those accounts.
4.2 Data collected from social media messages may include: the sender's Meta user ID, name, username or handle, profile picture URL, message content, media attachments (images, audio, files), and message timestamps.
4.3 This data is collected on your behalf and belongs to you. You are the data controller. TalkMate processes it only to provide the Social DM Nurture service.
4.4 Social media message data is stored on servers located in Australia (Supabase, AWS ap-southeast-2, Sydney).
4.5 TalkMate uses social message content to generate AI responses to leads on your behalf, to create and update contact records in your TalkMate CRM, and to provide you with conversation analytics in your portal.
4.6 Social media message data is retained for 12 months from the date of the conversation. After 12 months it is automatically deleted by TalkMate's data retention process.
4.7 You may request deletion of your social media message data at any time by contacting hello@talkmate.com.au.
4.8 You are responsible for ensuring that your use of automated responses via TalkMate's Social DM Nurture feature complies with Meta's Messaging Platform Policies and any applicable Australian laws regarding automated communications.

5. HOW WE USE YOUR INFORMATION
5.1 To provide and improve the TalkMate service.
5.2 To process your subscription payments.
5.3 To send you service-related communications including usage alerts and product updates.
5.4 To provide customer support.

6. DATA STORAGE AND SECURITY
6.1 All data is stored on servers located in Australia.
6.2 Data is encrypted in transit using TLS and at rest.
6.3 Access to your data is restricted to TalkMate staff who need it to provide support.
6.4 Social media platform access tokens are encrypted using AES-256-GCM encryption and are never logged or exposed in plaintext.

7. DATA RETENTION
7.1 Your account data is retained for the duration of your subscription and deleted within 30 days of account closure on request.
7.2 Call recordings are retained for 90 days by default. Adjustable in account settings.
7.3 Contact records and call transcripts are retained for the duration of your subscription.
7.4 Social media message data is retained for 12 months and then automatically deleted.

8. YOUR RIGHTS
8.1 You have the right to access the personal information TalkMate holds about you.
8.2 You have the right to request correction of inaccurate information.
8.3 You have the right to request deletion of your data subject to legal retention requirements.
8.4 You can export all your contact data at any time from your portal settings.
8.5 To exercise these rights contact hello@talkmate.com.au.

9. THIRD PARTY SERVICES
TalkMate uses the following third party services to provide the platform:
- Vapi: voice AI infrastructure (USA, data processing agreement in place)
- ElevenLabs: voice synthesis (USA, data processing agreement in place)
- Supabase: database hosting (AWS ap-southeast-2, Sydney)
- Stripe: payment processing (USA, PCI DSS compliant)
- Vercel: application hosting (USA, data processing agreement in place)
- Make.com: workflow automation (EU, data processing agreement in place)
- Meta Platforms Inc.: Instagram and Facebook messaging APIs for Social DM Nurture (USA, data processing agreement in place — applies to Elite and Social plan subscribers only)

10. COMPLAINTS
If you have a privacy concern contact hello@talkmate.com.au. If we cannot resolve your concern you may contact the Office of the Australian Information Commissioner at oaic.gov.au.

11. CHANGES TO THIS POLICY
We will notify you of material changes to this policy by email and by notice in your portal. Continued use of the Service after notification constitutes acceptance.`,
}

export const DPA: LegalDoc = {
  id: 'data_processing_agreement',
  title: 'Data Processing Agreement',
  version: DPA_VERSION,
  acceptanceLabel:
    'I understand that TalkMate will process caller and lead data on my behalf and I confirm that I have appropriate privacy disclosures in place with my customers',
  body: `TALKMATE DATA PROCESSING AGREEMENT
Version 2.0, June 2026

This Data Processing Agreement forms part of the TalkMate Terms of Service and governs the processing of personal data by TalkMate on behalf of the client.

1. DEFINITIONS
"Client" means the business subscribing to TalkMate.
"Caller Data" means personal information of individuals who call the Client's TalkMate-powered phone number.
"Social Message Data" means personal information of individuals who send direct messages to the Client's connected Instagram Business Account or Facebook Business Page, including sender identity, message content, and message metadata.
"Processing" means any operation performed on Caller Data or Social Message Data including collection, recording, storage, analysis, and deletion.

2. ROLES
2.1 The Client is the data controller for all Caller Data and Social Message Data. The Client determines why and how this data is collected.
2.2 TalkMate is the data processor. TalkMate processes Caller Data and Social Message Data only on the Client's instructions and for the purpose of providing the TalkMate service.

3. CLIENT OBLIGATIONS
3.1 The Client warrants that they have a lawful basis for collecting Caller Data and Social Message Data under the Australian Privacy Act 1988.
3.2 The Client warrants that their privacy policy or customer disclosures inform callers and leads that their calls may be recorded, their messages may be processed by AI, and their details may be stored.
3.3 The Client is responsible for responding to any requests from their callers or leads regarding their personal information.
3.4 The Client warrants that they have the legal right to connect their Instagram Business Account and Facebook Business Page to TalkMate and that such connection complies with Meta's Terms of Service.

4. TALKMATE OBLIGATIONS
4.1 TalkMate will process Caller Data and Social Message Data only on the Client's documented instructions.
4.2 TalkMate will not sell, share, or use Caller Data or Social Message Data for any purpose other than providing the Service.
4.3 TalkMate will implement appropriate technical and organisational measures to protect Caller Data and Social Message Data.
4.4 TalkMate will notify the Client within 72 hours of becoming aware of a data breach affecting Caller Data or Social Message Data.
4.5 TalkMate will delete or return all Caller Data and Social Message Data on termination of the Service at the Client's request.

5. DATA EXPORTS
5.1 The Client may export all their Caller Data and contact records at any time from the portal settings.
5.2 Social Message Data can be exported by contacting hello@talkmate.com.au.
5.3 On account termination the Client has 30 days to export their data before it is deleted.

6. SOCIAL MEDIA DATA
6.1 Where the Client's subscription plan includes Social DM Nurture and the Client has connected their Instagram Business Account or Facebook Business Page, TalkMate will process Social Message Data for the purpose of generating AI responses to leads on the Client's behalf.
6.2 Social Message Data is stored on Australian servers and retained for 12 months from the date of the conversation.
6.3 Access tokens for the Client's connected social media accounts are encrypted using AES-256-GCM encryption and are never stored in plaintext. They are accessible only to TalkMate's server-side systems for the purpose of sending and receiving messages.
6.4 TalkMate's processing of Social Message Data is contingent on Meta Platforms Inc.'s API availability and policies. TalkMate acts as a data processor and Meta acts as a separate data controller for data within their platform. The Client's use of the Social DM Nurture feature is also subject to Meta's own data processing terms.
6.5 On disconnection of the Client's social media accounts from TalkMate, TalkMate will cease processing new Social Message Data from those accounts. Historical Social Message Data will be retained for the remainder of the 12-month retention period unless the Client requests earlier deletion.

7. SUB-PROCESSORS
TalkMate uses sub-processors as listed in the Privacy Policy, including Meta Platforms Inc. for Social DM Nurture functionality. TalkMate remains responsible for sub-processor compliance with this agreement.

8. GOVERNING LAW
This agreement is governed by the laws of Queensland, Australia.`,
}

export const ALL_LEGAL_DOCS: LegalDoc[] = [TERMS_OF_SERVICE, PRIVACY_POLICY, DPA]

// What versions does the requesting user currently need to accept?
// Returns the doc IDs that don't have a matching version on the businesses row.
export function pendingDocsForBusiness(biz: {
  tos_accepted_version?: string | null
  privacy_accepted_version?: string | null
  dpa_accepted_version?: string | null
}): DocumentType[] {
  const out: DocumentType[] = []
  if (biz.tos_accepted_version !== TOS_VERSION) out.push('terms_of_service')
  if (biz.privacy_accepted_version !== PRIVACY_VERSION) out.push('privacy_policy')
  if (biz.dpa_accepted_version !== DPA_VERSION) out.push('data_processing_agreement')
  return out
}
