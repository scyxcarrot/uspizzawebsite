// POST /api/admin/item: change an item's price, description or sold-out status.
import { handleItemChange } from "@/lib/admin/changes";

export async function POST(req: Request) {
  return handleItemChange(req);
}
