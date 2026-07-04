# PetFinder Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working PetFinder web app covering accounts, Missing/Found pet posts, a filterable/distance-sorted browse feed, and resolving a post — Plan 1 of 3 (Messaging/push notifications and Photo search follow in separate plans).

**Architecture:** React (Vite, JavaScript) frontend talking directly to a local Supabase project (Postgres, Auth, Storage) via `@supabase/supabase-js`. No custom backend server in this plan — all data access is client-side against Supabase with Row Level Security enforcing ownership rules.

**Tech Stack:** React 18, Vite, react-router-dom v6, @supabase/supabase-js v2, Supabase CLI (local dev stack), Vitest + @testing-library/react for tests.

## Global Constraints

- Distance search always uses the browser's live geolocation at search time — never a stored "home location" on the user profile (per spec §4).
- Reward amount is a displayed number only — no payment/escrow integration (per spec §2, non-goals).
- Every `posts` row belongs to exactly one `owner_id`; only that owner may update/delete it or its photos (enforced via Postgres Row Level Security, not just client-side checks).
- No TypeScript — plain JavaScript/JSX throughout, per this plan's tech stack.
- Reference the frontend-design skill (`Skill` tool, name `frontend-design`) before building any shared visual/layout component — see Task 4.

---

## File Structure

```
petfinder/
  supabase/
    config.toml
    migrations/
      0001_init.sql
      0002_storage.sql
  src/
    lib/
      supabaseClient.js       # Supabase client instance
      distance.js             # haversineDistanceKm (pure)
      geolocation.js          # getUserLocation() browser wrapper
    testUtils/
      fakeSupabase.js         # chainable fake query builder for tests
    features/
      auth/
        AuthContext.jsx       # AuthProvider + useAuth()
        LoginPage.jsx
        SignupPage.jsx
      posts/
        buildPostPayload.js   # pure form-values -> DB row mapper
        postsApi.js            # listPosts/getPost/createPost/resolvePost
        filterPosts.js          # pure filterAndSortPosts()
        PostCard.jsx
        CreatePostForm.jsx
        BrowseFeedPage.jsx
        PostDetailPage.jsx
      layout/
        Layout.jsx             # shared header/nav/container
        theme.css               # design tokens from frontend-design skill
    App.jsx
    main.jsx
  index.html
  package.json
  vite.config.js
  .env.local                    # gitignored, local Supabase URL/anon key
  .gitignore
```

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/App.test.jsx`, `src/setupTests.js`, `.gitignore`

**Interfaces:**
- Produces: an `App` component exported as default from `src/App.jsx`, rendered by `src/main.jsx` into `#root`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "petfinder",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "vite": "^5.4.6",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Write `vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    globals: true,
  },
})
```

- [ ] **Step 3: Write `src/setupTests.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PetFinder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 6: Write `src/App.jsx`**

```jsx
export default function App() {
  return <div>PetFinder</div>
}
```

- [ ] **Step 7: Write the failing test `src/App.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import App from './App.jsx'

test('renders the PetFinder app shell', () => {
  render(<App />)
  expect(screen.getByText('PetFinder')).toBeInTheDocument()
})
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules
dist
.env.local
supabase/.branches
supabase/.temp
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: installs without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 10: Run the test suite**

Run: `npm test`
Expected: `1 passed` (the App smoke test).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vite.config.js index.html src/main.jsx src/App.jsx src/App.test.jsx src/setupTests.js .gitignore
git commit -m "Scaffold Vite React app with Vitest"
```

---

### Task 2: Supabase local project + schema

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_storage.sql`, `scripts/verify-schema.mjs`, `.env.local`

**Interfaces:**
- Produces: Postgres tables `profiles`, `posts`, `post_photos` with the columns listed below, RLS policies, and a public storage bucket `post-photos`. All later tasks read/write these exact table and column names.

- [ ] **Step 1: Initialize the Supabase project**

Run: `npx supabase init`
Expected: creates `supabase/config.toml` and `supabase/` scaffolding. Answer "N" to any prompt about VS Code settings if asked.

- [ ] **Step 2: Start the local Supabase stack**

Run: `npx supabase start`
Expected: Docker containers start; output includes lines like:
```
API URL: http://127.0.0.1:54321
anon key: eyJ...
service_role key: eyJ...
```
Keep this output handy for Step 6.

- [ ] **Step 3: Write the schema migration `supabase/migrations/0001_init.sql`**

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create type post_type as enum ('missing', 'found');
create type microchip_status as enum ('yes', 'no', 'unknown');
create type post_status as enum ('active', 'resolved');

create table posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  type post_type not null,
  species text not null,
  breed text,
  color text,
  size text,
  collar boolean not null default false,
  collar_description text,
  microchipped microchip_status not null default 'unknown',
  distinctive_markings text,
  pet_name text,
  reward_amount numeric,
  location_lat double precision not null,
  location_lng double precision not null,
  location_text text not null,
  date_lost_or_found date not null,
  status post_status not null default 'active',
  created_at timestamptz not null default now()
);

create table post_photos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table posts enable row level security;
alter table post_photos enable row level security;

create policy "profiles are viewable by everyone" on profiles
  for select using (true);
create policy "users can insert their own profile" on profiles
  for insert with check (auth.uid() = id);
create policy "users can update their own profile" on profiles
  for update using (auth.uid() = id);

create policy "posts are viewable by everyone" on posts
  for select using (true);
create policy "users can insert their own posts" on posts
  for insert with check (auth.uid() = owner_id);
create policy "owners can update their own posts" on posts
  for update using (auth.uid() = owner_id);
create policy "owners can delete their own posts" on posts
  for delete using (auth.uid() = owner_id);

create policy "post photos are viewable by everyone" on post_photos
  for select using (true);
create policy "owners can insert photos on their posts" on post_photos
  for insert with check (
    exists (select 1 from posts where posts.id = post_id and posts.owner_id = auth.uid())
  );
create policy "owners can delete photos on their posts" on post_photos
  for delete using (
    exists (select 1 from posts where posts.id = post_id and posts.owner_id = auth.uid())
  );
```

