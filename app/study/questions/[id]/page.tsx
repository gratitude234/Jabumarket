// app/study/questions/[id]/page.tsx
import QuestionDetailClient from "./QuestionDetailClient";

export const metadata = {
  title: "Question • Jabu Study",
};

// NOTE: In newer Next.js versions (e.g. 15+), `params` can be a Promise in Server Components.
export default async function QuestionDetailPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <QuestionDetailClient id={id} />;
}
