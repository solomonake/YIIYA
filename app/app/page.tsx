"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { YiiyaWorkspace } from "@/components/yiiya-workspace";
import { useSpeechInterpreter } from "@/lib/use-speech-interpreter";

function AutoSubmit() {
  const params = useSearchParams();
  const { submitManualTranscript } = useSpeechInterpreter();
  const submitted = useRef(false);

  useEffect(() => {
    const prompt = params.get("prompt");
    if (prompt && !submitted.current) {
      submitted.current = true;
      const timer = setTimeout(() => submitManualTranscript(prompt), 500);
      return () => clearTimeout(timer);
    }
  }, [params, submitManualTranscript]);

  return null;
}

export default function AppPage() {
  return (
    <>
      <YiiyaWorkspace />
      <Suspense>
        <AutoSubmit />
      </Suspense>
    </>
  );
}