- [ ] **Step 4: Write the storage migration `supabase/migrations/0002_storage.sql`**

```sql
insert into storage.buckets (id, name, public)
values ('post-photos', 'post-photos', true)
on conflict (id) do nothing;

create policy "anyone can view post photos" on storage.objects
  for select using (bucket_id = 'post-photos');

create policy "authenticated users can upload post photos" on storage.objects
  for insert with check (bucket_id = 'post-photos' and auth.role() = 'authenticated');
```

- [ ] **Step 5: Apply migrations to the local stack**

Run: `npx supabase db reset`
Expected: output shows both migrations applying (`0001_init.sql`, `0002_storage.sql`) with no errors, ending in "Finished supabase db reset".

- [ ] **Step 6: Write `.env.local`** (use the API URL and anon key printed in Step 2)

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from `npx supabase start` output>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from `npx supabase start` output>
```

- [ ] **Step 7: Write the verification script `scripts/verify-schema.mjs`**

```js
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => line.split('=', 2))
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
  email: 'schema-check@example.com',
  password: 'schema-check-password',
  email_confirm: true,
})
if (authError) throw authError

const { error: profileError } = await supabase
  .from('profiles')
  .insert({ id: authUser.user.id, display_name: 'Schema Check' })
if (profileError) throw profileError

const { data: post, error: postError } = await supabase
  .from('posts')
  .insert({
    owner_id: authUser.user.id,
    type: 'missing',
    species: 'cat',
    location_lat: 32.08,
    location_lng: 34.78,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
  })
  .select()
  .single()
if (postError) throw postError

console.log('Schema check passed. Cleaning up...')
await supabase.from('posts').delete().eq('id', post.id)
await supabase.auth.admin.deleteUser(authUser.user.id)
console.log('OK')
```

- [ ] **Step 8: Run the verification script**

Run: `node scripts/verify-schema.mjs`
Expected: prints `Schema check passed. Cleaning up...` then `OK`, no thrown errors.

- [ ] **Step 9: Write `src/lib/supabaseClient.js`**

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

- [ ] **Step 10: Commit**

```bash
git add supabase/config.toml supabase/migrations scripts/verify-schema.mjs src/lib/supabaseClient.js .gitignore
git commit -m "Add Supabase local schema for profiles, posts, post_photos"
```

Note: `.env.local` is intentionally not committed (it's in `.gitignore` from Task 1).

---

### Task 3: Pure utilities — distance and geolocation

**Files:**
- Create: `src/lib/distance.js`, `src/lib/distance.test.js`, `src/lib/geolocation.js`, `src/lib/geolocation.test.js`

**Interfaces:**
- Produces: `haversineDistanceKm(lat1, lng1, lat2, lng2): number` and `getUserLocation(): Promise<{lat: number, lng: number}>`. Task 6 (`filterPosts.js`) and `BrowseFeedPage.jsx` depend on these exact names and signatures.

- [ ] **Step 1: Write the failing test `src/lib/distance.test.js`**

```js
import { haversineDistanceKm } from './distance.js'

test('distance between the same point is 0', () => {
  expect(haversineDistanceKm(32.08, 34.78, 32.08, 34.78)).toBeCloseTo(0, 5)
})

