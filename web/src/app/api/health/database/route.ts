import { connectToDatabase } from "@/lib/db";

export async function GET() {
  try {
    await connectToDatabase();

    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}