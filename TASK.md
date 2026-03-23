# Jabumarket — Vendor System Fixes
# Claude Code Implementation Prompt
# Covers all 15 tasks from the vendor audit

---

## PHASE 1 — READ THESE FILES FIRST (do not write any code yet)

Read every file listed. After reading, write one line per file summarising what it currently does and flag anything that conflicts with the tasks below.

- `app/vendor/page.tsx` — full file, note: the vendor_type check (or lack of one) in the approved dashboard branch, the checklist logic, the status branching
- `app/vendor/create/page.tsx` — full file, note: what fields are collected, where it redirects after creation
- `app/vendor/register/page.tsx` — full file, note: what fields are collected for food vendors
- `app/me/page.tsx` — full file, note: how vendor data is loaded, what is passed to ListingsTab, how tabs are built
- `app/me/_components/ListingsTab.tsx` — full file, note: the broken .eq('vendor_id', userId) query
- `app/me/_components/OverviewTab.tsx` — full file
- `app/me/_components/ContextBanner.tsx` — full file
- `app/me/_components/QuickActions.tsx` — full file
- `app/me/_components/types.ts` — full file, note: Vendor type fields
- `app/my-listings/page.tsx` — focus on: per-listing actions (edit, bump, toggle), whether mark-as-sold is available inline
- `app/vendors/[id]/page.tsx` — focus on: suspended_at check, bank_account_number display, storefront link
- `app/vendor/setup/page.tsx` — full file
- `app/api/vendor/setup/route.ts` — full file, note: the .eq('vendor_type', 'food') guard

Only proceed to Phase 2 after reading all files.

---

## PHASE 2 — IMPLEMENT

Work through every task in order. Do not skip any.

---

### TASK 1 — Fix the ListingsTab broken query

File: `app/me/_components/ListingsTab.tsx`

The component receives `userId` and queries `.eq('vendor_id', userId)`. This is wrong — `vendor_id` on listings is the vendor row's UUID, not the auth user's UUID.

1. Change the prop from `userId: string | null` to `vendorId: string | null`
2. Update the query to `.eq('vendor_id', vendorId!)`
3. Update all references inside the component from `userId` to `vendorId`

File: `app/me/page.tsx`

The ListingsTab is called as `<ListingsTab userId={me?.id ?? null} />`. Change this to:
```tsx
<ListingsTab vendorId={vendor?.id ?? null} />
```

Also fix the listings count query in the load function — it currently queries `.eq('vendor_id', user.id)`. Change it to use the vendor's id once the vendor row is loaded. Move the listings count fetch inside the vendor data block:
```ts
// After vendor is loaded:
if (vendorRes.data?.id) {
  const listingsRes = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendorRes.data.id);
  setListingsCount(listingsRes.count ?? 0);
}
```

---

### TASK 2 — Add "Mark as sold" quick action to /my-listings

File: `app/my-listings/page.tsx`

Read the existing per-listing action buttons (edit, bump, toggle active/inactive, delete). Add a "Mark sold" button that appears only when `listing.status === 'active'`.

The button should:
1. Call a PATCH on the listing row setting `status: 'sold'`
2. Update the local state optimistically
3. Show a brief success state (change button label to "Sold ✓" for 2 seconds)

Add it next to the existing Edit button in the listing row actions. Use the existing Supabase client pattern. The update call:
```ts
await supabase
  .from('listings')
  .update({ status: 'sold' })
  .eq('id', listingId);
```

Label: "Mark sold" — small, destructive-looking but not red (use zinc-700 border with zinc-50 bg). On success briefly show "Sold ✓" in emerald before resetting the listing row to show the sold badge.

---

### TASK 3 — Add bank details to /vendor/create onboarding

File: `app/vendor/create/page.tsx`

After the existing location field, add three new fields to the form:

