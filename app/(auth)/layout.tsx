import Link from "next/link";
import Brand from "@/components/Brand";
import AuthAside from "@/components/auth/AuthAside";
import { privateMarksEnabled } from "@/lib/preview";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__panel">
        <div className="auth__top">
          <Link href="/" className="brandlink" aria-label="InveXt home">
            <Brand size={26} />
          </Link>
          {privateMarksEnabled() && (
            <span className="mono auth__pv">Private marks</span>
          )}
        </div>

        <div className="auth__body">{children}</div>

        <p className="auth__foot mono">
          Open to United States residents, 18 and over. Private company coverage
          becomes available as agreements are put in place.
        </p>
      </div>

      <AuthAside />
    </div>
  );
}