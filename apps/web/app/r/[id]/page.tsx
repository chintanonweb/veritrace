import Link from "next/link";
import { notFound } from "next/navigation";
import { verifyRecord } from "@veritrace/verifier";
import { getStore } from "../../../lib/seed";

export const dynamic = "force-dynamic";

function short(s: string, n = 22) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const record = store.get(id);
  if (!record) notFound();

  const v = verifyRecord(record);
  const r = record.receipt;
  const anchor = record.anchor;

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="dot" /> VeriTrace</div>
        <div className="meta">public receipt · {id}</div>
      </header>

      <div className="stage">
        {/* ── the receipt ── */}
        <div className="receipt">
          <div className="r-head">
            <div className="r-brand">VeriTrace</div>
            <div className="r-tag">AI Decision Receipt</div>
          </div>

          <dl>
            <dt>Agent</dt><dd>{r.agent}</dd>
            <dt>Action</dt><dd>{r.action}</dd>
            <dt>Model</dt><dd>{r.model}</dd>
            <dt>Version</dt><dd>{r.modelVersion}</dd>
            <dt>Trace</dt><dd>{r.traceId}</dd>
            <dt>Time</dt><dd>{r.createdAt}</dd>
          </dl>

          <div className="hr" />

          <dl>
            <dt>Input&nbsp;#</dt><dd>{short(r.inputHash)}</dd>
            <dt>Output&nbsp;#</dt><dd>{short(r.outputHash)}</dd>
          </dl>

          <div className="hr" />
          <div className="total">
            <span>SIGNED</span>
            <span>{short(record.signature, 18)}</span>
          </div>

          <div className="foot">
            Ed25519 · {anchor ? `Merkle root ${short(anchor.merkleRoot, 14)}` : "not anchored"}
            <br />keep this receipt — verify it anywhere, anytime
          </div>

          <div className={`stamp ${v.ok ? "" : "bad"}`}>{v.ok ? "Verified" : "Altered"}</div>
        </div>

        {/* ── verdict panel ── */}
        <aside className="panel">
          <div className="kicker" style={{ marginBottom: 4 }}>Independent verification</div>
          <div className={`verdict-big ${v.ok ? "ok" : "bad"}`}>
            {v.ok ? "✓ Verified" : "✗ Failed"}
          </div>
          <div className="verdict-sub">
            {v.ok
              ? "This is exactly what the AI did. Nothing has been altered."
              : v.error ?? "This receipt was altered after it was signed."}
          </div>

          <div className="check">
            <span className={`ic ${v.checks.signature ? "ok" : "bad"}`}>{v.checks.signature ? "✓" : "✗"}</span>
            <span className="lbl">Signature<small>Ed25519 — authentic & untampered</small></span>
          </div>
          <div className="check">
            <span className={`ic ${v.checks.anchored ? "ok" : anchor ? "bad" : "wait"}`}>
              {v.checks.anchored ? "✓" : anchor ? "✗" : "○"}
            </span>
            <span className="lbl">
              Merkle inclusion
              <small>{anchor ? "provably part of an anchored batch" : "not yet anchored"}</small>
            </span>
          </div>
          <div className="check">
            <span className={`ic ${anchor?.arweaveTxId ? "ok" : "wait"}`}>{anchor?.arweaveTxId ? "✓" : "○"}</span>
            <span className="lbl">
              Permanence
              <small>{anchor?.arweaveTxId ? "Arweave + on-chain root" : "Arweave/chain publish: roadmap"}</small>
            </span>
          </div>

          <div className="trustline">
            No VeriTrace account was used to check this. Re-run it yourself:
          </div>
          <div className="cmd">
            <span className="p">$</span> npx @veritrace/verifier verify {id}
          </div>
        </aside>
      </div>

      <Link className="back" href="/">← back to the ledger</Link>

      <footer>VeriTrace · the record is cryptographically certain; the verdict is transparent and re-runnable.</footer>
    </div>
  );
}
