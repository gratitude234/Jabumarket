You are a Senior UI/UX Designer conducting a full visual and interaction audit of every single Study Hub page in Jabu Market — a campus super-app for Nigerian university students.
You are asking one question across every screen: does this page feel like it was designed for a JABU student on a budget Android phone, in a hurry, who doesn't fully trust digital platforms yet — or does it feel like a generic web app that happens to have study features?
Before forming a single opinion:

Read CLAUDE.md fully
Open and read every single file under:

app/study/ — every page, every nested route
app/study/_components/ — every component
app/study-admin/ — every admin page
Every shared component used exclusively or primarily by Study Hub


For every page, understand: what is the student trying to accomplish here, what is the first thing they see, and what is the one action this screen should drive them toward
Do not form any opinion about any page until you have read its full component tree


AUDIT FRAMEWORK
For every page, audit across these six dimensions:
1. First Impression (0–3 seconds)

What is the first thing a student sees above the fold on a mobile screen?
Is the purpose of this page immediately clear — or does the student have to read to understand where they are?
Is the most important action on this page the most visually prominent element?
Does the page feel like it belongs to Jabu Market — same card style, same spacing, same typography — or does it feel like a different product?

2. Navigation & Wayfinding

Can the student always tell where they are inside Study Hub?
Is the active tab or section clearly highlighted?
Can the student get to any other Study Hub section in 2 taps from here?
Is the back navigation always accessible — no trapped pages?
Does the bottom navigation remain accessible — or does the page hide it?

3. Content Hierarchy & Readability

Is the most important information the largest and highest on the page?
Is there a clear visual hierarchy — heading → subheading → body → metadata?
Is text size appropriate for mobile — minimum 14px for body, 16px for primary content?
Are labels, descriptions, and metadata in the right proportion — not competing for attention?
Is there appropriate white space — not cramped, not wasteful?

4. Interactive Elements & Tap Targets

Are all buttons, links, and tappable elements at least 44px tall?
Are touch targets spaced far enough apart that fat-finger taps don't hit the wrong element?
Is every interactive element visually distinct from static content — clear affordance?
Are pressed/active/loading/disabled states defined for every interactive element?
Is the primary CTA always visually dominant — one clear action per screen?

5. Empty States, Loading States & Error States

What does this page look like with zero data — blank or coached?
Is there a loading skeleton that matches the real content layout — not a generic spinner?
Is there an error state that explains what went wrong and what to do next?
Does the empty state teach the student what this page is for and how to fill it?

6. Mobile-First Execution

Is every element reachable with one thumb on a standard-size phone?
Does the layout work on a 360px wide screen — no horizontal overflow?
Do any inputs get hidden behind the keyboard when focused?
Is scrolling smooth — no layout jumps when new content loads?
Are images lazy-loaded — no layout shift on slow connections?


PAGES TO AUDIT — every single one
Core Study Hub pages:

/study — Study Hub home
/study/materials — Materials listing
/study/materials/[id] — Material detail
/study/practice — Practice home
/study/practice/[setId] — Quiz session
/study/questions — Q&A forum listing
/study/questions/[id] — Question detail
/study/questions/new — Ask a question
/study/leaderboard — Leaderboard
/study/onboarding — Study preferences setup
/study/apply-rep — Course Rep application
/study/library or /study/bookmarks — Saved items
/study/ai-plan — AI study plan
/study/tutors — Tutor directory
/study/search — Search results
/study/history — Practice history
/study/gpa — GPA calculator (if exists)

Study Admin pages:

/study-admin/ — Admin home
/study-admin/import — Material import tool
/study-admin/materials — Material approval queue
/study-admin/reps — Rep application review
Any other admin sub-pages


FOR EVERY PAGE, GIVE ME:
Page: /study/[route]
Purpose: What the student is trying to accomplish here
Above the fold (mobile): Describe exactly what a student sees in the first viewport on a 390px screen — no scrolling
🔴 Critical UX failures — the student cannot complete the core task because of these
🟡 Important improvements — friction that slows the student or reduces trust
🟢 Polish — small changes that make the page feel premium and purposeful
The one thing that must change: If you could only fix one thing on this page — what is it and why?

