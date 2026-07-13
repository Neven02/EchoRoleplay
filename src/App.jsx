import { useEffect, useMemo, useState } from 'react'

const logoPath = '/echo-city-logo-transparent.png?v=3'

const products = [
  {
    id: 'org',
    name: 'Organizacija',
    price: 0.10,
    category: 'Server paket',
    image: '/shop/customorg-v3.png',
    imageAlt: 'Echo City organizacija',
    description: 'Osnovni paket za ekipu koja zeli krenuti sa svojom pricom na Echo City roleplay serveru.',
    features: ['Naziv organizacije', 'Start lokacija', 'Discord rank za vodju', 'Dogovor oko pravila i limita']
  },
  {
    id: 'custom-car',
    name: 'Custom auto',
    price: 35,
    category: 'Vozila',
    image: '/shop/customauto.png',
    imageAlt: 'Custom auto',
    description: 'Ubaci posebno vozilo za svoj karakter ili organizaciju uz prethodnu provjeru modela.',
    features: ['Provjera optimizacije', 'Custom handling po dogovoru', 'Jedan slot za vozilo', 'Support pri ubacivanju']
  },
  {
    id: 'ped',
    name: 'Custom ped',
    price: 30,
    category: 'Karakter',
    image: '/shop/customped-v2.png',
    imageAlt: 'Custom ped',
    description: 'Personalizirani ped za igraca koji zeli prepoznatljiv izgled u gradu.',
    features: ['Provjera kompatibilnosti', 'Dodavanje u server pack', 'Osnovni test animacija', 'Promjena po dogovoru']
  },
  {
    id: 'plates',
    name: 'Custom tablice',
    price: 10,
    category: 'Ostalo',
    image: '/shop/customplates-v2.png',
    imageAlt: 'Custom tablice',
    description: 'Unikatne tablice za tvoje vozilo, uz provjeru dostupnosti i pravila servera.',
    features: ['Do 8 znakova', 'Provjera dostupnosti', 'Jedna promjena nakon kupnje', 'Aktivacija nakon potvrde']
  },
  {
    id: 'phone',
    name: 'Broj mobitela in-game',
    price: 10,
    category: 'Ostalo',
    image: '/shop/customnumber-v3.png',
    imageAlt: 'Custom broj mobitela',
    description: 'Rezerviraj poseban broj mobitela koji mozes koristiti u roleplay prici.',
    features: ['Custom broj po zelji', 'Provjera dostupnosti', 'Povezivanje s likom', 'Brza aktivacija']
  },
  {
    id: 'bump-glide',
    name: 'Bump + glide na auto',
    price: 50,
    category: 'Vozila',
    image: '/shop/custombump.png',
    imageAlt: 'Bump i glide za auto',
    description: 'Dodavanje bumpa i glidea na vozilo za igrace koji zele poseban stil voznje i show efekat.',
    features: ['Bump setup po dogovoru', 'Glide podesavanje', 'Testiranje na serveru', 'Aktivacija nakon potvrde']
  }
]

const defaultConfig = {
  paypalMode: 'sandbox',
  paypalConfigured: false,
  paypalReady: false,
  discordReady: false,
  western: {
    receiver: 'TVOJE IME I PREZIME',
    country: 'Hrvatska'
  }
}

function ProductCard({ product, quantity, onAdd, onRemove }) {
  const hasImage = product.image?.startsWith('/')

  return (
    <article className="product-card">
      <div className={`product-image ${hasImage ? 'has-photo' : ''}`}>
        {hasImage ? <img src={product.image} alt={product.imageAlt || product.name} /> : <span>{product.image}</span>}
      </div>
      <div className="product-body">
        <div className="product-kicker">{product.category}</div>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <ul>
          {product.features.map((feature) => <li key={feature}>{feature}</li>)}
        </ul>
      </div>
      <div className="product-actions">
        <strong>{product.price.toFixed(2)} EUR</strong>
        {quantity ? (
          <div className="quantity-control" aria-label={`Kolicina za ${product.name}`}>
            <button type="button" onClick={() => onRemove(product.id)}>-</button>
            <span>{quantity} u kosarici</span>
            <button type="button" onClick={() => onAdd(product.id)}>+</button>
          </div>
        ) : (
          <button type="button" className="primary-button" onClick={() => onAdd(product.id)}>
            Dodaj u kosaricu
          </button>
        )}
      </div>
    </article>
  )
}

