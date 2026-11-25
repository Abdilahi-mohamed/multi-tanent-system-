import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Gauge,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MessageCircle,
  Package,
  PackagePlus,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  WalletCards
} from "lucide-react";
import { SiGmail, SiGithub, SiWhatsapp } from "react-icons/si";
import { FaLinkedin } from "react-icons/fa";
import ContactSection from "../components/ContactSection";
import "./landing.css";

export const metadata = {
  title: "Vendora — Business Management & E-commerce Platform",
  description: "Manage products, inventory, orders, customers, and your online store with Vendora's multi-tenant business platform."
};

const solutions = [
  { icon: Shirt, title: "Fashion & clothing", detail: "Manage collections, sizes, colors, and seasonal stock." },
  { icon: Smartphone, title: "Electronics", detail: "Keep products, variants, and orders organized in one place." },
  { icon: Sparkles, title: "Beauty & cosmetics", detail: "Showcase your range in a polished, easy-to-shop storefront." },
  { icon: ShoppingBasket, title: "Grocery & retail", detail: "Stay on top of everyday inventory and incoming orders." },
  { icon: Boxes, title: "Wholesale", detail: "Keep a clear view of your catalog and business activity." },
  { icon: Globe2, title: "Online businesses", detail: "Share your store link and serve customers wherever they shop." }
];

const features = [
  { icon: LayoutDashboard, title: "Business dashboard", detail: "See your business overview and move between key tasks from one centralized workspace." },
  { icon: Package, title: "Product management", detail: "Organize images, categories, sizes, colors, prices, and SKUs in a structured catalog." },
  { icon: Boxes, title: "Inventory management", detail: "Track stock and product variations, with low-stock visibility to help you stay prepared." },
  { icon: Store, title: "Online storefront", detail: "Publish a professional, shareable store that gives customers a place to browse and shop." },
  { icon: ClipboardList, title: "Order management", detail: "Review incoming orders, update statuses, and keep fulfillment moving." },
  { icon: BarChart3, title: "Sales analytics", detail: "Understand sales activity and business performance with clear reports and visual summaries." },
  { icon: CreditCard, title: "Payment settings", detail: "Configure supported payment methods for your business and manage them in one place." },
  { icon: MessageCircle, title: "Customer communication", detail: "Keep customer conversations and order-related support connected to your business." }
];

const steps = [
  { icon: Users, title: "Create your business account", detail: "Your platform administrator sets up and authorizes your business workspace." },
  { icon: Store, title: "Set up your online store", detail: "Add your business details and shape a storefront that feels like your brand." },
  { icon: PackagePlus, title: "Add products and configure", detail: "Build your catalog, organize inventory, and configure your business settings." },
  { icon: TrendingUp, title: "Manage orders and sales", detail: "Share your store, receive orders, and manage day-to-day activity from your dashboard." }
];

const advantages = [
  { icon: BriefcaseBusiness, title: "Your own business space", detail: "Every business has an independent dashboard and workspace." },
  { icon: Gauge, title: "One clear overview", detail: "Bring products, orders, stock, and analytics together." },
  { icon: Store, title: "A storefront to share", detail: "Give customers a dedicated online store URL to browse." },
  { icon: ShieldCheck, title: "Access with clear boundaries", detail: "Secure sign-in keeps each business's tools and data in its own workspace." },
  { icon: Activity, title: "Useful business insights", detail: "See business activity and sales information where you manage your work." },
  { icon: Globe2, title: "Built to grow with you", detail: "A multi-tenant platform supports multiple independent businesses." }
];

