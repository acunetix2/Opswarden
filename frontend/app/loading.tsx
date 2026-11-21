import { LogoMark } from "@/components/layout/logo";

export default function RootLoading() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading OpsWarden">
      <LogoMark tone="dark" className="size-9" />
    </div>
  );
}
