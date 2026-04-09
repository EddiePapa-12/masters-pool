export default function RulesPage() {
  return (
    <div className="container">
      <div className="card">
        <h2>Rules &amp; Payout Information</h2>

        <h3>Tournament Rules</h3>
        <div className="info-box">
          <p>
            <strong>Entry Fee:</strong> $25 per entry (maximum 4 entries per
            person)
          </p>
          <p>
            <strong>Field:</strong> Split into 13 tiers based on ESPNBET odds
          </p>
          <p>
            <strong>Selection:</strong> Pick ONE golfer from each tier (13
            total)
          </p>
          <p>
            <strong>Scoring:</strong> Best 8 of 13 scores count toward final
            total
          </p>
          <p>
            <strong>Missed Cuts:</strong> +10 per round (+20 total for Saturday
            &amp; Sunday)
          </p>
        </div>

        <h3>Payout Structure</h3>
        <div className="info-box">
          <p>
            <strong>Based on 70 entries ($1,750 total pool):</strong>
          </p>
          <p>1st Place: $850</p>
          <p>2nd Place: $375</p>
          <p>3rd Place: $200</p>
          <p>4th Place: $100</p>
          <p>5th Place: $50</p>
          <p>Low Score Not in Top 4: $175</p>
        </div>
      </div>
    </div>
  );
}
