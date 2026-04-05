import { useState } from 'react';
import './index.css';

const PLATFORM_URL = 'https://app-staging.e-sante.com.tn';

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white/80 backdrop-blur-md shadow-sm fixed top-0 w-full z-50">
      <nav className="flex justify-between items-center w-full px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <span className="text-xl font-extrabold tracking-tight text-slate-900 font-headline">
            E-Santé
          </span>
          <div className="hidden md:flex items-center gap-6">
            <a className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-semibold" href="#solutions">Solutions</a>
            <a className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-semibold" href="#fonctionnalites">Fonctionnalités</a>
            <a className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-semibold" href="#securite">Sécurité</a>
            <a className="text-slate-600 hover:text-slate-900 transition-colors text-sm font-semibold" href="#contact">Contact</a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={PLATFORM_URL}
            className="hidden md:inline-block px-6 py-2 bg-secondary text-on-secondary rounded hover:opacity-90 transition-all font-semibold text-sm"
          >
            Connexion
          </a>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name={menuOpen ? 'close' : 'menu'} className="text-2xl text-slate-900" />
          </button>
        </div>
      </nav>
      {menuOpen && (
        <div className="md:hidden bg-white border-t px-8 py-4 space-y-3">
          <a className="block text-slate-600 font-semibold text-sm" href="#solutions" onClick={() => setMenuOpen(false)}>Solutions</a>
          <a className="block text-slate-600 font-semibold text-sm" href="#fonctionnalites" onClick={() => setMenuOpen(false)}>Fonctionnalités</a>
          <a className="block text-slate-600 font-semibold text-sm" href="#securite" onClick={() => setMenuOpen(false)}>Sécurité</a>
          <a className="block text-slate-600 font-semibold text-sm" href="#contact" onClick={() => setMenuOpen(false)}>Contact</a>
          <a href={PLATFORM_URL} className="block px-6 py-2 bg-secondary text-on-secondary rounded font-semibold text-sm text-center">Connexion</a>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-32 px-8 bg-surface">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
        <div className="flex-1 text-center lg:text-left z-10">
          <div className="inline-flex items-center px-4 py-2 bg-secondary-fixed text-on-secondary-fixed-variant rounded-full text-xs font-bold tracking-widest uppercase mb-6">
            Propulsé par l'IA
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold font-headline text-primary tracking-tight leading-[1.1] mb-6">
            La Digitalisation Santé{' '}
            <span className="bg-gradient-to-r from-secondary to-secondary-container bg-clip-text text-transparent">
              Propulsée par l'IA
            </span>
          </h1>
          <p className="text-xl text-on-surface-variant max-w-2xl leading-relaxed mb-10">
            Plateforme intelligente pour automatiser la gestion du tiers payant santé en Tunisie. Simplifiez les flux, réduisez les délais et sécurisez vos transactions.
          </p>
          <div className="flex flex-wrap justify-center lg:justify-start gap-4">
            <a
              href="#solutions"
              className="px-8 py-4 bg-secondary text-on-secondary rounded-lg font-bold shadow-lg shadow-secondary/20 hover:scale-[0.98] transition-transform"
            >
              Découvrir nos solutions
            </a>
            <a
              href={PLATFORM_URL}
              className="px-8 py-4 bg-surface-container-lowest text-primary border border-outline-variant/30 rounded-lg font-bold hover:bg-surface-container-low transition-colors"
            >
              Accéder à la plateforme
            </a>
          </div>
        </div>
        <div className="flex-1 relative w-full aspect-square max-w-[500px]">
          <div className="absolute inset-0 bg-gradient-to-tr from-primary to-secondary rounded-3xl overflow-hidden shadow-2xl">
            <div className="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/60 flex items-center justify-center">
              <div className="text-center text-white/80">
                <Icon name="health_and_safety" className="text-[80px] mb-4" />
                <p className="font-headline font-bold text-2xl">E-Santé</p>
                <p className="text-sm opacity-70">Tiers Payant Intelligent</p>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-6 -left-6 bg-surface-container-lowest p-6 rounded-xl glow-shadow border border-outline-variant/10 max-w-[240px]">
            <div className="flex items-center gap-3 mb-2">
              <Icon name="verified" className="text-on-tertiary-container" />
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Précision IA</span>
            </div>
            <div className="text-2xl font-bold text-primary font-headline">99.8%</div>
            <div className="text-xs text-on-surface-variant">Taux de détection automatisé</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Partners() {
  return (
    <section className="py-12 bg-surface-container-low">
      <div className="max-w-7xl mx-auto px-8">
        <p className="text-center text-xs font-bold uppercase tracking-[0.3em] text-on-surface-variant/60 mb-10">
          Confiance Institutionnelle
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-50 grayscale hover:grayscale-0 transition-all">
          <span className="text-2xl font-bold font-headline text-primary">BH Assurance</span>
          <span className="text-2xl font-bold font-headline text-primary">BH Bank</span>
          <span className="text-2xl font-bold font-headline text-primary">Tunisie Monétique</span>
          <span className="text-2xl font-bold font-headline text-primary">CNAM</span>
        </div>
      </div>
    </section>
  );
}

function Solutions() {
  return (
    <section id="solutions" className="py-32 px-8 scroll-mt-20">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <h2 className="text-3xl font-extrabold font-headline text-primary mb-4">Des Solutions pour chaque acteur</h2>
          <p className="text-on-surface-variant max-w-xl">Un écosystème interconnecté conçu pour fluidifier le parcours de soins en Tunisie.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Assureurs */}
          <div className="md:col-span-2 bg-surface-container-lowest p-8 rounded-xl glow-shadow group hover:bg-primary transition-all duration-300">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center mb-6 group-hover:bg-white/10">
              <Icon name="shield_person" className="text-secondary group-hover:text-white" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-4 group-hover:text-white">Assureurs</h3>
            <p className="text-on-surface-variant group-hover:text-white/70 mb-6">
              Optimisez la gestion de vos sinistres et automatisez les remboursements en temps réel.
            </p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-2 text-sm group-hover:text-white/80">
                <Icon name="check_circle" className="text-xs" /> Gestion automatisée
              </li>
              <li className="flex items-center gap-2 text-sm group-hover:text-white/80">
                <Icon name="check_circle" className="text-xs" /> Contrôle des coûts
              </li>
            </ul>
          </div>
          {/* Entreprises */}
          <div className="bg-surface-container-lowest p-8 rounded-xl glow-shadow hover:translate-y-[-4px] transition-transform">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center mb-6">
              <Icon name="corporate_fare" className="text-secondary" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-3">Entreprises</h3>
            <p className="text-sm text-on-surface-variant">
              Un tableau de bord complet pour le suivi de la couverture santé de vos collaborateurs.
            </p>
          </div>
          {/* Praticiens */}
          <div className="bg-surface-container-lowest p-8 rounded-xl glow-shadow hover:translate-y-[-4px] transition-transform">
            <div className="w-12 h-12 bg-secondary/10 rounded-lg flex items-center justify-center mb-6">
              <Icon name="medical_services" className="text-secondary" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-3">Praticiens</h3>
            <p className="text-sm text-on-surface-variant">
              Accélérez vos paiements tiers payant et réduisez la charge administrative.
            </p>
          </div>
          {/* Adhérents */}
          <div className="md:col-span-4 bg-gradient-to-r from-secondary-container to-secondary p-10 rounded-xl text-white flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-6">
                <Icon name="person" className="text-white" />
              </div>
              <h3 className="text-2xl font-bold font-headline mb-4">Adhérents & Patients</h3>
              <p className="text-white/80 mb-6 max-w-lg">
                Une expérience de soin sans friction. Suivez vos remboursements, trouvez des praticiens et gérez votre famille depuis notre application mobile dédiée.
              </p>
              <button className="px-6 py-3 bg-white text-secondary rounded-lg font-bold text-sm hover:bg-white/90 transition-colors">
                Télécharger l'App
              </button>
            </div>
            <div className="w-full md:w-1/3 aspect-video bg-white/10 rounded-lg backdrop-blur-sm p-8 flex items-center justify-center">
              <div className="text-center">
                <Icon name="smartphone" className="text-[48px] text-white/80" />
                <p className="text-sm text-white/60 mt-2">App Mobile</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: 'bolt',
      title: "Vérification d'éligibilité en temps réel",
      desc: "Confirmez les droits de l'adhérent instantanément lors de l'admission pour éviter tout rejet de dossier.",
    },
    {
      icon: 'psychology',
      title: 'Détection de fraude par IA',
      desc: 'Nos algorithmes analysent les patterns de facturation pour identifier les anomalies en amont du paiement.',
    },
    {
      icon: 'description',
      title: 'Génération automatique des bordereaux',
      desc: 'Plus aucune saisie manuelle. Exportez vos documents comptables conformes en un seul clic.',
    },
    {
      icon: 'account_balance',
      title: 'Intégration bancaire directe',
      desc: 'Connectez vos flux financiers directement avec BH Bank pour des virements automatisés et sécurisés.',
    },
  ];

  return (
    <section id="fonctionnalites" className="py-32 bg-surface-container scroll-mt-20">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center mb-20">
          <h2 className="text-4xl font-extrabold font-headline text-primary mb-6">Innovation & Sécurité</h2>
          <p className="text-on-surface-variant max-w-2xl mx-auto text-lg">
            Nous repoussons les limites de la technologie pour garantir une gestion transparente et infalsifiable.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {features.map((f) => (
            <div key={f.icon} className="flex gap-6 items-start">
              <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm">
                <Icon name={f.icon} className="text-secondary text-3xl" />
              </div>
              <div>
                <h4 className="text-xl font-bold font-headline mb-2">{f.title}</h4>
                <p className="text-on-surface-variant">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section id="securite" className="py-32 px-8 bg-primary text-white overflow-hidden relative scroll-mt-20">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-secondary opacity-5 blur-[100px] pointer-events-none" />
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-20">
          <div className="flex-1">
            <span className="text-secondary-fixed-dim text-sm font-bold uppercase tracking-widest mb-4 block">
              Confidentialité Maximale
            </span>
            <h2 className="text-4xl font-extrabold font-headline mb-8">Sécurité de Grade Institutionnel</h2>
            <div className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center">
                  <Icon name="lock" className="text-secondary-fixed-dim" />
                </div>
                <div>
                  <h5 className="font-bold">Chiffrement AES-256</h5>
                  <p className="text-white/60 text-sm">Données patient cryptées de bout en bout selon les normes militaires.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center">
                  <Icon name="gavel" className="text-secondary-fixed-dim" />
                </div>
                <div>
                  <h5 className="font-bold">Conformité RGPD & Locale</h5>
                  <p className="text-white/60 text-sm">Respect strict de la protection des données personnelles en Tunisie.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center">
                  <Icon name="history" className="text-secondary-fixed-dim" />
                </div>
                <div>
                  <h5 className="font-bold">Audit Trail Complet</h5>
                  <p className="text-white/60 text-sm">Traçabilité totale de chaque action effectuée sur la plateforme.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full">
            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-2 overflow-hidden shadow-2xl">
              <div className="bg-primary-container p-6 rounded-xl">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-error" />
                    <div className="w-3 h-3 rounded-full bg-secondary-fixed" />
                    <div className="w-3 h-3 rounded-full bg-on-tertiary-container" />
                  </div>
                  <span className="text-xs font-mono opacity-40">security_status: optimal</span>
                </div>
                <div className="space-y-4">
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-secondary-container w-[85%]" />
                  </div>
                  <div className="h-2 w-[70%] bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-on-tertiary-container w-[95%]" />
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-4">
                    <div className="h-16 bg-white/5 rounded-lg border border-white/10 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase opacity-40">Encryption</span>
                      <span className="text-xs font-bold">ACTIVE</span>
                    </div>
                    <div className="h-16 bg-white/5 rounded-lg border border-white/10 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase opacity-40">DDoS Protection</span>
                      <span className="text-xs font-bold">L-7</span>
                    </div>
                    <div className="h-16 bg-white/5 rounded-lg border border-white/10 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase opacity-40">Uptime</span>
                      <span className="text-xs font-bold">99.9%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('sending');

    try {
      const response = await fetch('https://dhamen-api-staging.yassine-techini.workers.dev/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          message: form.message,
        }),
      });

      if (response.ok) {
        setStatus('success');
        setForm({ name: '', email: '', company: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section id="contact" className="py-32 px-8 scroll-mt-20">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold font-headline text-primary mb-6">
            Prêt à moderniser votre gestion santé ?
          </h2>
          <p className="text-xl text-on-surface-variant">
            Rejoignez le réseau leader de la santé digitale en Tunisie.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-surface-container-lowest p-8 md:p-12 rounded-2xl glow-shadow border border-outline-variant/10"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">Nom complet</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-3 bg-surface-container-highest rounded-lg border-0 focus:ring-2 focus:ring-secondary outline-none text-sm"
                placeholder="Votre nom"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 bg-surface-container-highest rounded-lg border-0 focus:ring-2 focus:ring-secondary outline-none text-sm"
                placeholder="votre@email.com"
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-on-surface mb-2">Entreprise</label>
            <input
              type="text"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="w-full px-4 py-3 bg-surface-container-highest rounded-lg border-0 focus:ring-2 focus:ring-secondary outline-none text-sm"
              placeholder="Nom de votre entreprise"
            />
          </div>
          <div className="mb-8">
            <label className="block text-sm font-semibold text-on-surface mb-2">Message</label>
            <textarea
              required
              rows={4}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-4 py-3 bg-surface-container-highest rounded-lg border-0 focus:ring-2 focus:ring-secondary outline-none text-sm resize-none"
              placeholder="Comment pouvons-nous vous aider ?"
            />
          </div>
          <div className="text-center">
            <button
              type="submit"
              disabled={status === 'sending'}
              className="px-10 py-4 signature-gradient text-on-secondary rounded-xl font-extrabold shadow-xl shadow-secondary/20 hover:scale-105 transition-transform disabled:opacity-50"
            >
              {status === 'sending' ? 'Envoi en cours...' : 'Prendre contact'}
            </button>
          </div>
          {status === 'success' && (
            <p className="text-center text-on-tertiary-container font-semibold mt-6">
              Merci ! Votre message a été envoyé avec succès.
            </p>
          )}
          {status === 'error' && (
            <p className="text-center text-error font-semibold mt-6">
              Une erreur est survenue. Veuillez réessayer.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-50 border-t-0">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 px-8 py-12 max-w-7xl mx-auto">
        <div className="col-span-2 md:col-span-1">
          <div className="text-lg font-bold text-slate-900 font-headline mb-4">E-Santé</div>
          <p className="text-slate-500 text-sm mb-4">Solutions Santé Digitales</p>
          <p className="text-slate-400 text-xs">&copy; {new Date().getFullYear()} E-Santé. Tous droits réservés.</p>
        </div>
        <div>
          <h4 className="font-headline font-semibold text-slate-900 mb-4">Produit</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            <li><a className="hover:text-slate-900 transition-all" href="#solutions">Solutions</a></li>
            <li><a className="hover:text-slate-900 transition-all" href="#fonctionnalites">Fonctionnalités</a></li>
            <li><a className="hover:text-slate-900 transition-all" href="#securite">Sécurité</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-headline font-semibold text-slate-900 mb-4">Ressources</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            <li><a className="hover:text-slate-900 transition-all" href="#contact">Contact</a></li>
            <li><a className="hover:text-slate-900 transition-all" href={PLATFORM_URL}>Plateforme</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-headline font-semibold text-slate-900 mb-4">Légal</h4>
          <ul className="space-y-2 text-sm text-slate-500">
            <li><a className="hover:text-slate-900 transition-all" href="#">Mentions Légales</a></li>
            <li><a className="hover:text-slate-900 transition-all" href="#">Confidentialité</a></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function App() {
  return (
    <div className="bg-surface text-on-surface antialiased">
      <Navbar />
      <main>
        <Hero />
        <Partners />
        <Solutions />
        <Features />
        <Security />
        <ContactForm />
      </main>
      <Footer />
    </div>
  );
}

export default App;
