# Rehoboth Clinic HMS — Firebase → Supabase Migration

## What's in this phase

- `supabase/migrations/0001_schema.sql` — Postgres schema (patients, medical_records, lab_tests, financials, expenses, inventory, appointments, audit_logs, users)
- `supabase/migrations/0002_auth_and_helpers.sql` — RLS policies (one-to-one with your old `firestore.rules`) + helper functions
- `supabase/functions/invite-staff/` — Edge Function replacing the old "create user with default password 1234567" flow
- `src/lib/supabase.ts` — Supabase client (replaces `src/firebase.ts`)
- `src/lib/auth.tsx` — Auth context (replaces the `AuthProvider`/`useAuth` block in `App.tsx`)
- `src/lib/audit.ts` — Audit logging (replaces `logAction` in `App.tsx`)
- `src/components/ForcePasswordChange.tsx` — New: forces a real password on first login
- `vercel.json` — Vercel deploy config
- `.env.example` — Updated for Supabase

## Security fixes baked into this migration

1. **No more default password.** Staff are invited by email (Supabase sends the invite), they set their own password, and `must_change_password` gates access until they do.
2. **No dev-override backdoor.** The old `staffForm.devOverride` path that created Firestore-only "ghost" users is gone entirely.
3. **No hardcoded admin email in the security layer.** The old `firestore.rules` gave `onirinwamichael@gmail.com` permanent CMD rights regardless of the database state. RLS policies now check only the `users` table. **You must seed your first CMD manually — see below.**
4. **Errors no longer bundle PII.** `handleSupabaseError` logs details to console only; thrown messages are generic.
5. **Read access to patient records is now audit-logged**, not just writes (call `logRecordAccess` from patient-view components — this needs to be wired into `PatientHistory.tsx` and `ClinicalBoard.tsx` in Phase 2).

## Setup steps

1. **Create a Supabase project**, then link it:
   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```

2. **Run migrations:**
   ```bash
   supabase db push
   ```

3. **Seed your first CMD account.** Since there's no hardcoded backdoor anymore, do this once via SQL editor in the Supabase dashboard, *after* creating yourself as an Auth user (Dashboard → Authentication → Add User):
   ```sql
   insert into public.users (id, email, role, name, status, must_change_password)
   values ('<your-auth-user-uuid>', 'you@example.com', 'CMD', 'Your Name', 'active', false);
   ```

4. **Deploy the invite-staff Edge Function:**
   ```bash
   supabase functions deploy invite-staff
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<from Dashboard > Settings > API>
   ```

5. **Set env vars** in `.env` (local) and in Vercel project settings (Production/Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

6. **Deploy to Vercel:**
   ```bash
   npm i -g vercel
   vercel link
   vercel --prod
   ```

## Phase 2 (not yet done)

The seven portal components (`ReceptionistPortal.tsx`, `DoctorNursePortal.tsx`, `LabPortal.tsx`, `AccountantPortal.tsx`, `PharmacyPortal.tsx`, `CMDPortal.tsx`, `ClinicalBoard.tsx`, `PatientSearch.tsx`, `PatientHistory.tsx`) still call Firestore APIs (`onSnapshot`, `addDoc`, `updateDoc`, etc.) directly. These need to be rewritten to Supabase equivalents:

| Firestore | Supabase |
|---|---|
| `onSnapshot(query(...))` | `supabase.channel().on('postgres_changes', ...)` for realtime, or plain `.select()` for one-shot |
| `addDoc(collection(db, 'x'), data)` | `supabase.from('x').insert(data)` |
| `updateDoc(doc(db, 'x', id), data)` | `supabase.from('x').update(data).eq('id', id)` |
| `getDocs(query(...))` | `supabase.from('x').select().match(...)` |

Say the word and I'll go through these next — happy to do all seven in one pass or one at a time so you can review as we go.
