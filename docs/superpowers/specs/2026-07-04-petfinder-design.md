# PetFinder — Design Spec

Date: 2026-07-04

## 1. Purpose

A web app connecting people who lost a pet with people who find one. Owners post a
"Missing" listing; finders post a "Found" listing; everyone can browse, filter, and
search by uploading a photo. Messaging and push notifications close the loop quickly,
since a missing-pet owner wants to know the moment someone might have found their pet.

## 2. Scope (MVP)

In scope:
- Simple account signup/login (email-based).
- Create a **Missing Pet** post: photo(s), species, breed, color, size, distinctive
  markings, collar (+ description), microchip status, pet name (optional), last-seen
  location + date, optional reward amount.
- Create a **Found Pet** post: same fields, minus reward and pet name.
- Browse a combined feed of Missing + Found posts, filterable by: distance from the
  searcher's live location, species, breed, color, size, collar presence, date range,
  reward present, status (active/resolved).
- **Search by photo**: upload any pet photo (no post required) and get visually-similar
  posts of the opposite type, ranked by similarity, on top of any active filters.
- In-app messaging: any user can message a post's owner from that post; replies form a
  thread; delivered live via Supabase Realtime.
- **Web push notifications**: when a user receives a new message, they get a browser
  push notification (if they've granted permission), in addition to the in-app thread
  updating live.
- Post owner can mark their post **Resolved**, removing it from default search results.

Out of scope for MVP:
- Reward payment/escrow — the reward is a displayed amount only, no in-app transaction.
- Mobile app — web only for now; mobile is a likely v2 once the web app is validated.
- Admin/moderation dashboard.
- Notifications for anything other than new messages (e.g. "new post near you").
- Photo-match results are a ranked suggestion, not a guaranteed identity confirmation —
  no automatic "this is definitely your pet" resolution.

## 3. Architecture

- **Frontend**: React (Vite). Talks directly to Supabase for auth, data, storage, and
  realtime messaging. Registers a service worker to handle Web Push permission requests
  and incoming push display.
- **Supabase**: Postgres (with the `pgvector` extension) holds all relational data —
  users, posts, photos, messages, push subscriptions. Built-in Auth handles login/signup.
  Storage holds uploaded photos. Realtime powers live message delivery in the UI.
- **Embedding service** (new component, self-hosted for now): a small standalone
  service (Python + FastAPI, open-source CLIP-style model) exposing one endpoint,
  `POST /embed`, that takes an image and returns a fixed-length vector. It is called
  from a Supabase Edge Function in two places: (1) whenever a post photo is uploaded,
  to index it, and (2) whenever a user searches by photo, to compute the query vector.
  Being isolated behind that one call site means swapping to a hosted embedding API
  (e.g. Replicate or Hugging Face Inference) later is a change to what's behind
  `/embed`, not to anything else in the app.
- **Push notifications**: the frontend requests Notification permission and registers
  a Web Push subscription (VAPID keys), stored in `push_subscriptions`. A Supabase
  Database Webhook fires on every insert into `messages`; the triggered Edge Function
  sends a Web Push notification to the recipient's stored subscription(s).

## 4. Data model

**users**
- id, email, display_name, created_at
- (No stored home/default location — distance search always uses the browser's live
  geolocation at the time of searching, not a saved profile location.)

**posts**
- id, owner_id, type (`missing` | `found`)
- species, breed (free text), color, size
- collar (bool), collar_description
- microchipped (`yes` | `no` | `unknown`)
- distinctive_markings (free text)
- pet_name (nullable, missing-only)
- reward_amount (nullable, missing-only)
- location_lat, location_lng, location_text
- date_lost_or_found
- status (`active` | `resolved`)
- created_at

**post_photos**
- id, post_id, storage_path, embedding (vector, nullable until the embedding service
  has processed it)

**messages**
- id, post_id, sender_id, recipient_id, body, created_at

**push_subscriptions**
- id, user_id, subscription (JSON), created_at

## 5. Key flows

1. **Post a Missing/Found pet**: logged-in user fills the fields above and uploads 1+
   photos. Photos are stored in Supabase Storage; an Edge Function calls the embedding
   service to compute and store each photo's vector in `post_photos.embedding`.

2. **Browse feed**: live geolocation (or an unsorted view if the user declines location
   access) plus any selected filters produce a Postgres query over `posts`, sorted by
   distance.

3. **Search by photo**: user uploads a photo without creating a post. An Edge Function
   computes its embedding, then runs a `pgvector` cosine-similarity query against posts
   of the opposite type, combined with any active filters, returning ranked results.

4. **Contact**: from any post, "Message poster" opens or continues a thread in
   `messages`. The insert triggers a Database Webhook → Edge Function that sends a Web
   Push notification to the recipient (if subscribed), while the in-app thread updates
   live via Realtime.

5. **Resolve**: the post owner marks their own post `resolved`, removing it from default
   (active-only) search results.

## 6. Non-goals (final)

- No reward payment/escrow.
- No mobile app in this phase.
- No admin/moderation dashboard.
- No push notifications beyond new-message events.
- No guaranteed/automatic match confirmation from photo search — it's a ranked
  suggestion to help humans find each other faster, not an identity system.
