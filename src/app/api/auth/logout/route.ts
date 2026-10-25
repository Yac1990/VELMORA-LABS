import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionFromRequest } from "@/lib/auth";
import { audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = sessionFromRequest(req);
  if (session) await audit(session, "auth.logout", "profile", session.uid);
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
