import { useEffect, useRef, useState } from 'react'
import heroImg from '/dj-nefke-hero.png'
import featuredTrackSrc from './assets/featured-track.mp3'
import { NefkeChat } from './NefkeChat'

const MIXCLOUD = 'https://www.mixcloud.com/nefke-van-lishout/'
const RADIO = 'https://www.themusicgalaxyradio.com/'
const SCHEDULE = 'https://www.themusicgalaxyradio.com/schedule#dataItem-l65jhzsa'
const YOUTUBE = 'https://www.youtube.com/@nefvanlishout5005'
const TIKTOK = 'https://www.tiktok.com/@nefkevl'

function NowSpinning() {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  return (
    <div className="now-spinning-bar">
      <span className="nsb-badge">NOW SPINNING</span>
      <button
        type="button"
        className={`nsb-play ${playing ? 'is-playing' : ''}`}
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>
      <div className="nsb-meta">
        <span className="nsb-title">Flat Pack — Sweet Child O'Mine</span>
      </div>
      <audio
        ref={audioRef}
        src={featuredTrackSrc}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}

const NAV_LINKS = [
  { href: '#about', label: 'Bio' },
  { href: '#mixes', label: 'Mixes' },
  { href: '#radio', label: 'Radio' },
  { href: '#booking', label: 'Booking' },
]

function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('click', close, { once: true })
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  return (
    <div className="cosmos">
      <div className="bg-poster" aria-hidden="true" style={{ backgroundImage: `url(${heroImg})` }} />
      <div className="bg-veil" aria-hidden="true" />
      <div className="starfield" aria-hidden="true" />
      <div className="aurora" aria-hidden="true" />

      <header className="nav">
        <div className="brand">
          <span className="brand-mark">★</span>
          <span>DJ NEFKE</span>
        </div>
        <nav className="nav-desktop">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href}>{label}</a>
          ))}
        </nav>
        <button
          type="button"
          className={`nav-burger ${menuOpen ? 'is-open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
        >
          <span /><span /><span />
        </button>
        {menuOpen && (
          <div className="nav-mobile" onClick={(e) => e.stopPropagation()}>
            {NAV_LINKS.map(({ href, label }) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
          </div>
        )}
      </header>

      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <h1 className="title">
              <span className="title-top">DJ</span>
              <span className="title-drip">NEFKE</span>
            </h1>
            <p className="tagline">Funk is the cosmic connection.</p>
            <p className="lede">
              Interdimensional electronic groove pirate. Broadcasting frequencies
              from hidden dimensions directly into your subconscious.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href={MIXCLOUD} target="_blank" rel="noreferrer">
                ▶ Listen on Mixcloud
              </a>
              <a className="btn btn-ghost" href={SCHEDULE} target="_blank" rel="noreferrer">
                ◐ Radio Schedule
              </a>
            </div>
            <ul className="stamps">
              <li>FUNK POWER</li>
              <li>MADE IN THE UNIVERSE</li>
              <li>COSMIC CONNECTION</li>
            </ul>
          </div>
          <div className="hero-art">
            <div className="art-frame">
              <img src={heroImg} alt="DJ NEFKE — psychedelic cosmic poster, knight helmet, mirror ball, funk power" />
            </div>
          </div>
        </div>
      </section>

      <NowSpinning />

      <section id="about" className="section about">
        <div className="section-head">
          <span className="section-num">01</span>
          <h2>Grooves From Another Dimension</h2>
        </div>
        <div className="about-body">
          <p>
            DJ NEFKE is a mysterious interdimensional electronic groove pirate,
            broadcasting frequencies from hidden dimensions directly into your
            subconscious.
          </p>
          <p>
            With a tall, smiling appearance, a classic fisherman's hat, and an
            old-school black-and-white striped prison suit, DJ NEFKE is as
            iconic as he is unpredictable. His robotic black face, lit by
            expressive, glowing eyes, mirrors the exaggerated, cartoon-inspired
            energy of his legendary sets.
          </p>
          <p>
            DJ NEFKE doesn't just play music; he creates an immersive,
            psychedelic experience that blurs the lines between reality and the
            rave. Stay tuned, keep your ears open, and prepare to be
            transported.
          </p>
        </div>
      </section>

      <section id="mixes" className="section mixes">
        <div className="section-head">
          <span className="section-num">02</span>
          <h2>Mixcloud Transmissions</h2>
        </div>
        <div className="card-grid">
          <a className="card card-mixcloud" href={MIXCLOUD} target="_blank" rel="noreferrer">
            <div className="card-icon">☁</div>
            <h3>Nefke van Lishout</h3>
            <p>Full catalog of DJ NEFKE mixes — funk, cosmic disco, electronic frequencies from another dimension.</p>
            <span className="card-link">mixcloud.com/nefke-van-lishout →</span>
          </a>
          <div className="card card-embed">
            <iframe
              title="DJ NEFKE Mixcloud"
              width="100%"
              height="120"
              src="https://player-widget.mixcloud.com/widget/iframe/?hide_cover=1&mini=1&light=1&feed=%2Fnefke-van-lishout%2F"
              frameBorder="0"
            />
            <p className="card-sub">Live widget · plays straight from Mixcloud</p>
          </div>
        </div>
      </section>

      <section id="radio" className="section radio">
        <div className="section-head">
          <span className="section-num">03</span>
          <h2>The Music Galaxy Radio</h2>
        </div>
        <div className="radio-grid">
          <a className="card card-radio" href={RADIO} target="_blank" rel="noreferrer">
            <div className="card-icon">📡</div>
            <h3>The Music Galaxy Radio</h3>
            <p>Home station of the cosmic broadcast. Streaming around the planet.</p>
            <span className="card-link">themusicgalaxyradio.com →</span>
          </a>
          <div className="card card-guest-alert">
            <div className="guest-alert-pill">TOMORROW · TUE 19 MAY</div>
            <div className="card-icon">🌟</div>
            <h3>Special Guest: DUCH</h3>
            <p>
              DUCH joins DJ NEFKE live on Radio Galaxy for a special Tuesday broadcast.
              Guest sets every Tuesday 17:00–20:00 CET.
            </p>
            <a className="card-link" href={RADIO} target="_blank" rel="noreferrer">
              Tune in on Radio Galaxy →
            </a>
          </div>
          <a className="card card-schedule" href={SCHEDULE} target="_blank" rel="noreferrer">
            <div className="card-icon">⏱</div>
            <h3>Show Schedule</h3>
            <p>Catch DJ NEFKE live on the air every week.</p>
            <ul className="schedule-times">
              <li><strong>Tuesday</strong> — 18:00–20:00 CET</li>
              <li><strong>Friday</strong> — 18:00–20:00 CET</li>
              <li className="schedule-guest"><strong>Tuesday guest slot</strong> — 17:00–20:00 CET</li>
            </ul>
            <span className="card-link">View full schedule →</span>
          </a>
        </div>
      </section>

      <section id="booking" className="section booking">
        <div className="section-head">
          <span className="section-num">04</span>
          <h2>Booking & Contact</h2>
        </div>
        <p className="booking-lede">
          Want DJ NEFKE to materialize at your event, festival, warehouse, or
          cosmic gathering? Send a transmission.
        </p>
        <div className="booking-contact">
          <p className="booking-name">Nefke Van Lishout</p>
          <div className="booking-actions">
            <a className="btn btn-primary" href="mailto:Nefconsult@gmail.com?subject=DJ%20NEFKE%20Booking%20Inquiry">
              ✉ Nefconsult@gmail.com
            </a>
            <a className="btn btn-ghost" href={MIXCLOUD} target="_blank" rel="noreferrer">
              DM via Mixcloud
            </a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <span className="footer-brand">DJ NEFKE</span>
            <span className="footer-tag">· Made in the Universe ·</span>
          </div>
          <div className="footer-links">
            <a href={MIXCLOUD} target="_blank" rel="noreferrer">Mixcloud</a>
            <a href={YOUTUBE} target="_blank" rel="noreferrer">YouTube</a>
            <a href={TIKTOK} target="_blank" rel="noreferrer">TikTok</a>
            <a href={RADIO} target="_blank" rel="noreferrer">Radio</a>
            <a href={SCHEDULE} target="_blank" rel="noreferrer">Schedule</a>
          </div>
        </div>
        <p className="copyright">© {new Date().getFullYear()} DJ NEFKE · Funk is the cosmic connection</p>
      </footer>

      <NefkeChat />
    </div>
  )
}

export default App
