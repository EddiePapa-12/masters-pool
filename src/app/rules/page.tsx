export default function RulesPage() {
  return (
    <div className="container">
      <div className="card">
        <h2>Rules &amp; Payout Information</h2>

        {/* ── Tournament Rules ─────────────────────────────────── */}
        <h3>Tournament Rules</h3>
        <div className="info-box">
          <p>
            <strong>Entry Fee:</strong> $25 per entry (maximum 4 entries per person)
          </p>
          <p>
            <strong>Player Tier Breakdowns:</strong> The field is split into 13 tiers
            based on{" "}
            <a
              href="https://docs.google.com/spreadsheets/d/1PFPSgsHLqgCVFBDb26fPGEKhinCfZ8G3MXh-Nms7sPU/edit?gid=0#gid=0"
              target="_blank"
              rel="noopener noreferrer"
              className="rules-link"
            >
              FanDuel odds on 4/5/2026
            </a>
            .
          </p>
          <p>
            <strong>Selection:</strong> Pick ONE golfer from each tier (13 total)
          </p>
          <p>
            <strong>Scoring Rules:</strong> Best 8 of 13 scores count toward final total
          </p>
          <p>
            <strong>Missed Cuts:</strong> +10 per round (+20 total for Saturday &amp; Sunday)
          </p>
          <p>
            <strong>Tie Breaker Rules:</strong> In the event of a tie, closest to the
            final winning score (either direction), with a tie going to the person who
            picked on the high side. In the event of a clean tie, winnings for that
            slot are split evenly amongst the tied teams.
          </p>
        </div>

        {/* ── Entry Information ────────────────────────────────── */}
        <h3>Entry Information</h3>
        <div className="info-box">
          <p>
            <a
              href="https://docs.google.com/spreadsheets/d/1khuiT7of7X1MBnoCwIKSAlpaT2GDdpJIhcxbx7MPAqU/edit?gid=0#gid=0"
              target="_blank"
              rel="noopener noreferrer"
              className="rules-link"
            >
              Entries
            </a>{" "}
            with a timestamp up to <strong>~6:35 AM on Thursday</strong> were
            accepted. Total entries: <strong>114 teams</strong> with a total purse of{" "}
            <strong>$2,800.00</strong>.
          </p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#666" }}>
            All payments for the weekend will be made on Monday (4/13) to allow a
            final audit to ensure everything is accurate and calculated correctly.
            Email if you find an error or would like to protest.
          </p>
        </div>

        {/* ── Payout Structure ─────────────────────────────────── */}
        <h3>Payout Structure</h3>
        <div className="info-box">
          <table className="payout-table">
            <tbody>
              <tr className="payout-total-row">
                <td>Total Pot</td>
                <td>$2,800.00</td>
              </tr>
              <tr className="payout-deduction-row">
                <td>IT Fees (Vercel Pro Plan)</td>
                <td>−$20.00</td>
              </tr>
              <tr className="payout-deduction-row">
                <td>Round 1 Winner</td>
                <td>−$100.00</td>
              </tr>
              <tr className="payout-deduction-row">
                <td>Round 2 Winner</td>
                <td>−$100.00</td>
              </tr>
              <tr className="payout-deduction-row">
                <td>Round 3 Winner</td>
                <td>−$100.00</td>
              </tr>
              <tr className="payout-deduction-row">
                <td>Last Place</td>
                <td>−$100.00</td>
              </tr>
              <tr className="payout-divider-row">
                <td colSpan={2}></td>
              </tr>
              <tr>
                <td><strong>🥇 1st Place</strong></td>
                <td><strong>$1,405.00</strong></td>
              </tr>
              <tr>
                <td>🥈 2nd Place</td>
                <td>$500.00</td>
              </tr>
              <tr>
                <td>🥉 3rd Place</td>
                <td>$150.00</td>
              </tr>
              <tr>
                <td>4th Place</td>
                <td>$75.00</td>
              </tr>
              <tr>
                <td>5th Place</td>
                <td>$75.00</td>
              </tr>
              <tr>
                <td>6th Place</td>
                <td>$50.00</td>
              </tr>
              <tr>
                <td>7th Place</td>
                <td>$50.00</td>
              </tr>
              <tr>
                <td>8th Place</td>
                <td>$25.00</td>
              </tr>
              <tr>
                <td>9th Place</td>
                <td>$25.00</td>
              </tr>
              <tr>
                <td>10th Place</td>
                <td>$25.00</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Weekend Winners ──────────────────────────────────── */}
        <h3>Weekend Winners 🏆</h3>
        <div className="info-box">
          <p>
            <strong>Round 1 Winner:</strong> HNicholas — Heston Nicholas
          </p>
          <p>
            <strong>Round 2 Winner:</strong> TBD
          </p>
          <p>
            <strong>Round 3 Winner:</strong> TBD
          </p>
          <p>
            <strong>Last Place:</strong> TBD
          </p>
        </div>
      </div>
    </div>
  );
}
