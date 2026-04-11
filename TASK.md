In app/study/materials/[id]/MaterialDetailClient.tsx, the bottom navigation bar 
is showing through and interrupting the quiz sheet UI when it's open.

Find where the quiz sheet / bottom sheet is rendered (the genQsSheetOpen state 
controls this). When that sheet is open, hide the bottom navigation bar.

The bottom nav is most likely rendered in the layout file — check:
- app/study/layout.tsx
- app/layout.tsx
- components/BottomNav.tsx (or similar name)

The fix: when the quiz sheet is open (genQsSheetOpen === true), add a class or 
data attribute to the document body that hides the bottom nav. Clean it up when 
the sheet closes.

Implementation approach:
- In MaterialDetailClient.tsx, use a useEffect that watches genQsSheetOpen
- When true: document.body.setAttribute('data-hide-nav', 'true')
- When false/unmount: document.body.removeAttribute('data-hide-nav')
- In the bottom nav component (or its parent layout), add:
  body[data-hide-nav='true'] & { display: none } 
  or use a className toggle

If Tailwind is used for the nav, add this to the nav component:
  className="... [[data-hide-nav=true]_&]:hidden"

Also apply the same logic to any other quiz-related full-screen states — 
if there is a quizState variable managing "config" | "quiz" | "results" states 
(from the recent quiz mode refactor), hide the nav whenever 
quizState !== "idle" as well, not just when genQsSheetOpen is true.

Do not hide the nav on any other page or state. Only during the quiz sheet.