function App() {
  const [cart, setCart] = useState({})
  const [payment, setPayment] = useState('paypal')
  const [checkoutTab, setCheckoutTab] = useState('cart')
  const [config, setConfig] = useState(defaultConfig)
  const [buyer, setBuyer] = useState({ discord: '', ingame: '', note: '' })
  const [western, setWestern] = useState({ senderName: '', senderCountry: '', mtcn: '' })
  const [proofFile, setProofFile] = useState(null)
  const [checkoutStatus, setCheckoutStatus] = useState('')
  const [checkoutError, setCheckoutError] = useState('')
  const [loading, setLoading] = useState(false)

  const cartItems = useMemo(() => products
    .filter((product) => cart[product.id])
    .map((product) => ({ ...product, quantity: cart[product.id], total: cart[product.id] * product.price })),
    [cart])

  const total = cartItems.reduce((sum, item) => sum + item.total, 0)
  const cartPayload = cartItems.map((item) => ({ id: item.id, quantity: item.quantity }))

  useEffect(() => {
    fetch('/api/config')
      .then((response) => response.ok ? response.json() : defaultConfig)
      .then(setConfig)
      .catch(() => setConfig(defaultConfig))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paypalResult = params.get('paypal')
    const pendingOrder = localStorage.getItem('echoCityPendingPayPal')

    if (!paypalResult || !pendingOrder) return

    if (paypalResult === 'cancel') {
      setCheckoutError('PayPal placanje je otkazano.')
      localStorage.removeItem('echoCityPendingPayPal')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    const capturePendingPayPal = async () => {
      setLoading(true)
      setCheckoutError('')
      setCheckoutStatus('Provjeravam PayPal uplatu...')

      try {
        const stored = JSON.parse(pendingOrder)
        const response = await fetch('/api/paypal/capture-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stored)
        })
        const data = await response.json()

        if (!response.ok) throw new Error(data.error || 'PayPal uplata nije potvrdjena.')

        setCart({})
        setBuyer({ discord: '', ingame: '', note: '' })
        setCheckoutStatus(data.discord?.sent
          ? 'PayPal uplata je potvrdjena i narudzba je poslana staffu na Discord.'
          : 'PayPal uplata je potvrdjena, ali Discord webhook jos nije konfiguriran.')
        localStorage.removeItem('echoCityPendingPayPal')
        window.history.replaceState({}, '', window.location.pathname)
      } catch (error) {
        setCheckoutError(error.message)
      } finally {
        setLoading(false)
      }
    }

    capturePendingPayPal()
  }, [])

  const addToCart = (id) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }))
    setCheckoutTab('cart')
  }

  const removeFromCart = (id) => {
    setCart((current) => {
      const nextQuantity = (current[id] || 0) - 1
      if (nextQuantity <= 0) {
        const { [id]: removed, ...rest } = current
        return rest
      }

      return { ...current, [id]: nextQuantity }
    })
  }

  const validateCheckout = () => {
    if (!cartItems.length) return 'Dodaj barem jedan paket u kosaricu.'
    if (!buyer.discord.trim()) return 'Unesi Discord ime.'
    if (!buyer.ingame.trim()) return 'Unesi in-game ime.'
    return ''
  }

  const handlePayPalCheckout = async () => {
    const validationError = validateCheckout()
    if (validationError) {
      setCheckoutError(validationError)
      return
    }

    setLoading(true)
    setCheckoutError('')
    setCheckoutStatus('Kreiram PayPal narudzbu...')

    try {
      const response = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer, cart: cartPayload })
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'PayPal narudzba nije kreirana.')
      if (!data.approvalLink) throw new Error('PayPal nije vratio link za placanje.')

      localStorage.setItem('echoCityPendingPayPal', JSON.stringify({
        orderId: data.orderId,
        buyer,
        cart: cartPayload
      }))
      window.location.href = data.approvalLink
    } catch (error) {
      setCheckoutError(error.message)
      setCheckoutStatus('')
      setLoading(false)
    }
  }

  const handleWesternSubmit = async () => {
    const validationError = validateCheckout()
    if (validationError) {
      setCheckoutError(validationError)
      return
    }

    if (!western.senderName.trim() || !western.mtcn.trim() || !proofFile) {
      setCheckoutError('Za Western Union unesi posiljatelja, MTCN i dodaj dokaz uplate.')
      return
    }

    setLoading(true)
    setCheckoutError('')
    setCheckoutStatus('Saljem Western Union narudzbu staffu...')

    try {
      const formData = new FormData()
      formData.append('buyer', JSON.stringify(buyer))
      formData.append('cart', JSON.stringify(cartPayload))
      formData.append('senderName', western.senderName)
      formData.append('senderCountry', western.senderCountry)
      formData.append('mtcn', western.mtcn)
      formData.append('proof', proofFile)

      const response = await fetch('/api/western-union/order', {
        method: 'POST',
        body: formData
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Western Union narudzba nije poslana.')

      setCart({})
      setProofFile(null)
      setWestern({ senderName: '', senderCountry: '', mtcn: '' })
      setBuyer({ discord: '', ingame: '', note: '' })
      setCheckoutStatus(data.discord?.sent
        ? 'Western Union narudzba i dokaz uplate poslani su staffu na Discord.'
        : 'Narudzba je spremljena, ali Discord webhook jos nije konfiguriran.')
    } catch (error) {
      setCheckoutError(error.message)
      setCheckoutStatus('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shop-page">
      <header className="shop-header">
        <a className="brand" href="#top" aria-label="Echo City pocetna">
          <span className="brand-logo">
            <img src={logoPath} alt="Echo City Roleplay logo" />
            <span>EC</span>
          </span>
          <span>
            <strong>Echo City</strong>
            <small>Roleplay donacije</small>
          </span>
        </a>
        <nav aria-label="Glavna navigacija">
          <a href="#paketi">Paketi</a>
          <a href="#checkout" onClick={() => setCheckoutTab('payment')}>Placanje</a>
          <a href="#pravila">Pravila</a>
        </nav>
        <a className="discord-link" href="#checkout" onClick={() => setCheckoutTab('cart')}>
          Kosarica {cartItems.length ? `(${cartItems.reduce((sum, item) => sum + item.quantity, 0)})` : ''}
        </a>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-content">
            <p className="eyebrow">Echo City Roleplay</p>
            <h1>Shop za donacije, custom vozila i RP dodatke.</h1>
            <p>
              Moderno, pregledno i brzo: odaberi paket, provjeri kosaricu, izaberi PayPal ili Western Union i posalji
              dokaz uplate staff timu. Slike proizvoda mozes ubaciti kasnije u pripremljena mjesta.
            </p>
            <div className="hero-actions">
              <a className="primary-button" href="#paketi">Pogledaj pakete</a>
              <a className="secondary-button" href="#placanje">Nacini placanja</a>
            </div>
          </div>
          <div className="hero-panel" aria-label="Server status">
            <div className="hero-logo-card">
              <img src={logoPath} alt="Echo City Roleplay logo" />
              <span>EC</span>
            </div>
            <h2>Echo City</h2>
            <p>Roleplay grad s urbanim stilom</p>
            <div className="hero-stats">
              <b>PayPal</b>
              <b>Western Union</b>
              <b>Rucna aktivacija</b>
            </div>
          </div>
        </section>

        <section className="notice-strip" aria-label="Upute prije kupnje">
          <div>
            <strong>Kako radi?</strong>
            <span>Dodaj paket u kosaricu, uplati iznos i posalji dokaz staffu.</span>
          </div>
          <div>
            <strong>Aktivacija</strong>
            <span>Paketi se aktiviraju rucno nakon provjere uplate.</span>
          </div>
          <div>
            <strong>Dogovor</strong>
            <span>Custom auto, ped i organizacija idu uz provjeru pravila servera.</span>
          </div>
        </section>

        <div className="shop-layout">
          <section id="paketi" className="catalog-section" aria-label="Donacijski paketi">
            <div className="section-head">
              <p className="eyebrow">Katalog</p>
              <h2>Paketi za Echo City community</h2>
            </div>
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={cart[product.id] || 0}
                  onAdd={addToCart}
                  onRemove={removeFromCart}
                />
              ))}
            </div>
          </section>

          <aside id="checkout" className="checkout-panel" aria-label="Kosarica">
            <div className="checkout-sticky">
              <div className="checkout-head">
                <div>
                  <p className="eyebrow">Checkout</p>
                  <h2>{checkoutTab === 'cart' ? 'Tvoja kosarica' : 'Placanje'}</h2>
                </div>
                <span>{total.toFixed(2)} EUR</span>
              </div>

              <div className="checkout-tabs" role="tablist" aria-label="Checkout koraci">
                <button
                  type="button"
                  className={checkoutTab === 'cart' ? 'active' : ''}
                  onClick={() => setCheckoutTab('cart')}
                >
                  Kosarica
                </button>
                <button
                  type="button"
                  className={checkoutTab === 'payment' ? 'active' : ''}
                  onClick={() => setCheckoutTab('payment')}
                  disabled={!cartItems.length}
                >
                  Placanje
                </button>
              </div>

              {checkoutTab === 'cart' && (
                <div className="cart-tab">
                  {cartItems.length ? (
                    <>
                      <div className="cart-list">
                        {cartItems.map((item) => (
                          <div className="cart-item detailed" key={item.id}>
                            <div>
                              <strong>{item.name}</strong>
                              <small>{item.quantity} x {item.price.toFixed(2)} EUR</small>
                            </div>
                            <div className="cart-item-side">
                              <b>{item.total.toFixed(2)} EUR</b>
                              <div className="mini-quantity" aria-label={`Kolicina za ${item.name}`}>
                                <button type="button" onClick={() => removeFromCart(item.id)}>-</button>
                                <span>{item.quantity}</span>
                                <button type="button" onClick={() => addToCart(item.id)}>+</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="cart-total">
                        <span>Ukupno za placanje</span>
                        <strong>{total.toFixed(2)} EUR</strong>
                      </div>
                      <button type="button" className="primary-button wide" onClick={() => setCheckoutTab('payment')}>
                        Nastavi na placanje
                      </button>
                    </>
                  ) : (
                    <div className="empty-cart empty-cart-panel">
                      <strong>Kosarica je prazna.</strong>
                      <span>Dodaj paket iz kataloga i ovdje ces vidjeti sve stavke prije placanja.</span>
                    </div>
                  )}
                </div>
              )}

              {checkoutTab === 'payment' && (
                <>
              <div id="placanje" className="payment-box">
                <h3>Nacin placanja</h3>
                <div className="payment-tabs" role="tablist" aria-label="Nacini placanja">
                  {[
                    ['paypal', { title: 'PayPal' }],
                    ['western', { title: 'Western Union' }]
                  ].map(([key, info]) => (
                    <button
                      key={key}
                      type="button"
                      className={payment === key ? 'active' : ''}
                      onClick={() => setPayment(key)}
                    >
                      {info.title}
                    </button>
                  ))}
                </div>
                <div className="payment-details">
                  {payment === 'paypal' ? (
                    <>
                      <strong>PayPal automatski checkout</strong>
                      <p>Placas direktno preko PayPala. Nakon potvrde shop automatski salje staffu narudzbu s PayPal dokazom.</p>
                      <span>
                        Status: {config.paypalReady
                          ? `spreman (${config.paypalMode})`
                          : config.paypalConfigured
                            ? `PayPal kljucevi ne odgovaraju za ${config.paypalMode} mode`
                            : 'treba ubaciti PayPal API podatke u .env'}
                      </span>
                      <span>Discord: {config.discordReady ? 'narudzbe se salju staffu' : 'treba ubaciti Discord webhook u .env'}</span>
                    </>
                  ) : (
                    <>
                      <strong>Western Union poluautomatski</strong>
                      <p>Uplatis Western Unionom, upises MTCN i dodas dokaz. Staff rucno provjerava uplatu prije aktivacije.</p>
                      <span>Primatelj: {config.western.receiver}</span>
                      <span>Drzava: {config.western.country}</span>
                    </>
                  )}
                </div>
              </div>

              <form className="buyer-form">
                <label>
                  Discord ime
                  <input
                    type="text"
                    placeholder="npr. EchoCity#0001"
                    value={buyer.discord}
                    onChange={(event) => setBuyer((current) => ({ ...current, discord: event.target.value }))}
                  />
                </label>
                <label>
                  In-game ime
                  <input
                    type="text"
                    placeholder="Ime Prezime"
                    value={buyer.ingame}
                    onChange={(event) => setBuyer((current) => ({ ...current, ingame: event.target.value }))}
                  />
                </label>
                <label>
                  Napomena
                  <textarea
                    placeholder="Npr. zeljene tablice, broj mobitela ili link do modela auta"
                    rows="3"
                    value={buyer.note}
                    onChange={(event) => setBuyer((current) => ({ ...current, note: event.target.value }))}
                  />
                </label>
                {payment === 'western' && (
                  <>
                    <label>
                      Ime posiljatelja
                      <input
                        type="text"
                        placeholder="Ime i prezime s Western Union uplate"
                        value={western.senderName}
                        onChange={(event) => setWestern((current) => ({ ...current, senderName: event.target.value }))}
                      />
                    </label>
                    <label>
                      Drzava posiljatelja
                      <input
                        type="text"
                        placeholder="npr. Hrvatska"
                        value={western.senderCountry}
                        onChange={(event) => setWestern((current) => ({ ...current, senderCountry: event.target.value }))}
                      />
                    </label>
                    <label>
                      MTCN kod
                      <input
                        type="text"
                        placeholder="Western Union MTCN"
                        value={western.mtcn}
                        onChange={(event) => setWestern((current) => ({ ...current, mtcn: event.target.value }))}
                      />
                    </label>
                    <label>
                      Dokaz uplate
                      <input type="file" accept="image/*,.pdf" onChange={(event) => setProofFile(event.target.files?.[0] || null)} />
                    </label>
                  </>
                )}
                {checkoutError && <div className="checkout-message error">{checkoutError}</div>}
                {checkoutStatus && <div className="checkout-message success">{checkoutStatus}</div>}
                {payment === 'paypal' ? (
                  <button type="button" className="primary-button wide" onClick={handlePayPalCheckout} disabled={loading || !cartItems.length}>
                    {loading ? 'Obrada...' : 'Plati PayPalom'}
                  </button>
                ) : (
                  <button type="button" className="primary-button wide" onClick={handleWesternSubmit} disabled={loading || !cartItems.length}>
                    {loading ? 'Saljem...' : 'Posalji Western Union dokaz'}
                  </button>
                )}
              </form>
                </>
              )}
            </div>
          </aside>
        </div>

        <section id="pravila" className="rules-section">
          <div>
            <p className="eyebrow">Info</p>
            <h2>Pravila i napomena</h2>
          </div>
          <p>
            Donacije pomazu odrzavanju servera. Paketi se ne aktiviraju automatski nego nakon provjere uplate i dogovora
            sa staff timom. Custom sadrzaj mora biti optimiziran i uskladjen s pravilima Echo City roleplay servera.
          </p>
        </section>
      </main>

      <footer className="shop-footer">
        <span>Copyright 2026 Echo City Roleplay</span>
        <span>PayPal</span>
        <span>Western Union</span>
        <span>Support putem Discorda</span>
      </footer>
    </div>
  )
}

export default App