```tsx
{/* Bank details */}
<div className="space-y-1.5">
  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
    Payment details <span className="normal-case font-normal text-zinc-400">(buyers pay you here)</span>
  </p>
  <input
    type="text"
    placeholder="Bank name (e.g. GTBank, Opay, Palmpay)"
    value={bankName}
    onChange={(e) => setBankName(e.target.value)}
    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
  />
  <input
    type="text"
    inputMode="numeric"
    placeholder="Account number (10 digits)"
    value={accountNumber}
    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
  />
  <input
    type="text"
    placeholder="Account name (as on your bank)"
    value={accountName}
    onChange={(e) => setAccountName(e.target.value)}
    className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
  />
  <p className="text-[11px] text-zinc-400">You can add this later — but buyers need it to pay you.</p>
</div>
```

Add state variables:
```ts
const [bankName, setBankName] = useState('');
const [accountNumber, setAccountNumber] = useState('');
const [accountName, setAccountName] = useState('');
```

In `handleSubmit`, include these fields in the insert if they have values:
```ts
...(bankName.trim() ? { bank_name: bankName.trim() } : {}),
...(accountNumber.trim().length === 10 ? { bank_account_number: accountNumber.trim() } : {}),
...(accountName.trim() ? { bank_account_name: accountName.trim() } : {}),
```

---

### TASK 4 — Add bank details to /vendor/register food vendor form

File: `app/vendor/register/page.tsx`

Read the existing form fields. After the description field and before the hours fields, add the same three bank fields from Task 3 (bank name, account number, account name). Add the same state variables. Include them in the insert on submit using the same conditional spread pattern.

Add a small note below the bank section:
```tsx
<p className="text-[11px] text-zinc-400">
  Required before you can receive orders. You can also add this after approval.
</p>
```

---

### TASK 5 — Add bank details to the food vendor onboarding checklist

File: `app/vendor/page.tsx`

The `ChecklistState` type has `hasMenuItems`, `hasHours`, `hasGoneLive`. Add `hasBankDetails: boolean`.

In the checklist load block (after fetching menuItems), add:
```ts
hasBankDetails: !!(v.bank_name && v.bank_account_number && v.bank_account_name),
```

The vendor select query already includes bank fields. If it doesn't, add `bank_name, bank_account_number, bank_account_name` to the select.

In `OnboardingChecklist`, add a fourth step after hasHours:
```ts
{
  done: checklist.hasBankDetails,
  label: checklist.hasBankDetails ? 'Bank details added' : 'Add your bank details',
  sub: checklist.hasBankDetails
    ? 'Buyers can pay you directly.'
    : 'Required before buyers can complete payment.',
  href: '/vendor/setup',
},
```

Update `showChecklist` to also check `!checklist.hasBankDetails`:
```ts
const showChecklist = !checklist.hasMenuItems || !checklist.hasHours || !checklist.hasBankDetails;
```

---

### TASK 6 — Build a normal vendor dashboard branch in /vendor/page.tsx

File: `app/vendor/page.tsx`

The approved dashboard currently renders food-only content regardless of `vendor_type`. Add a branch immediately before the `const showChecklist = ...` line in the approved dashboard section:

```ts
const isFoodVendor = vendor.vendor_type === 'food';
```

Then wrap the entire food dashboard JSX in `{isFoodVendor ? (...food dashboard...) : (...normal vendor dashboard...)}`.

The normal vendor dashboard JSX to build (replace the current return for non-food vendors):

