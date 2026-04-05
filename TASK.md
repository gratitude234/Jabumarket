# Fix — Practice tab false active state

**File:** `app/study/_components/StudyTabs.tsx`

In the mobile tabs render loop, the inactive style has a special branch for the Practice tab that gives it a tinted indigo background and indigo text when it isn't the active page. This makes Practice look permanently active even when Q&A or another tab is selected.

Find this ternary (around line 491):

```tsx
active
  ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5] font-semibold"
  : tab.href === "/study/practice"
    ? "border-[#5B35D5]/25 bg-[#EEEDFE]/60 text-[#5B35D5] hover:bg-[#EEEDFE]"
    : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```

Replace with:

```tsx
active
  ? "border-[#5B35D5]/30 bg-[#EEEDFE] text-[#5B35D5] font-semibold"
  : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
```

## Verification
- [ ] Navigating to `/study/questions` — only Q&A tab is highlighted, Practice is neutral
- [ ] Navigating to `/study/practice` — only Practice tab is highlighted
- [ ] No `tab.href === "/study/practice"` conditional remaining in the mobile tabs render