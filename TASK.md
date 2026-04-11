The /api/ai/save-generated-questions route is returning {"error":"Failed to save 
questions."} — visible in the network tab on the results screen.

The root cause is likely a Supabase schema mismatch: the route is trying to insert 
source_material_id or due_at columns that don't exist yet in the quiz_sets table.

Do the following:

1. Open app/api/ai/save-generated-questions/route.ts and add a console.error that 
   logs the full Supabase error object (not just a generic message) so we can see 
   the exact column or constraint that's failing. The log should print the full 
   error like: console.error('[save-generated-questions] supabase error:', error)

2. Check what columns the route is trying to insert into quiz_sets. For any new 
   columns (source_material_id, due_at) that were added as part of the recent 
   refactor, make the insert defensive:
   - Only include source_material_id in the insert if the column exists, OR
   - Wrap the new fields in a try/catch fallback that retries the insert without 
     those fields if the first attempt fails with a column-not-found error

3. Write a Supabase migration (as a plain SQL comment block at the top of the 
   route file, clearly labelled "Run this in Supabase SQL editor") to add the 
   missing columns:
   
   ALTER TABLE quiz_sets ADD COLUMN IF NOT EXISTS source_material_id uuid REFERENCES study_materials(id) ON DELETE SET NULL;
   ALTER TABLE quiz_sets ADD COLUMN IF NOT EXISTS due_at timestamptz DEFAULT (now() + interval '1 day');

4. After the migration comment, ensure the insert uses these columns correctly.

Do not change any other routes. The quiz generation and quiz mode are working fine.