DO $$
DECLARE
  law_faculty_id uuid;
  base_sort integer;
BEGIN
  SELECT id
    INTO law_faculty_id
  FROM public.study_faculties
  WHERE lower(trim(name)) = 'college of law'
  LIMIT 1;

  IF law_faculty_id IS NULL THEN
    RAISE NOTICE 'College of Law faculty not found; skipping active department enforcement.';
    RETURN;
  END IF;

  SELECT coalesce(max(sort_order), 0)
    INTO base_sort
  FROM public.study_departments
  WHERE faculty_id = law_faculty_id;

  INSERT INTO public.study_departments (id, faculty_id, name, sort_order, is_active)
  SELECT gen_random_uuid(), law_faculty_id, 'Department of Jurisprudence and Public Law', base_sort + 10, true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.study_departments
    WHERE faculty_id = law_faculty_id
      AND lower(trim(name)) = lower('Department of Jurisprudence and Public Law')
  );

  INSERT INTO public.study_departments (id, faculty_id, name, sort_order, is_active)
  SELECT gen_random_uuid(), law_faculty_id, 'Department of Private and Commercial Law', base_sort + 20, true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.study_departments
    WHERE faculty_id = law_faculty_id
      AND lower(trim(name)) = lower('Department of Private and Commercial Law')
  );

  UPDATE public.study_departments
  SET is_active = lower(trim(name)) IN (
    lower('Department of Jurisprudence and Public Law'),
    lower('Department of Private and Commercial Law')
  )
  WHERE faculty_id = law_faculty_id;

  UPDATE public.study_departments
  SET name = 'College of Law (legacy combined)'
  WHERE faculty_id = law_faculty_id
    AND is_active = false
    AND lower(trim(name)) IN ('college of law', 'law', 'department of law');
END $$;
