import { adsTxt } from "@/lib/ads";

export const dynamic = "force-static";

export function GET() {
  return new Response(adsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
