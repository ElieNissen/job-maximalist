import JobBoard from "@/components/job-board";
import { AssistanceProvider } from "@/components/url-radar/local-assistance";

export default function HomePage() {
  return <AssistanceProvider><JobBoard /></AssistanceProvider>;
}

