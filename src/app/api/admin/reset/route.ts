// POST /api/admin/reset: put the menu and outlets back to the original data.
import { handleReset } from "@/lib/admin/changes";

export async function POST(req: Request) {
  return handleReset(req);
}
