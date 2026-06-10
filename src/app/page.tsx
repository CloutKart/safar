import { GroupCreator } from "@/components/group-creator";

const steps = [
  ["01", "Create the room", "Safar mints a shareable trip-room link. Send it to your travellers — no app, no account."],
  ["02", "Just talk normally", "English, Hindi, Hinglish — your group chat becomes a living trip brief in real time."],
  ["03", "Correct the summary", "Anyone can ask for a recap. Members fix misunderstandings and a majority approves."],
  ["04", "Choose a real plan", "Safar researches hidden gems, checks prices, posts three plans, and tallies the room's votes."],
];

const interests = [
  "haunted trails",
  "cafe hopping",
  "trekking",
  "adventure sports",
  "street food",
  "nightlife",
  "slow travel",
  "heritage",
];

export default function Home() {
  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#top" aria-label="Safar home">
          <span className="brand-mark">S</span>
          <span>Safar</span>
        </a>
        <a className="nav-link" href="#how-it-works">
          How it works
        </a>
      </header>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">The group chat finally has a trip planner</p>
          <h1>
            Plan the trip
            <span> without planning a meeting.</span>
          </h1>
          <p className="hero-lede">
            Spin up a free Safar room and share the link. Keep chatting as usual.
            It catches budgets, dates, constraints, and everyone&apos;s wildly
            different idea of fun, then turns the conversation into three plans
            you can actually vote on.
          </p>
          <div className="interest-strip" aria-label="Supported interests">
            {interests.map((interest) => (
              <span key={interest}>{interest}</span>
            ))}
          </div>
        </div>
        <GroupCreator />
      </section>

      <section className="conversation shell" aria-label="Example conversation">
        <div className="phone">
          <div className="phone-top">
            <span className="avatar">S</span>
            <div>
              <strong>Goa alternatives?</strong>
              <small>6 in the room · Safar listening</small>
            </div>
          </div>
          <div className="chat">
            <p className="bubble incoming">Cafe hopping is non-negotiable for me ☕</p>
            <p className="bubble outgoing">Mujhe thoda trekking bhi chahiye yaar</p>
            <p className="bubble incoming">Budget max 12k per person. Delhi se.</p>
            <p className="bubble bot">
              <strong>Safar</strong>
              Got it: cafes + a moderate trek, under ₹12k from Delhi. I still
              need the trip length before I compare destinations.
            </p>
          </div>
        </div>
        <div className="conversation-copy">
          <p className="eyebrow">Active, not annoying</p>
          <h2>It listens for decisions, not keywords.</h2>
          <p>
            Safar only turns first-person statements into personal preferences.
            Jokes, forwards, and “Rohan hates hiking” do not become hard facts.
            When the group is stuck, it asks one useful question and then gets
            out of the way.
          </p>
          <div className="proof-grid">
            <div><strong>6h</strong><span>coordinator cooldown</span></div>
            <div><strong>30d</strong><span>raw chat retention</span></div>
            <div><strong>3</strong><span>distinct plans per vote</span></div>
          </div>
        </div>
      </section>

      <section className="steps shell" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">One chat, one shared truth</p>
          <h2>From “where should we go?” to a majority decision.</h2>
        </div>
        <div className="step-grid">
          {steps.map(([number, title, body]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="privacy shell">
        <div>
          <p className="eyebrow">Memory with an off switch</p>
          <h2>Ask what Safar remembers. Delete it in the same chat.</h2>
        </div>
        <div className="command-list">
          <code>what do you remember about me</code>
          <code>forget trekking</code>
          <code>forget me</code>
        </div>
      </section>

      <footer className="footer shell">
        <span>Safar · Conversation-native group travel</span>
        <span>Free, self-hosted web rooms · India-first</span>
      </footer>
    </main>
  );
}
