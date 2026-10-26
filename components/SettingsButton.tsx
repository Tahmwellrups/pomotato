import Link from "next/link";
import { RiSettings3Fill } from "react-icons/ri";
import { Button } from "./ui/button";

export function SettingsButton() {
  return (
    <div>
      <Button
        asChild
        variant="secondary"
        className="size-11 rounded-xl border-control-border text-base cursor-pointer motion-reduce:transition-none focus-visible:transition-none focus-visible:ring-0 focus-visible:border-control-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Link href="/settings" aria-label="Settings" className="flex items-center">
          <RiSettings3Fill className="size-4.5" />
        </Link>
      </Button>
    </div>
  );
}
