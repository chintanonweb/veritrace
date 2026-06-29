import Link from "next/link";
import { verifyRecord } from "@veritrace/verifier";
import { computeLeaderboard } from "@veritrace/score";
import { getStore } from "../lib/seed";

export const dynamic = "force-dynamic";

function pct(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

export default async function Home() {
  const store = await getStore();
  const stored = store.list();
  const records = stored.map((s) => s.record);

  const board = computeLeaderboard(records, (r) => verifyRecord(r).ok);
  const recent = stored.slice(0, 7).map((s) => ({
    id: s.id,
    action: s.record.receipt.action,
    agent: s.record.receipt.agent,
    model: s.record.receipt.model,
    ok: verifyRecord(s.record).ok,
  }));
  const totalVerified = board.reduce((a, b) => a + b.verifiedActions, 0);

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="dot" /> VeriTrace</div>
        <div className="meta">verifiable receipts · for AI agents</div>
      </header>

      <section className="hero">
        <div className="kicker">Stripe receipts for AI agents</div>
        <h1>
          Your AI made a decision.<br />
          Can you <span className="em">prove</span> it?
        </h1>
        <p className="lede">
          When an AI agent approves a refund, executes a trade, or ships code, VeriTrace creates a{" "}
          <b>signed, tamper-proof receipt</b> of exactly what happened — anchored permanently and{" "}
          <b>verifiable by anyone</b>, with no account and zero trust in VeriTrace or the model vendor.
        </p>
        <div className="btnrow">
          <Link className="btn solid" href={recent[0] ? `/r/${recent[0].id}` : "#ledger"}>
            Inspect a live receipt →
          </Link>
          <a className="btn" href="https://arweave.org" target="_blank" rel="noreferrer">
            Anchored on Arweave
          </a>
        </div>
      </section>

      {/* ── Verified AI Score leaderboard ── */}
      <div className="eyebrow">
        Verified AI Score · {totalVerified.toLocaleString()} verified actions
      </div>
      <div className="board">
        {board.map((a, i) => (
          <div className="card" key={a.agent}>
            <div className="card-top">
              <span className="rank">#{i + 1}</span>
              <span className="agent">{a.agent}</span>
            </div>
            <div className="metric">
              <span className="big">{pct(a.successRate)}</span>
              <span className="mlabel">success rate</span>
            </div>
            <div className="statline">
              <span><b>{a.verifiedActions.toLocaleString()}</b> verified</span>
              <span><b>{pct(a.integrity)}</b> integrity</span>
            </div>
            <div className="bar"><span style={{ width: pct(a.successRate === null ? 0 : a.successRate) }} /></div>
            <div className="conf">avg confidence {pct(a.avgConfidence)}</div>
          </div>
        ))}
      </div>

      <div className="eyebrow" id="ledger">Receipt ledger · live verification</div>
      <div className="ledger">
        {recent.map((r) => (
          <Link key={r.id} href={`/r/${r.id}`} className="row">
            <div>
              <div className="action">{r.action}</div>
              <div className="sub">
                {r.agent} · {r.model} · <span className="idc">{r.id}</span>
              </div>
            </div>
            <span className={`badge ${r.ok ? "ok" : "bad"}`}>{r.ok ? "✓ verified" : "✗ altered"}</span>
          </Link>
        ))}
      </div>

      <p className="lede" style={{ marginTop: 22, fontSize: 13 }}>
        Every row is a real receipt produced by the SDK and Merkle-anchored. Click any one to
        verify it yourself — including the deliberately <b style={{ color: "var(--alarm)" }}>altered</b> one,
        whose signature no longer matches. Scores are computed live from verified receipts only —
        a tampered receipt&apos;s self-reported verdict is never trusted.
      </p>

      <footer>
        VeriTrace · open-source · sign → batch → anchor → independently verify. The record is
        cryptographically certain; the verdict is transparent and re-runnable.
      </footer>
    </div>
  );
}
