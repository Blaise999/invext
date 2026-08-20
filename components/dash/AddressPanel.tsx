import QRCode from "qrcode";
import CopyButton from "./CopyButton";

/**
 * Deposit addresses issued to this account.
 *
 * Shows ONLY addresses already assigned to this user, and renders the QR
 * server-side so no address passes through client JS. If none exists it says
 * so rather than falling back to a shared one — a single address shared
 * between users makes deposits unattributable, and matching by amount fails
 * the first time two people send the same figure.
 *
 * An address on its own moves nothing. Credit happens only through the signed
 * webhook or an explicit approval in the back office queue.
 */
export default async function AddressPanel({
  addresses,
}: {
  addresses: {
    id: string; asset: string; network: string; address: string; memo: string | null;
  }[];
}) {
  if (addresses.length === 0) {
    return (
      <div className="blank">
        <p className="blank__lead">No deposit address issued.</p>
        <p className="blank__body">
          Addresses are issued per account from the custody provider. Until one
          is assigned there is nowhere to send to — and nothing shared between
          accounts to send to by mistake.
        </p>
      </div>
    );
  }

  const cards = await Promise.all(
    addresses.map(async (a) => ({
      a,
      svg: await QRCode.toString(a.address, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
        color: { dark: "#0b0b0d", light: "#e8e6e0" },
      }),
    })),
  );

  return (
    <>
      <div className="dep">
        {cards.map(({ a, svg }) => (
          <article className="dep__card" key={a.id}>
            <header className="dep__head">
              <span className="tbl__sym">{a.asset}</span>
              <span className="mono dep__net">{a.network}</span>
            </header>

            <div className="dep__qr" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mono dep__addr">{a.address}</p>
            <CopyButton value={a.address} />
            {a.memo && <p className="mono dep__memo">Memo required: {a.memo}</p>}
          </article>
        ))}
      </div>

      <p className="dnote mono">
        Send only the named asset on the named network to its own address.
        Cross-chain sends are unrecoverable. Nothing reaches your buying power
        until the deposit is confirmed — an address is a destination, not a
        credit.
      </p>
    </>
  );
}
