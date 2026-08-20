import Link from "next/link";

export default function NotFound() {
  return (
    <div className="blank">
      <p className="blank__lead">We don&rsquo;t carry that ticker.</p>
      <p className="blank__body">
        InveXt lists seven securities. Anything else — including the private
        names — has no quote to show and nothing to trade.{" "}
        <Link href="/dashboard/market">Back to the market</Link>.
      </p>
    </div>
  );
}
