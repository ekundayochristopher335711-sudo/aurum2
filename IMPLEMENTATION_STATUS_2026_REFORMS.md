# AURUM PROJECT CONTROLS — 2026 REFORM UPDATE

This package updates the existing Aurum application to the service-first business direction in the supplied 2026 reform document.

## Implemented
- Public website repositioned around outsourced estimating, quantity take-offs, tender support and commercial/QS support.
- Landing page redesigned with a cinematic construction-video hero (muted, looping, with a local poster fallback), layered contrast, responsive navigation, premium service cards with construction imagery, step-by-step workflow, illustrative deliverable previews, and repeated quote CTAs.
- Request-a-quote page redesigned to match the public brand, with a project-photo panel, clearer sections, responsive document upload cards, and improved mobile layout.
- Page title, description and social-sharing metadata updated to the service-first positioning.
- Stock photos are loaded from Unsplash; the hero video is loaded from Pexels. The hero retains a local poster image if video playback is unavailable.
- Main public navigation: Home, Services, How It Works, Pricing, Sample Deliverables, About and Contact.
- Primary conversion: Request a Quote / Send Your Drawings.
- Public quote form with name, company, email, telephone, project, location, service, tender deadline, brief and uploads for drawings, specification and BoQ.
- Quote submissions stored as Layer 1 job records.
- Automatic client acknowledgement and internal enquiry email when SMTP is configured.
- Authenticated Aurum Jobs dashboard with job status, tender deadlines, invoices and Excel sales export.
- Internal client intake fields for delivery date, required trades, requirements, missing information and notes.
- Fee proposal screen with printable proposal matching the supplied document structure.
- Automatic invoice numbering in the AUR-INV-YYYY-001 format.
- Public invoice/payment page.
- Optional Stripe Checkout integration when STRIPE_SECRET_KEY is configured.
- Payment verification after Stripe Checkout.
- Sales data export to Excel from invoice records.
- Legal-page placeholders for Privacy Notice, Cookie Notice, Terms of Use and Terms of Business.
- Existing NEC3/NEC4 project-control modules retained and left behind the authenticated platform as the future Layer 3 capability.
- Authenticated sidebar now includes Aurum Jobs alongside the existing project controls.

## Layer structure
### Layer 1 — active
Quantity take-offs, estimating, tender pricing/support, BOQ and commercial/QS support.

### Layer 2 — business expansion
Monthly commercial support, valuations, variations/change control, subcontractor comparisons, cost reporting and final accounts. The existing application can be extended here as real client work exposes recurring requirements.

### Layer 3 — future platform
Aurum software, NEC deadline management, digital registers, automated project controls and SaaS subscriptions. The existing NEC functionality has not been deleted.

## Required production configuration
Set the following in the deployment environment:
- DATABASE_URL
- DIRECT_URL
- JWT_SECRET
- CLIENT_URL
- SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
- SALES_EMAIL
- STRIPE_SECRET_KEY (optional until Stripe is ready)

Run the new Prisma migration through the existing deployment command. The migration is named `20261006090000_layer1_business`.

## Important launch note
The supplied reform document says the Privacy Notice, Cookie Notice, Terms of Use and Terms of Business will be updated and inserted. The package therefore contains clearly labelled placeholders rather than inventing legal wording. Replace them with the client's approved legal text before launch.

## Build validation
The source was updated and structurally checked. A full npm build could not be executed in this environment because the uploaded ZIP does not contain node_modules and the dependency tarballs were not available in the local npm cache. The deployment configuration already builds the client during deployment, and the new Prisma migration is included.
