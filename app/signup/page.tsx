import { Suspense } from "react";
import SignupClient from "./SignupClient";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-md space-y-2">
          <h1 className="text-xl font-semibold">Create account</h1>
          <p className="text-sm text-zinc-600">Loading…</p>
        </div>
      }
    >
      <SignupClient />
    </Suspense>
  );
}