const faqs = [
  { question: "What is Vendora?", answer: "Vendora is a multi-tenant business and e-commerce platform. It gives each authorized business its own dashboard, product catalog, inventory, order management, analytics, payment settings, and online storefront." },
  { question: "How can I create a business account?", answer: "Business accounts are created and managed by Vendora's platform administrators. Public self-registration for business accounts is not available. Contact your platform administrator to request access." },
  { question: "Does every business get its own dashboard?", answer: "Yes. Each business account has a dedicated workspace for its own products, inventory, orders, customers, and business settings." },
  { question: "Can I create my own online store?", answer: "Yes. An authorized business can set up its own storefront and share its store link with customers." },
  { question: "Can I manage products and inventory?", answer: "Yes. Business owners can organize products and variations, manage stock, and see low-stock visibility from their dashboard." },
  { question: "Does Vendora support multiple payment methods?", answer: "Payment integrations are configured at the business level. Available methods depend on the providers enabled for your business." },
  { question: "Can I access my business dashboard from mobile devices?", answer: "The Vendora web app is responsive and can be accessed from modern mobile and desktop browsers." },
  { question: "How do I contact support?", answer: "Sign in to your business account and open its support area to start or follow a conversation with the platform team." }
];

function Brand({ footer = false }) {
  return (
    <Link className={`landing-brand${footer ? " landing-brand-footer" : ""}`} href="/" aria-label="Vendora home">
      <Image src="/vendora-brand-mark.png" alt="" width={42} height={42} loading={footer ? "lazy" : "eager"} />
      <span><strong>vendora</strong><small>BUSINESS, IN MOTION</small></span>
    </Link>
  );
}