```tsx
return (
  <div className="mx-auto w-full max-w-2xl space-y-4 pb-24">
    <div>
      <h1 className="text-xl font-bold text-zinc-900">{vendor.name}</h1>
      <p className="mt-0.5 text-sm text-zinc-500">
        {vendor.vendor_type === 'mall' ? 'Campus shop' : 'Student vendor'} · Seller dashboard
      </p>
    </div>

    {/* Bank details warning — most critical */}
    {!(vendor as any).bank_account_number && (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Bank details missing</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Buyers cannot finalize deals until you add your bank account number.
          </p>
        </div>
        <Link
          href="/vendor/setup"
          className="shrink-0 self-center rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 no-underline"
        >
          Add now →
        </Link>
      </div>
    )}

    {/* Storefront link */}
    <div className="rounded-2xl border bg-white p-4 shadow-sm flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Your storefront</p>
        <p className="mt-0.5 text-xs text-zinc-500 font-mono truncate">
          jabumarket.com/vendors/{vendor.id}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/vendors/${vendor.id}`).catch(() => {});
          }}
          className="rounded-xl border bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
        >
          Copy link
        </button>
        <Link
          href={`/vendors/${vendor.id}`}
          className="rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 no-underline"
        >
          View →
        </Link>
      </div>
    </div>

    {/* Quick stats */}
    <NormalVendorStats vendorId={vendor.id} />

    {/* Quick links */}
    <div className="rounded-3xl border bg-white p-5 shadow-sm space-y-2">
      <p className="text-sm font-semibold text-zinc-900 mb-3">Manage</p>
      <QuickLink href="/my-listings"   icon={<Store className="h-5 w-5" />}        label="My listings" />
      <QuickLink href="/inbox"         icon={<MessageCircle className="h-5 w-5" />} label="Messages" />
      <QuickLink href="/vendor/setup"  icon={<Settings className="h-5 w-5" />}      label="Edit profile & bank details" />
      <QuickLink href={`/vendors/${vendor.id}`} icon={<ArrowRight className="h-5 w-5" />} label="View storefront" />
    </div>
  </div>
);
```

Add the `NormalVendorStats` component near the top of the file (before the main export):
```tsx
function NormalVendorStats({ vendorId }: { vendorId: string }) {
  const [stats, setStats] = useState<{ listings: number; active: number; messages: number } | null>(null);

  useEffect(() => {
    (async () => {
      const [listingsRes, convoRes] = await Promise.all([
        supabase.from('listings').select('id, status').eq('vendor_id', vendorId),
        supabase.from('conversations').select('id, vendor_unread').eq('vendor_id', vendorId),
      ]);
      const listings = listingsRes.data ?? [];
      const convos = convoRes.data ?? [];
      setStats({
        listings: listings.length,
        active: listings.filter((l: any) => l.status === 'active').length,
        messages: convos.reduce((sum: number, c: any) => sum + (c.vendor_unread ?? 0), 0),
      });
    })();
  }, [vendorId]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-2xl border bg-white p-4 shadow-sm text-center">
        <p className="text-2xl font-bold text-zinc-900">{stats.listings}</p>
        <p className="mt-0.5 text-xs text-zinc-500">Total listings</p>
      </div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm text-center">
        <p className="text-2xl font-bold text-zinc-900">{stats.active}</p>
        <p className="mt-0.5 text-xs text-zinc-500">Active now</p>
      </div>
      <div className="rounded-2xl border bg-white p-4 shadow-sm text-center">
        <p className={cn('text-2xl font-bold', stats.messages > 0 ? 'text-red-600' : 'text-zinc-900')}>{stats.messages}</p>
        <p className="mt-0.5 text-xs text-zinc-500">Unread messages</p>
      </div>
    </div>
  );
}
```

Add `MessageCircle` to the imports at the top of the file.

---

### TASK 7 — Fix vendor_type-specific quick links in the approved food dashboard

File: `app/vendor/page.tsx`

Still inside the food dashboard branch (the one with the order queue, WeekChart, BankDetailsCard), the Quick Links section hardcodes food-specific links. These are now inside `isFoodVendor === true`, so this is already correct after Task 6. No change needed here — but verify the food quick links ("Manage menu", "View orders", "Edit profile & hours") are only rendered inside the `isFoodVendor` branch.

---

### TASK 8 — Fix /vendor page pending state for normal vendors

File: `app/vendor/page.tsx`

The `if (status === 'pending')` branch renders "While you wait — get ahead" with links to `/vendor/menu` and `/vendor/setup`. This is food-only content. Normal vendors in pending state should see different content.

Wrap the "while you wait" section inside the pending block with a vendor_type check:
```tsx
{vendor.vendor_type === 'food' ? (
  /* existing food "while you wait" with menu + setup links */
) : (
  <div className="rounded-3xl border bg-white p-5 shadow-sm space-y-3">
    <p className="text-sm font-semibold text-zinc-900">While you wait — get ahead</p>
    <p className="text-sm text-zinc-500">
      Your verification is being reviewed. In the meantime, post your first listing so buyers find you straight away.
    </p>
    <Link href="/post"
      className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 no-underline hover:bg-zinc-100">
      <div className="flex items-center gap-3">
        <Store className="h-5 w-5 text-zinc-600" />
        <div>
          <p className="text-sm font-semibold text-zinc-900">Post a listing</p>
          <p className="text-xs text-zinc-500">Add a product or service to start selling</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-zinc-400" />
    </Link>
    <Link href="/vendor/setup"
      className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 no-underline hover:bg-zinc-100">
      <div className="flex items-center gap-3">
        <Settings className="h-5 w-5 text-zinc-600" />
        <div>
          <p className="text-sm font-semibold text-zinc-900">Add bank details</p>
          <p className="text-xs text-zinc-500">So buyers can pay you when a deal is agreed</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-zinc-400" />
    </Link>
  </div>
)}
```

---

### TASK 9 — Surface storefront link and bank details warning in /me

File: `app/me/_components/types.ts`

Add to the `Vendor` type:
```ts
bank_name: string | null;
bank_account_number: string | null;
bank_account_name: string | null;
```

File: `app/me/page.tsx`

The vendor select query needs to include these fields. Add to the select string:
```
bank_name, bank_account_number, bank_account_name
```

File: `app/me/_components/ContextBanner.tsx`

Add a missing bank details banner for non-food vendors. Insert this logic after the verified vendor banner check and before the study pending check:

```tsx
// Bank details warning for non-food vendors
if (roles.isVendor && vendor?.vendor_type !== 'food' && !vendor?.bank_account_number) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <span className="mt-0.5 text-lg leading-none">⚠️</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-900">Bank details missing</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Buyers cannot finalize deals until you add your bank account number.
        </p>
      </div>
      <Link
        href="/vendor/setup"
        className="shrink-0 self-center rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
      >
        Add now →
      </Link>
    </div>
  );
}
```

The priority order for banners must be:
1. Verification state banners (existing — under_review, requested, rejected, unverified)
2. Bank details warning (new — only show when NOT in an active verification state)
3. Verified + bank missing (new — show "verified but no bank" case)
4. Study pending (existing)
5. Sell CTA for non-vendors (existing)

Restructure the logic so the bank warning only shows when the verification status is NOT `under_review`, `requested`, or `rejected` — i.e. only show it when the vendor is either verified or unverified-with-no-pending-request.

---

### TASK 10 — Update OverviewTab to show full verification status and storefront link

File: `app/me/_components/OverviewTab.tsx`

The isVendor block currently shows:
```
Store: [name]
Verification: Not verified
```

Replace it with richer content for non-food vendors:

```tsx
{roles.isVendor && !roles.isFoodVendor ? (
  <div className="rounded-2xl border p-3 space-y-2">
    <div className="text-sm font-semibold text-zinc-900">Your store</div>
    <div className="text-sm text-zinc-700">
      <span className="text-zinc-500">Name:</span> <span className="font-medium">{vendor?.name ?? '—'}</span>
    </div>
    <div className="text-sm text-zinc-700">
      <span className="text-zinc-500">Verification:</span>{' '}
      <span className="font-medium">
        {vendor?.verified ? '✅ Verified'
          : vendor?.verification_status === 'requested' || vendor?.verification_status === 'under_review' ? '⏳ Under review'
          : vendor?.verification_status === 'rejected' ? '❌ Rejected'
          : 'Not verified'}
      </span>
    </div>
    {vendor?.id && (
      <Link
        href={`/vendors/${vendor.id}`}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
      >
        View your storefront →
      </Link>
    )}
  </div>
) : null}
```

---

### TASK 11 — Update QuickActions for normal vendors

File: `app/me/_components/QuickActions.tsx`

Normal vendors (non-food) currently get the generic buyer-focused card array. Add a specific non-food vendor card grid inserted before the generic fallback:

```tsx
if (roles.isVendor && !roles.isFoodVendor) {
  const vendorCards = [
    { href: '/my-listings', icon: <LayoutDashboard className="h-4 w-4" />, title: 'My listings',      desc: 'Manage your active listings' },
    { href: '/inbox',       icon: <MessageCircle className="h-4 w-4" />,   title: 'Messages',         desc: 'Buyer enquiries and orders' },
    { href: '/vendor/setup', icon: <Settings className="h-4 w-4" />,      title: 'Vendor settings',  desc: 'Profile, bank details' },
    { href: '/post',        icon: <PlusSquare className="h-4 w-4" />,      title: 'Post listing',     desc: 'Add a product or service' },
    { href: '/me?tab=verification', icon: <ShieldCheck className="h-4 w-4" />, title: 'Verification', desc: 'Upload docs & request' },
    { href: '/saved',       icon: <Bookmark className="h-4 w-4" />,        title: 'Saved items',      desc: 'Items you bookmarked' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {vendorCards.map((c) => (
        <Link key={c.title} href={c.href} className="rounded-2xl border bg-white p-3 shadow-sm transition hover:bg-zinc-50">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl border bg-white p-2">{c.icon}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900">{c.title}</div>
              <div className="mt-0.5 text-xs text-zinc-600">{c.desc}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

Add `MessageCircle, PlusSquare` to the imports at the top of the file.

---

### TASK 12 — Add suspended vendor check to storefront and food vendor grid

File: `app/vendors/[id]/page.tsx`

After loading the vendor, add a suspended check before rendering the storefront:
```ts
if ((vendor as any).suspended_at) {
  return (
    <div className="mx-auto max-w-xl pt-12 text-center px-4">
      <p className="text-lg font-semibold text-zinc-900">This store is currently unavailable</p>
      <p className="mt-2 text-sm text-zinc-500">This vendor account has been suspended.</p>
      <Link href="/explore" className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 no-underline">
        Browse other vendors →
      </Link>
    </div>
  );
}
```

The vendor select query must include `suspended_at`. Add it to the select string.

For the food vendor grid — check whether it lives in `app/food/page.tsx`, `app/food/FoodVendorGrid.tsx`, or the food tab inside `app/explore/page.tsx`. Whichever file queries food vendors, add `.is('suspended_at', null)` to exclude suspended vendors from the grid.

---

### TASK 13 — Add kitchen pause mechanism to food vendor system

This requires a DB migration. Create the migration file first, then update the UI.

Create file: `supabase/migrations/20260324_vendor_pause.sql`

```sql
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS pause_until timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reason text;
```

File: `app/vendor/page.tsx`

Add pause state near the other useState declarations:
```ts
const [pausing, setPausing] = useState(false);
```

Add a "Pause for" button row below the accepts_orders toggle button, only visible when `vendor.accepts_orders === true`. Place it inside the food dashboard branch only:

```tsx
{vendor.accepts_orders && (
  <div className="flex gap-2 px-5 pb-4 -mt-2">
    <p className="text-xs text-zinc-500 self-center mr-1">Pause for:</p>
    {[15, 30, 60].map((mins) => (
      <button
        key={mins}
        type="button"
        disabled={pausing}
        onClick={async () => {
          setPausing(true);
          const pauseUntil = new Date(Date.now() + mins * 60 * 1000).toISOString();
          await supabase
            .from('vendors')
            .update({ accepts_orders: false, pause_until: pauseUntil, pause_reason: `Paused for ${mins} min` })
            .eq('id', vendor.id);
          setVendor((prev) => prev ? { ...prev, accepts_orders: false } as VendorRow : prev);
          setPausing(false);
        }}
        className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        {mins}m
      </button>
    ))}
  </div>
)}
```

When the vendor toggles back on (accepts_orders → true in the `toggleOrders` or equivalent handler), also clear pause fields:
```ts
await supabase
  .from('vendors')
  .update({ accepts_orders: true, pause_until: null, pause_reason: null })
  .eq('id', vendor.id);
```

---

### TASK 14 — Add "after creation" onboarding redirect for normal vendors

File: `app/vendor/create/page.tsx`

Instead of `router.replace('/me')` after successful creation, redirect to `/vendor`:
```ts
router.replace('/vendor');
```

This lands the new vendor on their normal vendor dashboard (Task 6) which immediately shows the bank details warning, storefront link, and quick actions.

---

### TASK 15 — Remove /api/vendor/setup food-only guard

File: `app/api/vendor/setup/route.ts`

Read the `getVendor()` helper. It has `.eq('vendor_type', 'food')` in the vendor select query. Remove that line so all vendor types can load and save their profile data through this route.

Keep everything else in the file identical — only remove the `.eq('vendor_type', 'food')` filter.

---

## VERIFICATION CHECKLIST

After all tasks are complete, confirm each item:

- [ ] `app/me/_components/ListingsTab.tsx` — prop is `vendorId`, query uses `.eq('vendor_id', vendorId)`
- [ ] `app/me/page.tsx` — passes `vendor?.id` to ListingsTab; listings count query uses `vendorRes.data.id`
- [ ] `app/my-listings/page.tsx` — "Mark sold" button visible on active listings only, updates status inline with optimistic UI
- [ ] `app/vendor/create/page.tsx` — collects `bank_name`, `bank_account_number`, `bank_account_name`; redirects to `/vendor` after creation
- [ ] `app/vendor/register/page.tsx` — collects bank fields, includes them in food vendor insert
- [ ] `app/vendor/page.tsx` — `isFoodVendor` check gates food dashboard vs normal vendor dashboard
- [ ] `app/vendor/page.tsx` — normal vendor dashboard shows: bank warning if missing, storefront link + copy button, NormalVendorStats (listings/active/unread), quick links to my-listings/inbox/setup/storefront
- [ ] `app/vendor/page.tsx` — pending state shows food-specific "get ahead" content only when `vendor.vendor_type === 'food'`; normal vendors see post-listing + add-bank-details links
- [ ] `app/vendor/page.tsx` — food onboarding checklist includes `hasBankDetails` as fourth step; `showChecklist` checks all four
- [ ] `app/vendor/page.tsx` — "Pause 15m / 30m / 60m" buttons appear below the go-live toggle for food vendors that are currently accepting orders
- [ ] `supabase/migrations/20260324_vendor_pause.sql` — migration file created with `pause_until` and `pause_reason` columns
- [ ] `app/me/_components/types.ts` — `Vendor` type includes `bank_name`, `bank_account_number`, `bank_account_name`
- [ ] `app/me/page.tsx` — vendor select query includes bank fields
- [ ] `app/me/_components/ContextBanner.tsx` — bank warning banner shows for non-food vendors missing `bank_account_number`, with correct priority ordering (not shown when verification banner is already active)
- [ ] `app/me/_components/OverviewTab.tsx` — shows full `verification_status` text (verified/under review/rejected/not verified) and storefront link for non-food vendors
- [ ] `app/me/_components/QuickActions.tsx` — non-food vendors get vendor-specific quick action grid (my-listings, messages, vendor settings, post listing, verification, saved)
- [ ] `app/vendors/[id]/page.tsx` — suspended vendors show "unavailable" page; select query includes `suspended_at`
- [ ] Food vendor grid excludes suspended vendors (`.is('suspended_at', null)` in query)
- [ ] `app/api/vendor/setup/route.ts` — `.eq('vendor_type', 'food')` guard removed from `getVendor()`
- [ ] No TypeScript errors in any modified file
- [ ] Food vendor full flow is untouched — orders, menu management, payment confirmation, push notifications all work as before