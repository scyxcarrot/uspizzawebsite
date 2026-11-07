// POST /api/admin/outlet: change an outlet's hours or temporary closure.
import { handleOutletChange } from "@/lib/admin/changes";

export async function POST(req: Request) {
  return handleOutletChange(req);
}
