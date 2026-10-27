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
  const checked = stored.map((s) => ({
    id: s.id,
    action: s.record.receipt.action,
    agent: s.record.receipt.agent,
    model: s.record.receipt.model,
    ok: verifyRecord(s.record).ok,
  }));
  // Round-robin across actions so the ledger shows breadth (refund, trade,
  // deploy, KYC) instead of seven near-identical rows from the last seeded agent.
  const buckets = new Map<string, typeof checked>();
  for (const c of checked) {
    const arr = buckets.get(c.action) ?? [];
    arr.push(c);
    buckets.set(c.action, arr);
  }
  const recent: typeof checked = [];
  for (let i = 0; recent.length < 7 && i < buckets.size; i++) {
    for (const b of buckets.values()) {
      const item = b[i];
      if (item && recent.length < 7) recent.push(item);
    }
  }
  const genuine = checked.find((r) => r.ok);
  const tampered = checked.find((r) => !r.ok);
  const totalVerified = board.reduce((a, b) => a + b.verifiedActions, 0);

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="dot" /> VeriTrace</div>
        <div className="meta">receipts · for AI decisions</div>
      </header>

      <section className="hero">
        <div className="kicker">Receipts for AI decisions</div>
        <h1>
          Your AI made a decision.<br />
          Can you <span className="em">prove</span> it?
        </h1>
        <p className="lede">
          An AI approved a refund, moved money, or shipped code. Months later someone asks what
          happened — and the only record is a log line you could edit. VeriTrace gives every AI
          decision a <b>receipt that cannot be quietly changed</b>, and anyone can check it in
          seconds, <b>without an account and without trusting us</b>.
        </p>
        <div className="btnrow">
          <Link className="btn solid" href={genuine ? `/r/${genuine.id}` : "#how"}>
            See a real receipt →
          </Link>
          <Link className="btn warn" href={tampered ? `/r/${tampered.id}` : "#how"}>
            See a tampered one →
          </Link>
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          No signup, no email. Both open in the browser and re-check themselves while you watch.
        </p>
      </section>

      {/* ── plain-English explainer ── */}
      <div className="eyebrow" id="how">What this is · the 30-second version</div>
      <div className="steps">
        <div className="step">
          <span className="num">01</span>
          <h3>An AI does something</h3>
          <p>
            It approves a refund, blocks an account, or deploys code. Today the only record is a
            log line — and whoever controls the log can change it later, with no trace.
          </p>
        </div>
        <div className="step">
          <span className="num">02</span>
          <h3>VeriTrace seals a receipt</h3>
          <p>
            Each decision gets a receipt holding a <b>fingerprint</b> of what went in and what came
            out, a timestamp, the exact model version — then a cryptographic wax seal over the
            whole thing.
          </p>
        </div>
        <div className="step">
          <span className="num">03</span>
          <h3>Anyone can check the seal</h3>
          <p>
            No account, no API key, no phone call to us. Change one character anywhere in the
            receipt and the seal breaks — visibly, for everyone, forever.
          </p>
        </div>
      </div>

      {/* ── try it ── */}
      <div className="eyebrow" id="try">Try it yourself · 60 seconds</div>
      <div className="trygrid">
        <Link href={genuine ? `/r/${genuine.id}` : "#ledger"} className="trycard ok">
          <span className="tagok">✓ Genuine</span>
          <h3>Open a real receipt</h3>
          <p>
            One decision from a demo agent. Signature, batch membership and the judge’s verdict
            all check out.
          </p>
          <span className="go">Inspect it →</span>
        </Link>
        <Link href={tampered ? `/r/${tampered.id}` : "#ledger"} className="trycard bad">
          <span className="tagbad">✗ Tampered</span>
          <h3>Open a tampered one</h3>
          <p>
            Same kind of receipt, but the output was edited after signing. Watch the check fail
            and tell you exactly which layer caught it.
          </p>
          <span className="go">Watch it fail →</span>
        </Link>
      </div>
      <p className="hint">
        Both receipts are produced by the real open-source SDK — signed, Merkle-batched and
        verdict-signed for real. The underlying decisions are <b>demo data</b>, not customer
        traffic. The cryptography is genuine; the business is a demonstration.
      </p>

      {/* ── Verified AI Score leaderboard ── */}
      <div className="eyebrow">
        Verified AI Score · {totalVerified.toLocaleString()} verified actions · demo data
      </div>
      <p className="hint" style={{ marginTop: -6, marginBottom: 16 }}>
        How often each agent’s decisions were judged correct. Only receipts that still pass
        verification are counted, so a doctored receipt cannot improve its own score.
      </p>
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

      <div className="eyebrow" id="ledger">Receipt ledger · verified live, on every page load</div>
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

      <p className="lede" style={{ marginTop: 18, fontSize: 13 }}>
        Green means the signature still matches. Click any row to see the receipt itself and every
        check it went through — including the deliberately <b style={{ color: "var(--alarm)" }}>altered</b>{" "}
        one, whose signature no longer matches. Scores are computed live from verified receipts
        only, and a tampered receipt’s self-reported verdict is never trusted.
      </p>

      <footer>
        VeriTrace · open-source · sign → batch → anchor → independently verify. The record is
        cryptographically certain; the verdict is transparent and re-runnable.
      </footer>
    </div>
  );
}
