import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Vonage custom E2EE feasibility</CardTitle>
          <CardDescription>
            Isolated tests for encoded-frame encryption on the Vonage Video API. This page does not use Vonage&apos;s built-in encryption secret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/vonage-e2ee-poc">Open the POC</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
