import { Resend } from "resend";
import { z } from "zod";

export async function POST(request: Request) {
  if (
    process.env.REPLICA_CMS_READY !== "true" ||
    process.env.REPLICA_BUSINESS_ENABLED !== "true"
  )
    return Response.json(
      { message: "Newsletter signup is temporarily unavailable." },
      { status: 503 },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ message: "Invalid origin" }, { status: 403 });
  const parsed = z
    .object({ email: z.string().email().max(254) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { message: "Please enter a valid email address." },
      { status: 400 },
    );
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId)
    return Response.json(
      {
        message:
          "Newsletter subscriptions are not available yet. Please try again later.",
      },
      { status: 503 },
    );
  const result = await new Resend(apiKey).contacts.create({
    email: parsed.data.email,
    audienceId,
    unsubscribed: false,
  });
  if (result.error)
    return Response.json(
      { message: "Unable to subscribe right now. Please try again later." },
      { status: 502 },
    );
  return Response.json({ message: "Thank you for subscribing!" });
}