test('distance between Tel Aviv and Jerusalem is about 54km', () => {
  const km = haversineDistanceKm(32.0853, 34.7818, 31.7683, 35.2137)
  expect(km).toBeGreaterThan(50)
  expect(km).toBeLessThan(60)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- distance`
Expected: FAIL with "Failed to resolve import ./distance.js" or similar (file doesn't exist yet).

- [ ] **Step 3: Write `src/lib/distance.js`**

```js
export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- distance`
Expected: `2 passed`.

- [ ] **Step 5: Write the failing test `src/lib/geolocation.test.js`**

```js
import { getUserLocation } from './geolocation.js'

test('resolves with lat/lng from navigator.geolocation', async () => {
  global.navigator.geolocation = {
    getCurrentPosition: (success) => success({ coords: { latitude: 1.5, longitude: 2.5 } }),
  }
  await expect(getUserLocation()).resolves.toEqual({ lat: 1.5, lng: 2.5 })
})

test('rejects when geolocation is unsupported', async () => {
  global.navigator.geolocation = undefined
  await expect(getUserLocation()).rejects.toThrow('Geolocation is not supported')
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- geolocation`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 7: Write `src/lib/geolocation.js`**

```js
export function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(error)
    )
  })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- geolocation`
Expected: `2 passed`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/distance.js src/lib/distance.test.js src/lib/geolocation.js src/lib/geolocation.test.js
git commit -m "Add haversine distance and geolocation utilities"
```

---

### Task 4: Visual direction + shared layout (frontend-design skill)

**Files:**
- Create: `src/features/layout/theme.css`, `src/features/layout/Layout.jsx`, `src/features/layout/Layout.test.jsx`

**Interfaces:**
- Produces: `Layout` component (default export from `src/features/layout/Layout.jsx`) accepting `{ children }` and rendering them inside a shared header/container. All page components in later tasks are wrapped in `Layout` from `App.jsx`.

- [ ] **Step 1: Invoke the frontend-design skill for visual direction**

Use the `Skill` tool with skill name `frontend-design` to get guidance on typography, color palette, spacing, and overall visual tone for PetFinder (a warm, trustworthy, urgency-appropriate feel — this is about reuniting people with lost pets, not a generic CRUD app). Capture the resulting direction (palette values, font choices, layout conventions) — you'll encode it as CSS custom properties in the next step.

- [ ] **Step 2: Write `src/features/layout/theme.css`** using the palette/typography from Step 1 as the actual values (replace the placeholders below with what the skill recommended)

```css
:root {
  --color-bg: #faf7f2;
  --color-surface: #ffffff;
  --color-text: #2b2420;
  --color-primary: #d9622b;
  --color-primary-contrast: #ffffff;
  --color-border: #e6ddd0;
  --font-family: 'Segoe UI', system-ui, sans-serif;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 2rem;
  --radius: 0.5rem;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-family);
}
```

- [ ] **Step 3: Write the failing test `src/features/layout/Layout.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import Layout from './Layout.jsx'

test('renders the app header and its children', () => {
  render(
    <Layout>
      <p>page content</p>
    </Layout>
  )
  expect(screen.getByRole('banner')).toHaveTextContent('PetFinder')
  expect(screen.getByText('page content')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- Layout`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 5: Write `src/features/layout/Layout.jsx`**

```jsx
import './theme.css'

export default function Layout({ children }) {
  return (
    <div>
      <header role="banner">
        <h1>PetFinder</h1>
      </header>
      <main>{children}</main>
    </div>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- Layout`
Expected: `1 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/features/layout
git commit -m "Add shared Layout component with frontend-design visual direction"
```

---

### Task 5: Test fake for Supabase queries

**Files:**
- Create: `src/testUtils/fakeSupabase.js`, `src/testUtils/fakeSupabase.test.js`

**Interfaces:**
- Produces: `createFakeQuery(result): object` (a thenable chainable stub) and `createFakeSupabase(routes): object`. Tasks 6-8's tests depend on these exact names.

- [ ] **Step 1: Write the failing test `src/testUtils/fakeSupabase.test.js`**

```js
import { createFakeQuery, createFakeSupabase } from './fakeSupabase.js'

test('createFakeQuery resolves chained calls to the given result', async () => {
  const query = createFakeQuery({ data: [{ id: 1 }], error: null })
  const result = await query.select('*').order('created_at')
  expect(result).toEqual({ data: [{ id: 1 }], error: null })
})

test('createFakeQuery.single resolves directly to the given result', async () => {
  const query = createFakeQuery({ data: { id: 1 }, error: null })
  const result = await query.select('*').eq('id', 1).single()
  expect(result).toEqual({ data: { id: 1 }, error: null })
})

test('createFakeSupabase routes table names to the right fake query', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p1' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await supabase.from('posts').select('*')
  expect(result).toEqual({ data: [{ id: 'p1' }], error: null })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fakeSupabase`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 3: Write `src/testUtils/fakeSupabase.js`**

```js
export function createFakeQuery(result) {
  const query = {
    select: () => query,
    order: () => query,
    eq: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    single: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return query
}

export function createFakeSupabase(routes) {
  return {
    from: (table) => routes[table],
    storage: {
      from: (bucket) =>
        routes.storage?.[bucket] ?? { upload: () => Promise.resolve({ error: null }) },
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fakeSupabase`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/testUtils/fakeSupabase.js src/testUtils/fakeSupabase.test.js
git commit -m "Add chainable fake Supabase query builder for tests"
```

---

### Task 6: Posts API + payload builder

**Files:**
- Create: `src/features/posts/buildPostPayload.js`, `src/features/posts/buildPostPayload.test.js`, `src/features/posts/postsApi.js`, `src/features/posts/postsApi.test.js`

**Interfaces:**
- Consumes: `createFakeQuery`, `createFakeSupabase` from `src/testUtils/fakeSupabase.js` (Task 5).
- Produces: `buildPostPayload(formValues, ownerId): object`, `listPosts(supabase): Promise<array>`, `getPost(supabase, postId): Promise<object>`, `createPost(supabase, payload, files): Promise<object>`, `resolvePost(supabase, postId): Promise<void>`. Tasks 7 and 8 call these exact functions.

- [ ] **Step 1: Write the failing test `src/features/posts/buildPostPayload.test.js`**

```js
import { buildPostPayload } from './buildPostPayload.js'

test('maps a missing-pet form to a full post row, including reward and name', () => {
  const payload = buildPostPayload(
    {
      type: 'missing',
      species: 'cat',
      breed: 'Tabby',
      color: 'orange',
      size: 'small',
      collar: true,
      collarDescription: 'blue collar',
      microchipped: 'yes',
      distinctiveMarkings: 'white paw',
      petName: 'Milo',
      rewardAmount: '50',
      locationLat: 32.08,
      locationLng: 34.78,
      locationText: 'Tel Aviv',
      dateLostOrFound: '2026-07-01',
    },
    'owner-1'
  )

  expect(payload).toEqual({
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    breed: 'Tabby',
    color: 'orange',
    size: 'small',
    collar: true,
    collar_description: 'blue collar',
    microchipped: 'yes',
    distinctive_markings: 'white paw',
    pet_name: 'Milo',
    reward_amount: 50,
    location_lat: 32.08,
    location_lng: 34.78,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
    status: 'active',
  })
})

test('forces pet_name and reward_amount to null for a found-pet post', () => {
  const payload = buildPostPayload(
    {
      type: 'found',
      species: 'dog',
      petName: 'should be ignored',
      rewardAmount: '100',
      locationLat: 1,
      locationLng: 2,
      locationText: 'somewhere',
      dateLostOrFound: '2026-07-01',
    },
    'owner-2'
  )

  expect(payload.pet_name).toBeNull()
  expect(payload.reward_amount).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- buildPostPayload`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 3: Write `src/features/posts/buildPostPayload.js`**

```js
export function buildPostPayload(formValues, ownerId) {
  const isMissing = formValues.type === 'missing'
  return {
    owner_id: ownerId,
    type: formValues.type,
    species: formValues.species,
    breed: formValues.breed || null,
    color: formValues.color || null,
    size: formValues.size || null,
    collar: Boolean(formValues.collar),
    collar_description: formValues.collar ? formValues.collarDescription || null : null,
    microchipped: formValues.microchipped || 'unknown',
    distinctive_markings: formValues.distinctiveMarkings || null,
    pet_name: isMissing ? formValues.petName || null : null,
    reward_amount: isMissing && formValues.rewardAmount ? Number(formValues.rewardAmount) : null,
    location_lat: formValues.locationLat,
    location_lng: formValues.locationLng,
    location_text: formValues.locationText,
    date_lost_or_found: formValues.dateLostOrFound,
    status: 'active',
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- buildPostPayload`
Expected: `2 passed`.

- [ ] **Step 5: Write the failing test `src/features/posts/postsApi.test.js`**

```js
import { createFakeQuery, createFakeSupabase } from '../../testUtils/fakeSupabase.js'
import { listPosts, getPost, createPost, resolvePost } from './postsApi.js'

test('listPosts returns the query result data', async () => {
  const postsQuery = createFakeQuery({ data: [{ id: 'p1' }], error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await listPosts(supabase)
  expect(result).toEqual([{ id: 'p1' }])
})

test('getPost returns a single post by id', async () => {
  const postsQuery = createFakeQuery({ data: { id: 'p1' }, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  const result = await getPost(supabase, 'p1')
  expect(result).toEqual({ id: 'p1' })
})

test('createPost inserts the post, uploads photos, and inserts photo rows', async () => {
  const postsQuery = createFakeQuery({ data: { id: 'p1' }, error: null })
  const photosQuery = createFakeQuery({ data: null, error: null })
  const uploadFn = vi.fn(() => Promise.resolve({ error: null }))
  const supabase = createFakeSupabase({
    posts: postsQuery,
    post_photos: photosQuery,
    storage: { 'post-photos': { upload: uploadFn } },
  })

  const file = { name: 'cat.jpg' }
  const post = await createPost(supabase, { species: 'cat' }, [file])

  expect(post).toEqual({ id: 'p1' })
  expect(uploadFn).toHaveBeenCalledWith('p1/cat.jpg', file)
})

test('resolvePost updates the post status to resolved', async () => {
  const postsQuery = createFakeQuery({ data: null, error: null })
  const supabase = createFakeSupabase({ posts: postsQuery })
  await expect(resolvePost(supabase, 'p1')).resolves.toBeUndefined()
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- postsApi`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 7: Write `src/features/posts/postsApi.js`**

```js
export async function listPosts(supabase) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, post_photos(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getPost(supabase, postId) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, post_photos(*)')
    .eq('id', postId)
    .single()
  if (error) throw error
  return data
}

export async function createPost(supabase, payload, files) {
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert(payload)
    .select()
    .single()
  if (postError) throw postError

  for (const file of files) {
    const storagePath = `${post.id}/${file.name}`
    const { error: uploadError } = await supabase.storage.from('post-photos').upload(storagePath, file)
    if (uploadError) throw uploadError

    const { error: photoRowError } = await supabase
      .from('post_photos')
      .insert({ post_id: post.id, storage_path: storagePath })
    if (photoRowError) throw photoRowError
  }

  return post
}

export async function resolvePost(supabase, postId) {
  const { error } = await supabase.from('posts').update({ status: 'resolved' }).eq('id', postId)
  if (error) throw error
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- postsApi`
Expected: `4 passed`.

- [ ] **Step 9: Commit**

```bash
git add src/features/posts/buildPostPayload.js src/features/posts/buildPostPayload.test.js src/features/posts/postsApi.js src/features/posts/postsApi.test.js
git commit -m "Add posts API and form-payload builder"
```

---

### Task 7: Filter + sort logic for the browse feed

**Files:**
- Create: `src/features/posts/filterPosts.js`, `src/features/posts/filterPosts.test.js`

**Interfaces:**
- Consumes: `haversineDistanceKm` from `src/lib/distance.js` (Task 3).
- Produces: `filterAndSortPosts(posts, filters): array` where each returned post gains a `distanceKm` field. `BrowseFeedPage.jsx` (Task 8) calls this exact function.

- [ ] **Step 1: Write the failing test `src/features/posts/filterPosts.test.js`**

```js
import { filterAndSortPosts } from './filterPosts.js'

const posts = [
  { id: 'near', species: 'cat', collar: true, reward_amount: 50, status: 'active', date_lost_or_found: '2026-07-01', location_lat: 32.08, location_lng: 34.78 },
  { id: 'far', species: 'cat', collar: false, reward_amount: null, status: 'active', date_lost_or_found: '2026-06-01', location_lat: 40, location_lng: 40 },
  { id: 'resolved', species: 'cat', collar: true, reward_amount: null, status: 'resolved', date_lost_or_found: '2026-07-01', location_lat: 32.08, location_lng: 34.78 },
  { id: 'dog', species: 'dog', collar: true, reward_amount: null, status: 'active', date_lost_or_found: '2026-07-01', location_lat: 32.08, location_lng: 34.78 },
]

test('excludes resolved posts by default', () => {
  const result = filterAndSortPosts(posts, {})
  expect(result.map((p) => p.id)).not.toContain('resolved')
})

test('filters by species', () => {
  const result = filterAndSortPosts(posts, { species: 'dog' })
  expect(result.map((p) => p.id)).toEqual(['dog'])
})

test('filters by collar presence', () => {
  const result = filterAndSortPosts(posts, { collarOnly: true })
  expect(result.map((p) => p.id).sort()).toEqual(['dog', 'near'])
})

test('filters by reward present', () => {
  const result = filterAndSortPosts(posts, { rewardOnly: true })
  expect(result.map((p) => p.id)).toEqual(['near'])
})

test('filters by radius from the user location and sorts by distance ascending', () => {
  const result = filterAndSortPosts(posts, {
    userLocation: { lat: 32.08, lng: 34.78 },
    radiusKm: 10,
  })
  expect(result.map((p) => p.id)).toEqual(['near', 'dog'])
  expect(result[0].distanceKm).toBeCloseTo(0, 3)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- filterPosts`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 3: Write `src/features/posts/filterPosts.js`**

```js
import { haversineDistanceKm } from '../../lib/distance.js'

export function filterAndSortPosts(posts, filters) {
  const {
    userLocation,
    radiusKm,
    species,
    breed,
    color,
    size,
    collarOnly,
    dateFrom,
    dateTo,
    rewardOnly,
    status = 'active',
  } = filters

  return posts
    .filter((post) => (status ? post.status === status : true))
    .filter((post) => (species ? post.species === species : true))
    .filter((post) => (breed ? post.breed?.toLowerCase().includes(breed.toLowerCase()) : true))
    .filter((post) => (color ? post.color === color : true))
    .filter((post) => (size ? post.size === size : true))
    .filter((post) => (collarOnly ? post.collar === true : true))
    .filter((post) => (rewardOnly ? Number(post.reward_amount) > 0 : true))
    .filter((post) => (dateFrom ? post.date_lost_or_found >= dateFrom : true))
    .filter((post) => (dateTo ? post.date_lost_or_found <= dateTo : true))
    .map((post) => ({
      ...post,
      distanceKm: userLocation
        ? haversineDistanceKm(userLocation.lat, userLocation.lng, post.location_lat, post.location_lng)
        : null,
    }))
    .filter((post) => (userLocation && radiusKm ? post.distanceKm <= radiusKm : true))
    .sort((a, b) => {
      if (a.distanceKm == null || b.distanceKm == null) return 0
      return a.distanceKm - b.distanceKm
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- filterPosts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/filterPosts.js src/features/posts/filterPosts.test.js
git commit -m "Add filter and distance-sort logic for the browse feed"
```

---

### Task 8: Auth context + Login/Signup pages

**Files:**
- Create: `src/features/auth/AuthContext.jsx`, `src/features/auth/AuthContext.test.jsx`, `src/features/auth/LoginPage.jsx`, `src/features/auth/SignupPage.jsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabaseClient.js` (Task 2).
- Produces: `AuthProvider` (wraps the app) and `useAuth()` returning `{ session, user, loading, signUp(email, password, displayName), signIn(email, password), signOut() }`. `App.jsx` (Task 9) wraps routes in `AuthProvider`; `CreatePostForm`/`PostDetailPage` (Tasks 9-10) call `useAuth()`.

- [ ] **Step 1: Write the failing test `src/features/auth/AuthContext.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext.jsx'

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signUp: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } }, error: null })),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))

function Probe() {
  const { loading, signUp } = useAuth()
  return (
    <div>
      <span>{loading ? 'loading' : 'ready'}</span>
      <button onClick={() => signUp('a@example.com', 'password123', 'Ada')}>sign up</button>
    </div>
  )
}

test('signUp creates the auth user and a matching profile row', async () => {
  const { supabase } = await import('../../lib/supabaseClient.js')
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  )

  await waitFor(() => screen.getByText('ready'))
  await userEvent.click(screen.getByText('sign up'))

  expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: 'a@example.com', password: 'password123' })
  expect(supabase.from).toHaveBeenCalledWith('profiles')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AuthContext`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 3: Write `src/features/auth/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, display_name: displayName })
      if (profileError) throw profileError
    }
    return data
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const value = { session, user: session?.user ?? null, loading, signUp, signIn, signOut }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AuthContext`
Expected: `1 passed`.

- [ ] **Step 5: Write `src/features/auth/SignupPage.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

export default function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    try {
      await signUp(email, password, displayName)
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Sign up</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        Display name
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
      </label>
      <button type="submit">Create account</button>
    </form>
  )
}
```

- [ ] **Step 6: Write `src/features/auth/LoginPage.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Log in</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <button type="submit">Log in</button>
    </form>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/features/auth
git commit -m "Add auth context, login, and signup pages"
```

---

### Task 9: Create Post form

**Files:**
- Create: `src/features/posts/CreatePostForm.jsx`, `src/features/posts/CreatePostForm.test.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 8), `buildPostPayload`, `createPost` (Task 6).
- Produces: `CreatePostForm` default export, used by `App.jsx` (Task 11) at route `/post/new`.

- [ ] **Step 1: Write the failing test `src/features/posts/CreatePostForm.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import CreatePostForm from './CreatePostForm.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import * as postsApi from './postsApi.js'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('./postsApi.js', () => ({ createPost: vi.fn(() => Promise.resolve({ id: 'p1' })) }))

test('submits a missing-pet post with the entered fields', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })

  render(<CreatePostForm />)

  await userEvent.selectOptions(screen.getByLabelText('Post type'), 'missing')
  await userEvent.type(screen.getByLabelText('Species'), 'cat')
  await userEvent.type(screen.getByLabelText('Location'), 'Tel Aviv')
  await userEvent.type(screen.getByLabelText('Latitude'), '32.08')
  await userEvent.type(screen.getByLabelText('Longitude'), '34.78')
  await userEvent.type(screen.getByLabelText('Date lost/found'), '2026-07-01')
  await userEvent.click(screen.getByText('Create post'))

  expect(postsApi.createPost).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ owner_id: 'owner-1', type: 'missing', species: 'cat' }),
    []
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CreatePostForm`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 3: Write `src/features/posts/CreatePostForm.jsx`**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { supabase } from '../../lib/supabaseClient.js'
import { buildPostPayload } from './buildPostPayload.js'
import { createPost } from './postsApi.js'

const initialForm = {
  type: 'missing',
  species: '',
  breed: '',
  color: '',
  size: '',
  collar: false,
  collarDescription: '',
  microchipped: 'unknown',
  distinctiveMarkings: '',
  petName: '',
  rewardAmount: '',
  locationLat: '',
  locationLng: '',
  locationText: '',
  dateLostOrFound: '',
}

export default function CreatePostForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    try {
      const payload = buildPostPayload(
        {
          ...form,
          locationLat: Number(form.locationLat),
          locationLng: Number(form.locationLng),
        },
        user.id
      )
      const post = await createPost(supabase, payload, files)
      navigate(`/post/${post.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Report a missing or found pet</h2>
      {error && <p role="alert">{error}</p>}

      <label htmlFor="type">Post type</label>
      <select id="type" value={form.type} onChange={(e) => update('type', e.target.value)}>
        <option value="missing">Missing</option>
        <option value="found">Found</option>
      </select>

      <label htmlFor="species">Species</label>
      <input id="species" value={form.species} onChange={(e) => update('species', e.target.value)} required />

      <label htmlFor="breed">Breed</label>
      <input id="breed" value={form.breed} onChange={(e) => update('breed', e.target.value)} />

      <label htmlFor="color">Color</label>
      <input id="color" value={form.color} onChange={(e) => update('color', e.target.value)} />

      <label htmlFor="size">Size</label>
      <input id="size" value={form.size} onChange={(e) => update('size', e.target.value)} />

      <label htmlFor="collar">
        <input
          id="collar"
          type="checkbox"
          checked={form.collar}
          onChange={(e) => update('collar', e.target.checked)}
        />
        Has a collar
      </label>

      {form.collar && (
        <>
          <label htmlFor="collarDescription">Collar description</label>
          <input
            id="collarDescription"
            value={form.collarDescription}
            onChange={(e) => update('collarDescription', e.target.value)}
          />
        </>
      )}

      <label htmlFor="microchipped">Microchipped</label>
      <select id="microchipped" value={form.microchipped} onChange={(e) => update('microchipped', e.target.value)}>
        <option value="unknown">Unknown</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>

      <label htmlFor="distinctiveMarkings">Distinctive markings</label>
      <input
        id="distinctiveMarkings"
        value={form.distinctiveMarkings}
        onChange={(e) => update('distinctiveMarkings', e.target.value)}
      />

      {form.type === 'missing' && (
        <>
          <label htmlFor="petName">Pet name</label>
          <input id="petName" value={form.petName} onChange={(e) => update('petName', e.target.value)} />

          <label htmlFor="rewardAmount">Reward amount (optional)</label>
          <input
            id="rewardAmount"
            type="number"
            value={form.rewardAmount}
            onChange={(e) => update('rewardAmount', e.target.value)}
          />
        </>
      )}

      <label htmlFor="locationText">Location</label>
      <input id="locationText" value={form.locationText} onChange={(e) => update('locationText', e.target.value)} required />

      <label htmlFor="locationLat">Latitude</label>
      <input id="locationLat" value={form.locationLat} onChange={(e) => update('locationLat', e.target.value)} required />

      <label htmlFor="locationLng">Longitude</label>
      <input id="locationLng" value={form.locationLng} onChange={(e) => update('locationLng', e.target.value)} required />

      <label htmlFor="dateLostOrFound">Date lost/found</label>
      <input
        id="dateLostOrFound"
        type="date"
        value={form.dateLostOrFound}
        onChange={(e) => update('dateLostOrFound', e.target.value)}
        required
      />

      <label htmlFor="photos">Photos</label>
      <input id="photos" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />

      <button type="submit">Create post</button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CreatePostForm`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/features/posts/CreatePostForm.jsx src/features/posts/CreatePostForm.test.jsx
git commit -m "Add create-post form for missing and found pets"
```

---

### Task 10: Post card, browse feed, and post detail (with resolve)

**Files:**
- Create: `src/features/posts/PostCard.jsx`, `src/features/posts/BrowseFeedPage.jsx`, `src/features/posts/BrowseFeedPage.test.jsx`, `src/features/posts/PostDetailPage.jsx`, `src/features/posts/PostDetailPage.test.jsx`

**Interfaces:**
- Consumes: `listPosts`, `getPost`, `resolvePost` (Task 6), `filterAndSortPosts` (Task 7), `getUserLocation` (Task 3), `useAuth` (Task 8).
- Produces: `BrowseFeedPage` and `PostDetailPage` default exports, wired into `App.jsx` at `/` and `/post/:id` (Task 11).

- [ ] **Step 1: Write `src/features/posts/PostCard.jsx`**

```jsx
export default function PostCard({ post }) {
  return (
    <article>
      <h3>
        {post.type === 'missing' ? 'Missing' : 'Found'}: {post.species}
      </h3>
      {post.breed && <p>Breed: {post.breed}</p>}
      <p>Location: {post.location_text}</p>
      {post.distanceKm != null && <p>{post.distanceKm.toFixed(1)} km away</p>}
      {post.reward_amount && <p>Reward: {post.reward_amount}</p>}
      <a href={`/post/${post.id}`}>View details</a>
    </article>
  )
}
```

- [ ] **Step 2: Write the failing test `src/features/posts/BrowseFeedPage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import BrowseFeedPage from './BrowseFeedPage.jsx'
import * as postsApi from './postsApi.js'
import * as geolocation from '../../lib/geolocation.js'

vi.mock('./postsApi.js', () => ({
  listPosts: vi.fn(() =>
    Promise.resolve([
      { id: 'p1', type: 'missing', species: 'cat', status: 'active', location_lat: 32.08, location_lng: 34.78, date_lost_or_found: '2026-07-01' },
    ])
  ),
}))
vi.mock('../../lib/geolocation.js', () => ({
  getUserLocation: vi.fn(() => Promise.resolve({ lat: 32.08, lng: 34.78 })),
}))

test('loads posts and renders them in the feed', async () => {
  render(
    <MemoryRouter>
      <BrowseFeedPage />
    </MemoryRouter>
  )

  await waitFor(() => expect(postsApi.listPosts).toHaveBeenCalled())
  expect(await screen.findByText(/Missing: cat/)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- BrowseFeedPage`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 4: Write `src/features/posts/BrowseFeedPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'
import { listPosts } from './postsApi.js'
import { filterAndSortPosts } from './filterPosts.js'
import { getUserLocation } from '../../lib/geolocation.js'
import PostCard from './PostCard.jsx'

export default function BrowseFeedPage() {
  const [posts, setPosts] = useState([])
  const [userLocation, setUserLocation] = useState(null)
  const [filters, setFilters] = useState({ radiusKm: 50 })

  useEffect(() => {
    listPosts(supabase).then(setPosts)
    getUserLocation()
      .then(setUserLocation)
      .catch(() => setUserLocation(null))
  }, [])

  const visiblePosts = filterAndSortPosts(posts, { ...filters, userLocation })

  return (
    <div>
      <h2>Missing &amp; found pets near you</h2>
      <label htmlFor="species-filter">Species</label>
      <input
        id="species-filter"
        value={filters.species || ''}
        onChange={(e) => setFilters((prev) => ({ ...prev, species: e.target.value || undefined }))}
      />
      {visiblePosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- BrowseFeedPage`
Expected: `1 passed`.

- [ ] **Step 6: Write the failing test `src/features/posts/PostDetailPage.test.jsx`**

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import PostDetailPage from './PostDetailPage.jsx'
import * as postsApi from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'

vi.mock('./postsApi.js', () => ({
  getPost: vi.fn(() =>
    Promise.resolve({ id: 'p1', owner_id: 'owner-1', type: 'missing', species: 'cat', location_text: 'Tel Aviv', post_photos: [] })
  ),
  resolvePost: vi.fn(() => Promise.resolve()),
}))
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }))

function renderAtPost(id) {
  return render(
    <MemoryRouter initialEntries={[`/post/${id}`]}>
      <Routes>
        <Route path="/post/:id" element={<PostDetailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

test('owner sees a resolve button and it marks the post resolved', async () => {
  useAuth.mockReturnValue({ user: { id: 'owner-1' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  await userEvent.click(screen.getByText('Mark as resolved'))

  expect(postsApi.resolvePost).toHaveBeenCalledWith(expect.anything(), 'p1')
})

test('non-owner does not see a resolve button', async () => {
  useAuth.mockReturnValue({ user: { id: 'someone-else' } })
  renderAtPost('p1')

  await waitFor(() => screen.getByText(/Missing: cat/))
  expect(screen.queryByText('Mark as resolved')).not.toBeInTheDocument()
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- PostDetailPage`
Expected: FAIL (file doesn't exist yet).

- [ ] **Step 8: Write `src/features/posts/PostDetailPage.jsx`**

```jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient.js'
import { getPost, resolvePost } from './postsApi.js'
import { useAuth } from '../auth/AuthContext.jsx'

export default function PostDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [post, setPost] = useState(null)

  useEffect(() => {
    getPost(supabase, id).then(setPost)
  }, [id])

  if (!post) return <p>Loading...</p>

  const isOwner = user && user.id === post.owner_id

  async function handleResolve() {
    await resolvePost(supabase, post.id)
    setPost((prev) => ({ ...prev, status: 'resolved' }))
  }

  return (
    <div>
      <h2>
        {post.type === 'missing' ? 'Missing' : 'Found'}: {post.species}
      </h2>
      <p>Location: {post.location_text}</p>
      {isOwner && post.status !== 'resolved' && (
        <button onClick={handleResolve}>Mark as resolved</button>
      )}
    </div>
  )
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- PostDetailPage`
Expected: `2 passed`.

- [ ] **Step 10: Commit**

```bash
git add src/features/posts/PostCard.jsx src/features/posts/BrowseFeedPage.jsx src/features/posts/BrowseFeedPage.test.jsx src/features/posts/PostDetailPage.jsx src/features/posts/PostDetailPage.test.jsx
git commit -m "Add browse feed and post detail pages with resolve action"
```

---

### Task 11: Wire up routing

**Files:**
- Modify: `src/App.jsx`, `src/App.test.jsx`

**Interfaces:**
- Consumes: `AuthProvider` (Task 8), `Layout` (Task 4), `LoginPage`/`SignupPage` (Task 8), `BrowseFeedPage`/`CreatePostForm`/`PostDetailPage` (Tasks 9-10).

- [ ] **Step 1: Update the failing test `src/App.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react'
import App from './App.jsx'

vi.mock('./lib/supabaseClient.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}))
vi.mock('./features/posts/postsApi.js', () => ({ listPosts: vi.fn(() => Promise.resolve([])) }))
vi.mock('./lib/geolocation.js', () => ({ getUserLocation: vi.fn(() => Promise.reject(new Error('no geo'))) }))

test('renders the browse feed at the root route', async () => {
  render(<App />)
  expect(await screen.findByText('Missing & found pets near you')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- App`
Expected: FAIL (App.jsx doesn't render the feed yet).

- [ ] **Step 3: Write `src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext.jsx'
import Layout from './features/layout/Layout.jsx'
import LoginPage from './features/auth/LoginPage.jsx'
import SignupPage from './features/auth/SignupPage.jsx'
import BrowseFeedPage from './features/posts/BrowseFeedPage.jsx'
import CreatePostForm from './features/posts/CreatePostForm.jsx'
import PostDetailPage from './features/posts/PostDetailPage.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<BrowseFeedPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/post/new" element={<CreatePostForm />} />
            <Route path="/post/:id" element={<PostDetailPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- App`
Expected: `1 passed`.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests across all files pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/App.test.jsx
git commit -m "Wire up routing for browse feed, auth, and post pages"
```

---

## Self-Review Notes

- **Spec coverage:** accounts (Task 8), Missing/Found posts with all fields (Tasks 6, 9), browse feed with distance + species/breed/color/size/collar/date/reward filters (Task 7, 10), resolve action (Task 10). Messaging, push notifications, and photo search are intentionally deferred to Plans 2 and 3 per the spec's own phasing.
- **Type consistency checked:** `buildPostPayload` output keys match the `posts` table columns from Task 2's migration exactly; `postsApi.js` function names (`listPosts`, `getPost`, `createPost`, `resolvePost`) are identical across Tasks 6, 9, and 10; `filterAndSortPosts(posts, filters)` signature matches between Task 7 and its use in Task 10.
- **No placeholders:** every step has real, runnable code and exact commands with expected output.
