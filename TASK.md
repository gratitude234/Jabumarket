Fix the filter UI on the Study Hub materials page (app/study/materials/page.tsx 
or the relevant client component).

Current problems:
1. "Clear all" sits on its own row above the filter chips — disconnected
2. Active filter chips ("Department of Nursing ×", "200L ×") are on a 
   separate row below — wastes vertical space and looks orphaned
3. Search bar text is truncating ("Search course code, titl") because it's 
   cramped next to Filters and Newest buttons

Fix all three like this:

--- SEARCH ROW ---
Keep the search input, Filters button, and sort button on one row.
Give the search input flex:1 with min-width:0 so it takes all available space 
and never truncates its placeholder. 
Placeholder text should just be "Search materials…" — short and clean.

--- ACTIVE FILTERS ROW ---
Only render this row when at least one filter is active.
Put "Clear all" as the FIRST item in the chips row — same line, same flex container.
Style "Clear all" as a small ghost button (border, no fill) so it reads as 
an action, not a label.
The filter chips follow it horizontally.
Make the whole row overflow-x: auto (horizontally scrollable) so chips 
never wrap to a second line.
Hide the scrollbar visually (scrollbar-width: none).

Example structure:
{hasActiveFilters && (
  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-1">
    <button onClick={clearAll} className="shrink-0 ...">Clear all</button>
    {activeFilters.map(filter => (
      <FilterChip key={filter} label={filter} onRemove={...} />
    ))}
  </div>
)}

--- CHIP STYLE ---
Active filter chips should have:
- Solid background (use the existing purple brand color with low opacity, 
  e.g. bg-[#EEEDFE])
- Border: 1px solid #5B4FD9 at low opacity
- Text: #3A2EB8 font-medium text-xs
- Remove button: small × inline, not a separate icon

Do not change any filter logic, just the layout and visual treatment.
Keep the material type pills (All, Past Q, Handout, Lecture Note, Slides) 
exactly as they are below the filter area.