function StorefrontPreview() {
  const products = [
    { title: "Everyday tote", price: "$36", oldPrice: "$48", icon: ShoppingBag, className: "art-tote", label: "Bestseller" },
    { title: "Classic shirt", price: "$42", oldPrice: "", icon: Shirt, className: "art-shirt", label: "New" },
    { title: "City backpack", price: "$58", oldPrice: "$72", icon: BriefcaseBusiness, className: "art-pack", label: "Sale" }
  ];

  return (
    <div className="store-preview" aria-label="Illustrative independent Vendora business storefront">
      <div className="store-browser-bar"><span /><span /><span /><small>your-business.vendora.store</small><ExternalLinkIcon /></div>
      <div className="store-page">
        <header className="store-header">
          <div className="store-identity"><span className="store-logo">N</span><span><b>North & Needle</b><small>Everyday pieces, thoughtfully made.</small></span></div>
          <div className="store-nav-links"><span>Shop</span><span>About</span><span>Contact</span></div>
          <span className="store-cart"><ShoppingBag size={15} /><i>2</i></span>
        </header>
        <div className="store-category-row"><span className="selected">All products</span><span>Accessories</span><span>Clothing</span><span>New arrivals</span></div>
        <div className="store-welcome"><div><small>THE EVERYDAY EDIT</small><h3>Made for your<br />kind of day.</h3><span>Explore the collection <ArrowRight size={13} /></span></div><div className="welcome-illustration"><ShoppingBag size={74} strokeWidth={1.05} /></div></div>
        <div className="store-products-heading"><div><b>Shop the collection</b><small>Illustrative products and prices</small></div><span>View all <ArrowRight size={12} /></span></div>
        <div className="store-product-grid">
          {products.map(({ title, price, oldPrice, icon: Icon, className, label }) => (
            <article className="store-product" key={title}>
              <div className={`product-art ${className}`}><span className="product-tag">{label}</span><Icon size={56} strokeWidth={1.15} /></div>
              <b>{title}</b><span className="product-price">{price} {oldPrice && <del>{oldPrice}</del>}</span>
              <button type="button" aria-label={`Add ${title} to cart`}><ShoppingBag size={12} /> Add to cart</button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExternalLinkIcon() {
  return <ArrowUpRight size={12} aria-hidden="true" />;
}

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Brand />
          <nav className="landing-nav" aria-label="Main navigation">
            <a href="#home">Home</a>            <a href="#features">Features</a><a href="#solutions">Solutions</a>
            <a href="#pricing">Pricing</a><a href="#contact">Contact</a>
          </nav>
          <div className="landing-header-actions">
            <Link className="login-link" href="/login">Log in</Link>
            <Link className="landing-button landing-button-primary nav-cta" href="/register-company">Create Account <ArrowRight size={15} /></Link>
          </div>
          <details className="landing-mobile-menu">
            <summary aria-label="Open navigation menu"><Menu size={21} /></summary>
            <nav aria-label="Mobile navigation">
              <a href="#home">Home</a>              <a href="#features">Features</a><a href="#solutions">Solutions</a>
              <a href="#pricing">Pricing</a><a href="#contact">Contact</a>
              <Link href="/login">Log in to your workspace <ArrowRight size={15} /></Link>
            </nav>
          </details>
        </div>
      </header>

      <section className="hero-section" id="home">
        <div className="hero-grid-pattern" aria-hidden="true" />
        <div className="hero-copy">
          <div className="eyebrow"><span><Sparkles size={13} /></span> THE BUSINESS PLATFORM THAT MOVES WITH YOU</div>
          <h1>Everything Your Business Needs to <span>Sell, Manage, and Grow.</span></h1>
          <p>Vendora is an all-in-one business management and e-commerce platform that helps you manage your products, inventory, orders, customers, and online store from one powerful dashboard.</p>
          <div className="hero-actions">
            <Link className="landing-button landing-button-primary" href="/register-company">Create Account <ArrowRight size={16} /></Link>
            <a className="landing-button landing-button-quiet" href="#features">Explore features <ArrowDownRight size={16} /></a>
          </div>
          <div className="hero-assurance"><span><Check size={13} /></span> Independent workspace for every business <i /> <span><Check size={13} /></span> Your store, ready to share</div>
        </div>
        <a className="hero-scroll" href="#solutions"><span /> Built for the way you do business <ArrowRight size={14} /></a>
      </section>

      <section className="solutions-section section-wrap" id="solutions">
        <div className="section-heading centered-heading">
          <span className="section-kicker">ONE PLATFORM, MANY POSSIBILITIES</span>
          <h2>Built for your kind<br className="mobile-break" /> of business.</h2>
          <p>Whether you're managing a growing shop or launching your first storefront, Vendora gives your business room to run.</p>
        </div>
        <div className="solutions-grid">
          {solutions.map(({ icon: Icon, title, detail }, index) => (
            <article className="solution-card" key={title}>
              <span className={`solution-icon solution-icon-${index + 1}`}><Icon size={21} strokeWidth={1.8} /></span>
              <div><h3>{title}</h3><p>{detail}</p></div>
              <ArrowUpRight className="solution-arrow" size={16} />
            </article>
          ))}
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-wrap">
          <div className="section-heading feature-heading">
            <div><span className="section-kicker">THE TOOLS TO MOVE FORWARD</span><h2>Your whole business.<br />One connected workspace.</h2></div>
            <p>Spend less time switching between tools. Vendora brings the essentials together, so you can focus on what comes next.</p>
          </div>
          <div className="features-grid">
            {features.map(({ icon: Icon, title, detail }, index) => (
              <article className="feature-card" key={title}>
                <span className="feature-icon"><Icon size={20} strokeWidth={1.8} /></span>
                <span className="feature-number">0{index + 1}</span>
                <h3>{title}</h3><p>{detail}</p>
                <span className="feature-rule" />
              </article>
            ))}
          </div>
          <div className="feature-footnote"><ShieldCheck size={15} /> Each business manages its own data, workspace, and settings.</div>
        </div>
      </section>

      <section className="storefront-section">
        <div className="section-wrap storefront-layout">
          <div className="storefront-copy">
            <span className="section-kicker">YOUR BUSINESS, YOUR STORE</span>
            <h2>A storefront that feels like <span>yours.</span></h2>
            <p>Every business gets an independent online storefront with its own identity, product categories, and customer shopping experience.</p>
            <ul>
              <li><span><Check size={13} /></span> A dedicated, shareable store URL</li>
              <li><span><Check size={13} /></span> Your products, categories, and pricing</li>
              <li><span><Check size={13} /></span> A smooth browsing and add-to-cart experience</li>
            </ul>
            <Link className="landing-button landing-button-primary" href="/login">Explore your workspace <ArrowRight size={15} /></Link>
            <small className="storefront-disclaimer">Illustrative storefront preview. Product details are managed by each business.</small>
          </div>
          <div className="storefront-visual"><span className="store-visual-spark store-visual-spark-one" /><span className="store-visual-spark store-visual-spark-two" /><StorefrontPreview /></div>
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="section-wrap pricing-layout">
          <div className="pricing-copy"><span className="section-kicker">SIMPLE, BUSINESS-READY ACCESS</span><h2>Ready when<br />your business is.</h2><p>Plans and subscription pricing aren't configured on the platform yet. Business access is currently set up by a Vendora platform administrator.</p></div>
          <div className="pricing-card">
            <div className="pricing-card-top"><span className="pricing-icon"><WalletCards size={19} /></span><span className="pricing-status"><i /> PLATFORM-MANAGED</span></div>
            <h3>Business access</h3><p>Get in touch with your platform administrator to set up a Vendora business workspace.</p>
            <div className="pricing-divider" />
            <ul><li><Check size={14} /> Your own business dashboard</li><li><Check size={14} /> Storefront and commerce tools</li><li><Check size={14} /> Access managed by your platform team</li></ul>
            <Link className="landing-button landing-button-dark" href="/login">Continue to sign in <ArrowRight size={15} /></Link>
            <small>No public business registration or unconfigured pricing.</small>
          </div>
        </div>
      </section>

      <section className="faq-section section-wrap">
        <div className="faq-intro"><span className="section-kicker">GOOD QUESTIONS</span><h2>Everything you<br />need to know.</h2><p>Still have questions? Sign in to your workspace to reach the platform support team.</p><Link className="text-arrow-link" href="/login">Go to sign in <ArrowRight size={15} /></Link></div>
        <div className="faq-list">
          {faqs.map(({ question, answer }) => <details className="faq-item" key={question}><summary><span>{question}</span><ChevronDown size={17} /></summary><p>{answer}</p></details>)}
        </div>
      </section>

      <ContactSection />

      <footer className="landing-footer">
        <div className="footer-main section-wrap">
          <div className="footer-brand-column"><Brand footer /><p>One connected platform to manage your business, grow your online store, and keep everything moving.</p><Link className="footer-login" href="/login"><LockKeyhole size={14} /> Business sign in <ArrowUpRight size={13} /></Link></div>
          <div className="footer-link-column"><b>Explore</b><a href="#features">Features</a><a href="#solutions">Solutions</a><a href="#pricing">Business access</a></div>
          <div className="footer-link-column"><b>Platform</b><a href="#features">Product management</a><a href="#features">Inventory management</a><a href="#features">Online storefront</a><a href="#features">Sales analytics</a></div>
          <div className="footer-access-card">
            <span><CircleHelp size={17} /></span>
            <b>Contact Abdilahi</b>
            <p>Project questions, collaboration, or platform support.</p>
            <div className="footer-contact-links">
              <a href="mailto:abdilahimohamed459@gmail.com" aria-label="Email Abdilahi"><SiGmail /></a>
              <a href="https://wa.me/252634594307?s=p" target="_blank" rel="noreferrer" aria-label="WhatsApp Abdilahi"><SiWhatsapp /></a>
              <a href="https://www.linkedin.com/in/abdilahi-mohamed-564317393" target="_blank" rel="noreferrer" aria-label="Abdilahi on LinkedIn"><FaLinkedin /></a>
              <a href="https://github.com/Abdilahi-mohamed" target="_blank" rel="noreferrer" aria-label="Abdilahi on GitHub"><SiGithub /></a>
            </div>
          </div>
        </div>
        <div className="footer-bottom"><div className="section-wrap"><span>© {new Date().getFullYear()} Vendora. All rights reserved.</span><span className="footer-legal"><span>Privacy policy</span><span>Terms of service</span></span><span className="footer-platform">Built for independent business <span>•</span> Powered by Vendora</span></div></div>
      </footer>
    </main>
  );
}
