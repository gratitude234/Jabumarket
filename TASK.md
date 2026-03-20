Read CLAUDE.md first. Then read these files fully before touching anything:
- app/post/page.tsx (full file — all sections, form state, publish flow)
- app/listing/[id]/page.tsx (full file — for the login gate approach)
- components/listing/AskSellerButton.tsx

List every file you will modify before starting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 1 — Reorder post form sections
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/post/page.tsx

Current order of <section> blocks:
  1. Photos
  2. Type → Category → Condition → Title → Description
  3. Price & location
  4. Quality score + preview + Publish

Target order:
  1. Type → Category → Title (essential info first)
  2. Condition (only for products — stays conditional)
  3. Description
  4. Photos (upload after knowing what you're selling)
  5. Price & location
  6. Quality score + preview + Publish

This is a structural reorder of JSX sections. The form state
(useState variables) does not change — only the render order.
The quality score checklist order should also update to match:
  Title → Description → Photo → Price → Location → Condition

After reordering, verify the section numbers in the headings
update. Currently sections are labeled "1)", "2)", "3)" etc —
update to reflect the new order.

For services (listingType === 'service'): photo should NOT be
required. Update the canPublish validation:
  Currently: imageFiles.length === 0 blocks publish
  Change to: if listingType === 'product', require at least 1 photo.
             if listingType === 'service', photo is optional.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 2 — Replace category pill grid with a searchable picker
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/post/page.tsx

Currently categories render as a wrapping flex row of toggle buttons.
With 10+ categories this becomes 3+ rows on mobile.

Replace with a native <select> element styled to match the form:

  <select
    value={category}
    onChange={(e) => setCategory(e.target.value as typeof category)}
    className="w-full rounded-2xl border bg-white px-4 py-3
      text-sm text-zinc-900 outline-none focus:ring-2
      focus:ring-black/10 appearance-none"
  >
    {CATEGORIES.map(c => (
      <option key={c} value={c}>{c}</option>
    ))}
  </select>

Wrap in a relative div with a ChevronDown icon positioned
absolute right-3 center to make it look like a custom select.

Remove the pill grid entirely. The select is mobile-native —
iOS and Android will open their native picker which is fast
and familiar. No custom dropdown needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 3 — Explain the quality score bar
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/post/page.tsx

Find the quality score section (section 4, contains the progress
bar and the checklist). Add a label above the bar:

  <p className="text-xs text-zinc-500 mb-2">
    Listing quality — better listings get more views
  </p>

In the checklist (the { done, label } array), make incomplete items
clickable so tapping them scrolls to the relevant section.

Add a ref to each section:
  const photoRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLElement>(null)
  const priceRef = useRef<HTMLElement>(null)

Attach refs to the corresponding <section> elements.

Make incomplete checklist items scroll into view on tap:
  onClick={() => photoRef.current?.scrollIntoView({ behavior: 'smooth' })}

Only scroll when the item is NOT done (done === false).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 4 — Add post-publish confirmation screen
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: app/post/page.tsx

Currently after publishing, the form redirects to the listing page.
Change the flow:

Instead of router.push('/listing/${id}'), show an inline success
state within the post page by setting a new published state:

  const [published, setPublished] = useState<{
    id: string; title: string; category: string
  } | null>(null)

After successful publish, set:
  setPublished({ id: newListingId, title, category })

When published is not null, replace the entire form with a
success screen:

  <div className="flex min-h-[60vh] flex-col items-center
    justify-center space-y-4 px-4 text-center">
    <div className="text-4xl">🎉</div>
    <h1 className="text-xl font-bold text-zinc-900">
      Your listing is live!
    </h1>
    <p className="text-sm text-zinc-600">
      "{published.title}" has been posted. Share it to get
      your first buyer faster.
    </p>

    {/* Share button — native share sheet */}
    <button
      type="button"
      onClick={() => {
        const url = `${window.location.origin}/listing/${published.id}`
        if (navigator.share) {
          navigator.share({
            title: published.title,
            text: `Check out this listing on Jabumarket: ${published.title}`,
            url,
          })
        } else {
          navigator.clipboard.writeText(url)
          // show "Link copied!" briefly
        }
      }}
      className="inline-flex items-center gap-2 rounded-2xl
        bg-black px-6 py-3 text-sm font-semibold text-white
        hover:bg-zinc-800"
    >
      <Share2 className="h-4 w-4" />
      Share this listing
    </button>

    <div className="flex gap-3">
      <Link
        href={`/listing/${published.id}`}
        className="rounded-2xl border bg-white px-4 py-2.5
          text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        View listing
      </Link>
      <button
        type="button"
        onClick={() => setPublished(null)}
        className="rounded-2xl border bg-white px-4 py-2.5
          text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
      >
        Post another
      </button>
    </div>

    <Link
      href="/my-listings"
      className="text-xs text-zinc-500 underline underline-offset-2"
    >
      Manage all listings
    </Link>
  </div>

Import Share2 from lucide-react.
When "Post another" is tapped, reset all form state back to
defaults (clear title, description, images, price, location,
condition) and clear the draft from localStorage.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK 5 — Soft login gate on Message seller
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File: components/listing/AskSellerButton.tsx

Currently when a non-logged-in user taps "Message seller",
they are immediately redirected to /login?next=/listing/[id].
This is a cold hard wall — most new users abandon here.

Change the flow:

1. On tap, check auth first (already done with supabase.auth.getUser())
2. If NOT authenticated: instead of router.push('/login...'),
   show an inline modal/panel with a "sign in to continue" prompt.

Add state: const [authWall, setAuthWall] = useState(false)

When user is not authenticated, set authWall = true instead of
redirecting.

Render the auth wall as an overlay panel (same pattern as the
offer panel — slides open below the button):

  {authWall && (
    <div className="rounded-2xl border bg-zinc-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-900">
          Sign in to message this seller
        </p>
        <button onClick={() => setAuthWall(false)}>
          <X className="h-4 w-4 text-zinc-400" />
        </button>
      </div>
      <p className="text-xs text-zinc-600">
        Create a free account in under a minute. No spam.
      </p>
      <div className="flex gap-2">
        <Link
          href={`/signup?next=/listing/${listingId}`}
          className="flex-1 rounded-2xl bg-black px-4 py-2.5
            text-sm font-semibold text-white text-center
            hover:bg-zinc-800"
        >
          Sign up free
        </Link>
        <Link
          href={`/login?next=/listing/${listingId}`}
          className="flex-1 rounded-2xl border bg-white px-4 py-2.5
            text-sm font-semibold text-zinc-900 text-center
            hover:bg-zinc-50"
        >
          Log in
        </Link>
      </div>
    </div>
  )}

Add listingId to the component props — it's already passed as a
prop, just confirm the variable name.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Implement tasks in order 1–5
- Read every file fully before editing — never assume structure
- Task 1 is structural reorder — be careful not to break form
  state or validation logic, only move JSX blocks
- No new dependencies, no `any` types
- After all tasks: list every file changed, confirm each
  task number done, flag any skipped task with reason