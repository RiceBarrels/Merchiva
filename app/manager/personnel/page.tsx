import { redirect } from "next/navigation";

// The Personnel hub is split across dedicated routes (schedule / team / roles /
// training). The index simply lands on the schedule tab.
export default function PersonnelIndexPage() {
  redirect("/manager/personnel/schedule");
}
