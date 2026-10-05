DROP POLICY IF EXISTS "courses readable" ON public.courses;
CREATE POLICY "courses readable" ON public.courses FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "lectures readable" ON public.lectures;
CREATE POLICY "lectures readable" ON public.lectures FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = lectures.course_id));

DROP POLICY IF EXISTS "assessments readable" ON public.assessments;
CREATE POLICY "assessments readable" ON public.assessments FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.assessment_questions aq WHERE aq.assessment_id = assessments.id));

DROP POLICY IF EXISTS "aq readable" ON public.assessment_questions;
CREATE POLICY "aq readable" ON public.assessment_questions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.lectures l JOIN public.assessments a ON a.lecture_id = l.id WHERE a.id = assessment_questions.assessment_id));

DROP POLICY IF EXISTS "questions readable" ON public.questions;
CREATE POLICY "questions readable" ON public.questions FOR SELECT TO authenticated
USING (private.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.assessment_questions aq WHERE aq.question_id = questions.id));

DROP POLICY IF EXISTS "lecture files read" ON storage.objects;
CREATE POLICY "lecture files read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lecture-files' AND (private.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.lectures l WHERE l.file_url IS NOT NULL AND position(objects.name in l.file_url) > 0)));