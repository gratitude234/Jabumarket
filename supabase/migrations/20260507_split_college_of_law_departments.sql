DO $$
DECLARE
  law_faculty_id uuid;
  base_sort integer;
  legacy_department_id uuid;
  legacy_name_taken boolean;
BEGIN
  SELECT id
    INTO law_faculty_id
  FROM public.study_faculties
  WHERE lower(trim(name)) = 'college of law'
  LIMIT 1;

  IF law_faculty_id IS NULL THEN
    RAISE NOTICE 'College of Law faculty not found; skipping department split.';
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

  SELECT id
    INTO legacy_department_id
  FROM public.study_departments
  WHERE faculty_id = law_faculty_id
    AND lower(trim(name)) NOT IN (
      lower('Department of Jurisprudence and Public Law'),
      lower('Department of Private and Commercial Law'),
      lower('College of Law (legacy combined)')
    )
    AND (
      lower(trim(name)) IN ('college of law', 'law', 'department of law')
      OR (
        lower(name) LIKE '%jurisprudence%'
        AND lower(name) LIKE '%private%'
        AND lower(name) LIKE '%commercial%'
      )
    )
  ORDER BY is_active DESC NULLS LAST, sort_order NULLS LAST, name
  LIMIT 1;

  IF legacy_department_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.study_departments
      WHERE faculty_id = law_faculty_id
        AND id <> legacy_department_id
        AND lower(trim(name)) = lower('College of Law (legacy combined)')
    )
      INTO legacy_name_taken;

    UPDATE public.study_departments
    SET name = CASE
          WHEN legacy_name_taken THEN name
          ELSE 'College of Law (legacy combined)'
        END,
        is_active = false
    WHERE id = legacy_department_id;
  END IF;

  UPDATE public.study_departments
  SET is_active = false
  WHERE faculty_id = law_faculty_id
    AND lower(trim(name)) = lower('College of Law (legacy combined)');
END $$;