CROSS-CUTTING AUDIT
After auditing every individual page, give me a cross-system view:
Design Consistency Audit:

Are card styles (border radius, shadow, padding) identical across all Study Hub pages — or are there variations between materials cards, practice cards, and Q&A cards?
Is the typography scale consistent — same heading sizes, same body sizes, same metadata sizes everywhere?
Is the color system consistent — same primary, secondary, and destructive colors used the same way on every page?
Are button styles consistent — same border radius, same padding, same font weight across all CTAs?
Are section labels (the small uppercase tracking-wide labels above sections) styled identically everywhere?
Do loading skeletons match the real content layout on every page — or are some pages using generic spinners?
Are empty states consistent in structure — icon, heading, description, CTA — across all pages?

Navigation Consistency Audit:

Is StudyTabs rendered correctly and consistently across every Study Hub page?
Is the active tab highlighted correctly on every page — no pages where no tab appears selected?
Are there any pages that break out of the Study Hub navigation — losing the tab bar unexpectedly?
Is the "More" sheet consistent — same items in the same order on every page?
Is the mobile search bar shown/hidden consistently across all Study Hub routes?

Mobile Interaction Audit:

Walk through Study Hub entirely on a 390px screen — list every element that overflows, wraps awkwardly, or becomes inaccessible
Are there any tap targets smaller than 44px across any Study Hub page?
Are there any forms where the keyboard hides the submit button or active input?
Are there any pages where the bottom navigation is hidden or covered by page content?
Are there any pages with horizontal scroll that shouldn't have it?

Visual Weight Audit:

On every page — is there one clear primary action, or are multiple actions competing for equal visual weight?
Are there any pages where destructive actions (delete, remove, cancel) are styled the same as primary actions?
Are there any pages overusing bold text — so much that nothing stands out?
Are there any pages with insufficient contrast — text too light against background?

Information Architecture Audit:

Is the Study Hub navigation hierarchy logical — do the tabs represent what students actually use most?
Should Q&A be a primary tab — or is leaderboard/due-today more valuable in the primary nav?
Are the most important features (materials, practice, due today) reachable in 1 tap from the home — or buried?
Is there any content that exists but is only accessible through the "More" sheet — and should be promoted?


FINAL DELIVERABLE
The Full Page-by-Page Audit:
Every page with its critical failures, important improvements, and polish items — structured exactly as described above
The Top 20 UI/UX Fixes:
The 20 most impactful visual and interaction changes across all Study Hub pages — in priority order, with the exact page and component each fix applies to
The Consistency Score:
Rate Study Hub design consistency 1–10 across:

Card components
Typography
Color usage
Button styles
Empty states
Loading states
Navigation

For every score below 8 — list every specific inconsistency found
The Mobile Audit Score:
Rate the mobile experience 1–10. List every specific issue that's pulling the score down — by page, by component, by element
The Navigation Verdict:
Is the current Study Hub tab structure optimal for a Nigerian student during exam season? If not — what should the primary tabs be and why?
The First Impression Test:
A student opens Study Hub for the first time. They've never used it before. Describe what they see and feel in the first 5 seconds on 5 different pages — home, materials, practice, Q&A, and leaderboard. For each: is it immediately clear what this page is for and what to do next?
The Single Biggest UX Failure:
Across all Study Hub pages — the one screen or interaction that causes the most confusion, friction, or drop-off. Describe it in detail and give the exact fix.
The bar: Every Study Hub page should pass this test — a JABU student in a noisy lecture hall, on a budget Android phone, with 3G signal, should be able to open any Study Hub page and immediately know where they are, what to do next, and how to get back. Does every page pass? If not — show me every failure, screen by screen."

Run /plan first. Open every page file before commenting on it. Never describe a page you haven't read. Go screen by screen, component by component. 🔥