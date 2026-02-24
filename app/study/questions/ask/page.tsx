// app/study/questions/ask/page.tsx
import { Suspense } from "react";
import AskQuestionClient from "./AskQuestionClient";

export const metadata = {
  title: "Ask a Question • Jabu Study",
};

export default function AskQuestionPage() {
  // AskQuestionClient uses useSearchParams(), which requires a Suspense boundary
  // to avoid prerender errors during static generation.
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6" />}>
      <AskQuestionClient />
    </Suspense>
  );
}
