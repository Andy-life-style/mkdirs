export async function GET() {
  const cms = process.env.REPLICA_CMS_READY !== "false";
  return Response.json({
    google:
      cms &&
      Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    github:
      cms &&
      Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET),
  });
}
