import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';

const PLATFORM_URL = 'https://app-staging.e-sante.com.tn';
const API_BASE_URL = 'https://dhamen-api-staging.yassine-techini.workers.dev/api/v1';

type Lang = 'fr' | 'en' | 'ar';

/* =========================================================
   i18n translations
   ========================================================= */
const translations: Record<Lang, Record<string, string>> = {
  fr: {
    'nav.solutions': 'Solutions',
    'nav.features': 'Fonctionnalités',
    'nav.security': 'Sécurité',
    'nav.contact': 'Contact',
    'nav.login': 'Connexion',

    'hero.badge': 'Plateforme IA-Native 100% Tunisienne',
    'hero.title1': 'La Digitalisation Santé',
    'hero.title2': "Propulsée par l'IA",
    'hero.description':
      "E-Santé est la plateforme de tiers payant santé propulsée par l'intelligence artificielle. Automatisez la vérification d'éligibilité, la tarification, la détection de fraude et la réconciliation financière.",
    'hero.cta1': 'Découvrir',
    'hero.cta2': 'Accéder à la plateforme',
    'hero.stat1': 'Assureurs partenaires',
    'hero.stat2': 'Prestataires connectés',
    'hero.stat3': 'Adhérents couverts',

    'dashboard.title': 'Tableau de bord',
    'dashboard.live': 'En direct',
    'dashboard.item1.title': 'Éligibilité vérifiée',
    'dashboard.item2.title': 'Remboursement traité',
    'dashboard.item3.title': 'Bordereau généré',
    'dashboard.transactions': "Transactions aujourd'hui",

    'partners.title': 'Confiance Institutionnelle',

    'solutions.label': 'Solutions',
    'solutions.title': 'Une plateforme pour chaque acteur',
    'solutions.subtitle': 'Des outils spécialisés pour digitaliser le parcours santé de bout en bout.',
    'solutions.insurers.title': 'Assureurs & Mutuelles',
    'solutions.insurers.desc':
      "Pilotez vos contrats, gérez vos adhérents, automatisez les bordereaux et bénéficiez d'un score anti-fraude IA sur chaque transaction. Tableau de bord analytique en temps réel.",
    'solutions.companies.title': 'Entreprises',
    'solutions.companies.desc':
      'Portail RH dédié pour gérer les contrats groupe, les adhérents et suivre les remboursements de vos collaborateurs.',
    'solutions.providers.title': 'Praticiens',
    'solutions.providers.desc':
      "Pharmaciens, médecins, laboratoires et cliniques : vérifiez l'éligibilité, saisissez les actes et recevez vos paiements rapidement.",
    'solutions.adherents.title': 'Adhérents & Patients',
    'solutions.adherents.desc':
      'Application mobile pour suivre vos remboursements, consulter vos garanties, présenter votre carte virtuelle et localiser les prestataires conventionnés.',

    'features.label': 'Intelligence Artificielle',
    'features.title': 'Des agents IA spécialisés',
    'features.subtitle':
      "Notre plateforme intègre des agents d'intelligence artificielle pour automatiser et optimiser chaque étape du parcours santé.",
    'features.f1.title': 'Agent Éligibilité',
    'features.f1.desc':
      "Vérification en temps réel de l'éligibilité des adhérents avec réponse en moins de 100ms grâce au cache distribué.",
    'features.f2.title': 'Agent Tarification',
    'features.f2.desc':
      'Calcul automatique des prises en charge selon les barèmes, conventions et plafonds de garantie.',
    'features.f3.title': 'Agent Anti-Fraude',
    'features.f3.desc':
      'Détection des anomalies et comportements suspects avec score de confiance 0-100 sur chaque transaction.',
    'features.f4.title': 'Agent Réconciliation',
    'features.f4.desc':
      'Rapprochement automatique des demandes, paiements et bordereaux avec génération de rapports.',
    'features.f5.title': 'OCR & Extraction IA',
    'features.f5.desc':
      'Extraction intelligente des données depuis ordonnances, factures et documents médicaux via Workers AI.',
    'features.f6.title': 'Application Mobile',
    'features.f6.desc':
      'Application mobile pour les adhérents avec suivi des remboursements, carte virtuelle et notifications push.',

    'howItWorks.label': 'Processus',
    'howItWorks.title': 'Comment ça marche ?',
    'howItWorks.subtitle':
      'Un processus digitalisé et piloté par des agents IA pour tous les acteurs de la santé.',
    'howItWorks.step1.title': 'Vérification',
    'howItWorks.step1.desc':
      "L'adhérent présente sa carte. Le prestataire vérifie l'éligibilité en temps réel.",
    'howItWorks.step2.title': 'Prise en charge',
    'howItWorks.step2.desc':
      'Calcul automatique du montant couvert et du ticket modérateur.',
    'howItWorks.step3.title': 'Traitement IA',
    'howItWorks.step3.desc':
      'Les agents IA valident, détectent les anomalies et optimisent le traitement.',
    'howItWorks.step4.title': 'Paiement',
    'howItWorks.step4.desc': 'Règlement rapide du prestataire via bordereau automatisé.',

    'security.label': 'Innovation & Sécurité',
    'security.title': 'Sécurité de niveau entreprise',
    'security.subtitle':
      "Vos données de santé sont protégées par les standards les plus exigeants de l'industrie.",
    'security.f1.title': 'Chiffrement AES-256',
    'security.f1.desc': 'Toutes les données sensibles sont chiffrées au repos et en transit.',
    'security.f2.title': 'Conformité RGPD',
    'security.f2.desc':
      'Protection des données personnelles conforme aux normes européennes.',
    'security.f3.title': 'Audit Trail Complet',
    'security.f3.desc':
      'Traçabilité totale de chaque action : qui, quand, quoi, avec historique immuable.',

    'cta.title': 'Prêt à digitaliser votre activité santé ?',
    'cta.subtitle':
      'Rejoignez les prestataires et assureurs qui utilisent nos agents IA pour transformer leurs opérations.',
    'cta.btn1': 'Commencer maintenant',
    'cta.btn2': 'Demander une démo',

    'contact.label': 'Contact',
    'contact.title': 'Contactez-nous',
    'contact.subtitle':
      'Notre équipe est disponible pour répondre à toutes vos questions et vous accompagner dans votre projet de digitalisation.',
    'contact.phone': 'Téléphone',
    'contact.address': 'Adresse',
    'contact.form.firstName': 'Prénom',
    'contact.form.firstNamePlaceholder': 'Votre prénom',
    'contact.form.lastName': 'Nom',
    'contact.form.lastNamePlaceholder': 'Votre nom',
    'contact.form.emailPlaceholder': 'votre@email.com',
    'contact.form.orgType': "Type d'organisation",
    'contact.form.select': 'Sélectionnez...',
    'contact.form.pharmacy': 'Pharmacie',
    'contact.form.clinic': 'Clinique / Hôpital',
    'contact.form.cabinet': 'Cabinet médical',
    'contact.form.lab': 'Laboratoire',
    'contact.form.insurer': 'Assureur / Mutuelle',
    'contact.form.company': 'Entreprise',
    'contact.form.other': 'Autre',
    'contact.form.message': 'Message',
    'contact.form.messagePlaceholder': 'Comment pouvons-nous vous aider ?',
    'contact.form.submit': 'Envoyer',
    'contact.form.sending': 'Envoi en cours...',
    'contact.form.success': 'Message envoyé avec succès !',
    'contact.form.error': "Erreur lors de l'envoi. Veuillez réessayer.",

    'footer.tagline':
      "La plateforme de digitalisation santé propulsée par l'IA en Tunisie.",
    'footer.product': 'Produit',
    'footer.company': 'Entreprise',
    'footer.about': 'À propos',
    'footer.careers': 'Carrières',
    'footer.partners': 'Partenaires',
    'footer.legal': 'Légal',
    'footer.terms': 'CGU',
    'footer.privacy': 'Politique de confidentialité',
    'footer.legalNotice': 'Mentions légales',
    'footer.copyright': '\u00a9 2025 E-Santé. Tous droits réservés.',
  },
  en: {
    'nav.solutions': 'Solutions',
    'nav.features': 'Features',
    'nav.security': 'Security',
    'nav.contact': 'Contact',
    'nav.login': 'Login',

    'hero.badge': 'AI-Native 100% Tunisian Platform',
    'hero.title1': 'Healthcare Digitalization',
    'hero.title2': 'Powered by AI',
    'hero.description':
      'E-Santé is the AI-powered third-party healthcare payment platform. Automate eligibility verification, pricing, fraud detection and financial reconciliation.',
    'hero.cta1': 'Discover',
    'hero.cta2': 'Access Platform',
    'hero.stat1': 'Partner insurers',
    'hero.stat2': 'Connected providers',
    'hero.stat3': 'Covered beneficiaries',

    'dashboard.title': 'Dashboard',
    'dashboard.live': 'Live',
    'dashboard.item1.title': 'Eligibility verified',
    'dashboard.item2.title': 'Reimbursement processed',
    'dashboard.item3.title': 'Statement generated',
    'dashboard.transactions': 'Transactions today',

    'partners.title': 'Institutional Trust',

    'solutions.label': 'Solutions',
    'solutions.title': 'A platform for every stakeholder',
    'solutions.subtitle':
      'Specialized tools to digitalize the healthcare journey end-to-end.',
    'solutions.insurers.title': 'Insurers & Mutuals',
    'solutions.insurers.desc':
      'Manage your contracts, beneficiaries, automate statements and benefit from an AI anti-fraud score on every transaction. Real-time analytics dashboard.',
    'solutions.companies.title': 'Companies',
    'solutions.companies.desc':
      'Dedicated HR portal to manage group contracts, beneficiaries and track employee reimbursements.',
    'solutions.providers.title': 'Providers',
    'solutions.providers.desc':
      'Pharmacists, doctors, labs and clinics: verify eligibility, submit claims and receive payments quickly.',
    'solutions.adherents.title': 'Beneficiaries & Patients',
    'solutions.adherents.desc':
      'Mobile app to track reimbursements, view coverage, present virtual card and locate network providers.',

    'features.label': 'Artificial Intelligence',
    'features.title': 'Specialized AI Agents',
    'features.subtitle':
      'Our platform integrates AI agents to automate and optimize every step of the healthcare journey.',
    'features.f1.title': 'Eligibility Agent',
    'features.f1.desc':
      'Real-time member eligibility verification with response in under 100ms using distributed cache.',
    'features.f2.title': 'Pricing Agent',
    'features.f2.desc':
      'Automatic coverage calculation according to rates, agreements and coverage limits.',
    'features.f3.title': 'Anti-Fraud Agent',
    'features.f3.desc':
      'Anomaly and suspicious behavior detection with 0-100 confidence score on every transaction.',
    'features.f4.title': 'Reconciliation Agent',
    'features.f4.desc':
      'Automatic matching of claims, payments and statements with report generation.',
    'features.f5.title': 'OCR & AI Extraction',
    'features.f5.desc':
      'Intelligent data extraction from prescriptions, invoices and medical documents via Workers AI.',
    'features.f6.title': 'Mobile Application',
    'features.f6.desc':
      'Mobile app for beneficiaries with reimbursement tracking, virtual card and push notifications.',

    'howItWorks.label': 'Process',
    'howItWorks.title': 'How does it work?',
    'howItWorks.subtitle':
      'A digitalized process driven by AI agents for all healthcare stakeholders.',
    'howItWorks.step1.title': 'Verification',
    'howItWorks.step1.desc':
      'The beneficiary presents their card. The provider verifies eligibility in real-time.',
    'howItWorks.step2.title': 'Coverage',
    'howItWorks.step2.desc':
      'Automatic calculation of the covered amount and co-payment.',
    'howItWorks.step3.title': 'AI Processing',
    'howItWorks.step3.desc':
      'AI agents validate, detect anomalies and optimize processing.',
    'howItWorks.step4.title': 'Payment',
    'howItWorks.step4.desc':
      'Quick settlement to the provider via automated statement.',

    'security.label': 'Innovation & Security',
    'security.title': 'Enterprise-grade security',
    'security.subtitle':
      'Your health data is protected by the most demanding industry standards.',
    'security.f1.title': 'AES-256 Encryption',
    'security.f1.desc':
      'All sensitive data is encrypted at rest and in transit.',
    'security.f2.title': 'GDPR Compliance',
    'security.f2.desc':
      'Personal data protection compliant with European standards.',
    'security.f3.title': 'Complete Audit Trail',
    'security.f3.desc':
      'Full traceability of every action: who, when, what, with immutable history.',

    'cta.title': 'Ready to digitalize your healthcare operations?',
    'cta.subtitle':
      'Join providers and insurers using our AI agents to transform their operations.',
    'cta.btn1': 'Get started now',
    'cta.btn2': 'Request a demo',

    'contact.label': 'Contact',
    'contact.title': 'Contact us',
    'contact.subtitle':
      'Our team is available to answer all your questions and support you in your digitalization project.',
    'contact.phone': 'Phone',
    'contact.address': 'Address',
    'contact.form.firstName': 'First name',
    'contact.form.firstNamePlaceholder': 'Your first name',
    'contact.form.lastName': 'Last name',
    'contact.form.lastNamePlaceholder': 'Your last name',
    'contact.form.emailPlaceholder': 'your@email.com',
    'contact.form.orgType': 'Organization type',
    'contact.form.select': 'Select...',
    'contact.form.pharmacy': 'Pharmacy',
    'contact.form.clinic': 'Clinic / Hospital',
    'contact.form.cabinet': 'Medical office',
    'contact.form.lab': 'Laboratory',
    'contact.form.insurer': 'Insurer / Mutual',
    'contact.form.company': 'Company',
    'contact.form.other': 'Other',
    'contact.form.message': 'Message',
    'contact.form.messagePlaceholder': 'How can we help you?',
    'contact.form.submit': 'Send',
    'contact.form.sending': 'Sending...',
    'contact.form.success': 'Message sent successfully!',
    'contact.form.error': 'Error sending message. Please try again.',

    'footer.tagline':
      'The AI-powered healthcare digitalization platform in Tunisia.',
    'footer.product': 'Product',
    'footer.company': 'Company',
    'footer.about': 'About',
    'footer.careers': 'Careers',
    'footer.partners': 'Partners',
    'footer.legal': 'Legal',
    'footer.terms': 'Terms of Service',
    'footer.privacy': 'Privacy Policy',
    'footer.legalNotice': 'Legal Notice',
    'footer.copyright': '\u00a9 2025 E-Santé. All rights reserved.',
  },
  ar: {
    'nav.solutions': 'الحلول',
    'nav.features': 'المميزات',
    'nav.security': 'الأمان',
    'nav.contact': 'اتصل بنا',
    'nav.login': 'تسجيل الدخول',

    'hero.badge': 'منصة ذكاء اصطناعي تونسية 100%',
    'hero.title1': 'رقمنة قطاع الصحة',
    'hero.title2': 'بقوة الذكاء الاصطناعي',
    'hero.description':
      'الصحة الإلكترونية هي منصة الدفع الصحي من الطرف الثالث المدعومة بالذكاء الاصطناعي. أتمتة التحقق من الأهلية والتسعير وكشف الاحتيال والمطابقة المالية.',
    'hero.cta1': 'اكتشف',
    'hero.cta2': 'الوصول إلى المنصة',
    'hero.stat1': 'شركات تأمين شريكة',
    'hero.stat2': 'مقدمي خدمات متصلين',
    'hero.stat3': 'منخرطين مغطين',

    'dashboard.title': 'لوحة التحكم',
    'dashboard.live': 'مباشر',
    'dashboard.item1.title': 'تم التحقق من الأهلية',
    'dashboard.item2.title': 'تمت معالجة التعويض',
    'dashboard.item3.title': 'تم إنشاء الكشف',
    'dashboard.transactions': 'المعاملات اليوم',

    'partners.title': 'ثقة مؤسسية',

    'solutions.label': 'الحلول',
    'solutions.title': 'منصة لكل فاعل',
    'solutions.subtitle':
      'أدوات متخصصة لرقمنة مسار الصحة من البداية إلى النهاية.',
    'solutions.insurers.title': 'شركات التأمين والتعاضديات',
    'solutions.insurers.desc':
      'إدارة العقود والمنخرطين وأتمتة الكشوفات مع نقاط مكافحة الاحتيال بالذكاء الاصطناعي. لوحة تحليلات في الوقت الفعلي.',
    'solutions.companies.title': 'المؤسسات',
    'solutions.companies.desc':
      'بوابة موارد بشرية مخصصة لإدارة عقود المجموعات والمنخرطين ومتابعة تعويضات الموظفين.',
    'solutions.providers.title': 'الممارسون',
    'solutions.providers.desc':
      'الصيادلة والأطباء والمختبرات والعيادات: تحقق من الأهلية وأدخل الأعمال واحصل على مدفوعاتك بسرعة.',
    'solutions.adherents.title': 'المنخرطون والمرضى',
    'solutions.adherents.desc':
      'تطبيق جوال لمتابعة التعويضات والاطلاع على الضمانات وتقديم البطاقة الافتراضية وتحديد مقدمي الخدمات المتعاقدين.',

    'features.label': 'الذكاء الاصطناعي',
    'features.title': 'وكلاء ذكاء اصطناعي متخصصون',
    'features.subtitle':
      'منصتنا تدمج وكلاء ذكاء اصطناعي لأتمتة وتحسين كل خطوة في مسار الرعاية الصحية.',
    'features.f1.title': 'وكيل الأهلية',
    'features.f1.desc':
      'التحقق في الوقت الفعلي من أهلية المنخرطين بأقل من 100 مللي ثانية عبر ذاكرة التخزين الموزعة.',
    'features.f2.title': 'وكيل التسعير',
    'features.f2.desc':
      'حساب تلقائي للتغطية وفق التعريفات والاتفاقيات وسقوف الضمان.',
    'features.f3.title': 'وكيل مكافحة الاحتيال',
    'features.f3.desc':
      'كشف الشذوذ والسلوكيات المشبوهة مع نقاط ثقة 0-100 على كل معاملة.',
    'features.f4.title': 'وكيل المطابقة',
    'features.f4.desc':
      'مطابقة تلقائية للمطالبات والمدفوعات والكشوفات مع إنشاء التقارير.',
    'features.f5.title': 'OCR واستخراج ذكي',
    'features.f5.desc':
      'استخراج ذكي للبيانات من الوصفات والفواتير والوثائق الطبية عبر Workers AI.',
    'features.f6.title': 'تطبيق الجوال',
    'features.f6.desc':
      'تطبيق جوال للمنخرطين مع تتبع التعويضات والبطاقة الافتراضية والإشعارات الفورية.',

    'howItWorks.label': 'العملية',
    'howItWorks.title': 'كيف يعمل؟',
    'howItWorks.subtitle':
      'عملية رقمية يقودها وكلاء الذكاء الاصطناعي لجميع أطراف قطاع الصحة.',
    'howItWorks.step1.title': 'التحقق',
    'howItWorks.step1.desc':
      'يقدم المنخرط بطاقته. يتحقق مقدم الخدمة من الأهلية في الوقت الفعلي.',
    'howItWorks.step2.title': 'التغطية',
    'howItWorks.step2.desc':
      'حساب تلقائي للمبلغ المغطى والمساهمة الذاتية.',
    'howItWorks.step3.title': 'المعالجة الذكية',
    'howItWorks.step3.desc':
      'وكلاء الذكاء الاصطناعي يتحققون ويكشفون الشذوذ ويحسنون المعالجة.',
    'howItWorks.step4.title': 'الدفع',
    'howItWorks.step4.desc': 'تسوية سريعة لمقدم الخدمة عبر كشف مؤتمت.',

    'security.label': 'الابتكار والأمان',
    'security.title': 'أمان على مستوى المؤسسات',
    'security.subtitle':
      'بياناتك الصحية محمية بأعلى معايير الصناعة.',
    'security.f1.title': 'تشفير AES-256',
    'security.f1.desc':
      'جميع البيانات الحساسة مشفرة أثناء التخزين والنقل.',
    'security.f2.title': 'توافق RGPD',
    'security.f2.desc':
      'حماية البيانات الشخصية متوافقة مع المعايير الأوروبية.',
    'security.f3.title': 'سجل تدقيق كامل',
    'security.f3.desc':
      'تتبع كامل لكل إجراء: من ومتى وماذا، مع تاريخ غير قابل للتغيير.',

    'cta.title': 'مستعد لرقمنة نشاطك الصحي؟',
    'cta.subtitle':
      'انضم إلى مقدمي الخدمات وشركات التأمين الذين يستخدمون وكلاءنا الأذكياء لتحويل عملياتهم.',
    'cta.btn1': 'ابدأ الآن',
    'cta.btn2': 'اطلب عرضًا توضيحيًا',

    'contact.label': 'اتصل بنا',
    'contact.title': 'اتصل بنا',
    'contact.subtitle':
      'فريقنا متاح للإجابة على جميع أسئلتك ومساعدتك في مشروع الرقمنة الخاص بك.',
    'contact.phone': 'الهاتف',
    'contact.address': 'العنوان',
    'contact.form.firstName': 'الاسم الأول',
    'contact.form.firstNamePlaceholder': 'اسمك الأول',
    'contact.form.lastName': 'اسم العائلة',
    'contact.form.lastNamePlaceholder': 'اسم عائلتك',
    'contact.form.emailPlaceholder': 'بريدك@الإلكتروني.com',
    'contact.form.orgType': 'نوع المنظمة',
    'contact.form.select': 'اختر...',
    'contact.form.pharmacy': 'صيدلية',
    'contact.form.clinic': 'عيادة / مستشفى',
    'contact.form.cabinet': 'عيادة طبية',
    'contact.form.lab': 'مختبر',
    'contact.form.insurer': 'شركة تأمين / تعاضدية',
    'contact.form.company': 'مؤسسة',
    'contact.form.other': 'أخرى',
    'contact.form.message': 'الرسالة',
    'contact.form.messagePlaceholder': 'كيف يمكننا مساعدتك؟',
    'contact.form.submit': 'إرسال',
    'contact.form.sending': 'جاري الإرسال...',
    'contact.form.success': 'تم إرسال الرسالة بنجاح!',
    'contact.form.error': 'خطأ في الإرسال. يرجى المحاولة مرة أخرى.',

    'footer.tagline':
      'منصة رقمنة الصحة المدعومة بالذكاء الاصطناعي في تونس.',
    'footer.product': 'المنتج',
    'footer.company': 'الشركة',
    'footer.about': 'من نحن',
    'footer.careers': 'الوظائف',
    'footer.partners': 'الشركاء',
    'footer.legal': 'قانوني',
    'footer.terms': 'شروط الاستخدام',
    'footer.privacy': 'سياسة الخصوصية',
    'footer.legalNotice': 'الإشعارات القانونية',
    'footer.copyright': '\u00a9 2025 الصحة الإلكترونية. جميع الحقوق محفوظة.',
  },
};

/* =========================================================
   Hook: useI18n
   ========================================================= */
function useI18n() {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('dhamen-lang') as Lang | null;
    return saved && translations[saved] ? saved : 'fr';
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('dhamen-lang', l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const t = useCallback(
    (key: string): string => translations[lang]?.[key] ?? key,
    [lang],
  );

  return { lang, setLang, t };
}

/* =========================================================
   Icon component (Material Symbols)
   ========================================================= */
function Icon({ name, className = '', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={style}>{name}</span>
  );
}

/* =========================================================
   NAVBAR
   ========================================================= */
function Navbar({
  lang,
  setLang,
  t,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      {/* Top bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white md:glass-nav border-b border-black/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <a href="#" className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: '#1a2332' }}
              >
                <span className="text-white font-extrabold text-sm font-display">
                  BH
                </span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-lg font-extrabold text-primary font-display">
                  E-Santé
                </span>
                <span className="text-[10px] font-medium text-on-surface-variant tracking-wider">
                  BH Assurance
                </span>
              </div>
            </a>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#solutions"
                className="nav-link text-on-surface-variant hover:text-secondary text-sm font-medium transition-colors"
              >
                {t('nav.solutions')}
              </a>
              <a
                href="#features"
                className="nav-link text-on-surface-variant hover:text-secondary text-sm font-medium transition-colors"
              >
                {t('nav.features')}
              </a>
              <a
                href="#security"
                className="nav-link text-on-surface-variant hover:text-secondary text-sm font-medium transition-colors"
              >
                {t('nav.security')}
              </a>
              <a
                href="#contact"
                className="nav-link text-on-surface-variant hover:text-secondary text-sm font-medium transition-colors"
              >
                {t('nav.contact')}
              </a>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Language Switcher */}
              <div className="flex items-center bg-surface-container rounded-lg p-0.5">
                {(['fr', 'en', 'ar'] as Lang[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={`lang-btn px-2.5 py-1 text-xs font-medium rounded-md transition ${lang === l ? 'active' : ''}`}
                  >
                    {l === 'ar' ? 'ع' : l.toUpperCase()}
                  </button>
                ))}
              </div>

              <a
                href={`${PLATFORM_URL}/login`}
                className="hidden sm:inline-flex items-center gap-1.5 text-secondary text-sm font-semibold hover:text-secondary-container transition-colors"
              >
                {t('nav.login')}
              </a>

              {/* Mobile burger */}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-container transition"
              >
                <Icon
                  name={menuOpen ? 'close' : 'menu'}
                  className="text-on-surface"
                />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu — outside nav to avoid stacking context issues */}
      {menuOpen && (
        <div
          className="fixed inset-0 top-16 bg-black/40 z-[100] md:hidden"
          onClick={closeMenu}
        />
      )}
      <div
        className={`fixed top-16 bottom-0 left-0 w-4/5 max-w-sm bg-white z-[110] p-6 md:hidden transition-transform duration-300 ease-in-out shadow-2xl ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col gap-6">
          <a
            href="#solutions"
            onClick={closeMenu}
            className="text-on-surface text-lg font-medium"
          >
            {t('nav.solutions')}
          </a>
          <a
            href="#features"
            onClick={closeMenu}
            className="text-on-surface text-lg font-medium"
          >
            {t('nav.features')}
          </a>
          <a
            href="#security"
            onClick={closeMenu}
            className="text-on-surface text-lg font-medium"
          >
            {t('nav.security')}
          </a>
          <a
            href="#contact"
            onClick={closeMenu}
            className="text-on-surface text-lg font-medium"
          >
            {t('nav.contact')}
          </a>
          <hr className="border-outline-variant" />
          <a
            href={`${PLATFORM_URL}/login`}
            className="signature-gradient text-white text-center px-6 py-3 rounded-xl font-semibold"
          >
            {t('nav.login')}
          </a>
        </div>
      </div>
    </>
  );
}

/* =========================================================
   HERO
   ========================================================= */
function Hero({ t }: { t: (k: string) => string }) {
  return (
    <section
      className="relative min-h-screen flex items-center pt-16 overflow-hidden"
      style={{
        background:
          'linear-gradient(160deg, #040d1b 0%, #0a1a33 40%, #0051d5 100%)',
      }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-48 sm:w-72 h-48 sm:h-72 bg-secondary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-64 sm:w-96 h-64 sm:h-96 bg-secondary-container/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] bg-on-tertiary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
          {/* Left: Text */}
          <div className="text-white">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-xs sm:text-sm mb-6 sm:mb-8">
              <span className="w-2 h-2 bg-on-tertiary rounded-full animate-pulse-dot" />
              <span>{t('hero.badge')}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.1] mb-4 sm:mb-6 font-display">
              <span>{t('hero.title1')}</span>
              <br />
              <span className="text-gradient">{t('hero.title2')}</span>
            </h1>

            <p className="text-base sm:text-lg text-blue-100/80 mb-8 sm:mb-10 max-w-lg leading-relaxed">
              {t('hero.description')}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-10 sm:mb-14">
              <a
                href="#solutions"
                className="inline-flex items-center justify-center gap-2 bg-white text-primary px-7 py-3.5 rounded-xl font-semibold text-base hover:bg-surface transition ghost-shadow-lg"
              >
                <Icon name="explore" className="text-[20px]" />
                {t('hero.cta1')}
              </a>
              <a
                href={`${PLATFORM_URL}/login`}
                className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white px-7 py-3.5 rounded-xl font-semibold text-base hover:bg-white/20 transition"
              >
                <Icon name="login" className="text-[20px]" />
                {t('hero.cta2')}
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 sm:flex sm:items-center sm:gap-10">
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold font-display">50+</div>
                <div className="text-blue-200/60 text-xs sm:text-sm mt-0.5">
                  {t('hero.stat1')}
                </div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-white/20" />
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold font-display">
                  2000+
                </div>
                <div className="text-blue-200/60 text-xs sm:text-sm mt-0.5">
                  {t('hero.stat2')}
                </div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-white/20" />
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold font-display">
                  500K+
                </div>
                <div className="text-blue-200/60 text-xs sm:text-sm mt-0.5">
                  {t('hero.stat3')}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Dashboard Card */}
          <div className="relative hidden lg:block">
            <div className="animate-float">
              <div className="bg-white rounded-2xl ghost-shadow-lg p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-on-surface font-display">
                    {t('dashboard.title')}
                  </h3>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-on-tertiary bg-emerald-50 px-2.5 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 bg-on-tertiary rounded-full animate-pulse-dot" />
                    <span>{t('dashboard.live')}</span>
                  </span>
                </div>
                <div className="space-y-3">
                  {/* Item 1 */}
                  <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Icon name="verified" className="text-secondary text-xl" />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-on-surface">
                          {t('dashboard.item1.title')}
                        </div>
                        <div className="text-xs text-on-surface-variant">
                          Pharmacie El Medina
                        </div>
                      </div>
                    </div>
                    <span className="text-on-tertiary font-semibold text-sm">
                      OK
                    </span>
                  </div>
                  {/* Item 2 */}
                  <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                        <Icon
                          name="payments"
                          className="text-on-tertiary text-xl"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-on-surface">
                          {t('dashboard.item2.title')}
                        </div>
                        <div className="text-xs text-on-surface-variant">
                          Dr. Karim Mansouri
                        </div>
                      </div>
                    </div>
                    <span className="text-on-surface font-semibold text-sm">
                      450 TND
                    </span>
                  </div>
                  {/* Item 3 */}
                  <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-violet-50 rounded-lg flex items-center justify-center">
                        <Icon
                          name="description"
                          className="text-violet-600 text-xl"
                        />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-on-surface">
                          {t('dashboard.item3.title')}
                        </div>
                        <div className="text-xs text-on-surface-variant">
                          BH Assurances
                        </div>
                      </div>
                    </div>
                    <span className="text-secondary font-semibold text-sm">
                      PDF
                    </span>
                  </div>
                </div>
                {/* Mini chart */}
                <div className="mt-4 pt-4 border-t border-outline-variant/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-on-surface-variant">
                      {t('dashboard.transactions')}
                    </span>
                    <span className="text-xs font-semibold text-on-tertiary">
                      +12.5%
                    </span>
                  </div>
                  <div className="flex items-end gap-1 h-8">
                    <div
                      className="flex-1 bg-secondary/20 rounded-sm"
                      style={{ height: '40%' }}
                    />
                    <div
                      className="flex-1 bg-secondary/20 rounded-sm"
                      style={{ height: '60%' }}
                    />
                    <div
                      className="flex-1 bg-secondary/30 rounded-sm"
                      style={{ height: '45%' }}
                    />
                    <div
                      className="flex-1 bg-secondary/30 rounded-sm"
                      style={{ height: '80%' }}
                    />
                    <div
                      className="flex-1 bg-secondary/40 rounded-sm"
                      style={{ height: '55%' }}
                    />
                    <div
                      className="flex-1 bg-secondary/40 rounded-sm"
                      style={{ height: '70%' }}
                    />
                    <div
                      className="flex-1 bg-secondary/50 rounded-sm"
                      style={{ height: '90%' }}
                    />
                    <div
                      className="flex-1 signature-gradient rounded-sm"
                      style={{ height: '100%' }}
                    />
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

/* =========================================================
   PARTNERS
   ========================================================= */
function Partners({ t }: { t: (k: string) => string }) {
  const partners = [
    { icon: 'shield', label: 'BH Assurance' },
    { icon: 'account_balance', label: 'BH Bank' },
    { icon: 'credit_card', label: 'Tunisie Monétique' },
    { icon: 'local_hospital', label: 'CNAM' },
  ];

  return (
    <section className="py-16 bg-surface-lowest">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-medium text-on-surface-variant mb-10 tracking-wide uppercase">
          {t('partners.title')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-12 sm:gap-16">
          {partners.map((p) => (
            <div
              key={p.label}
              className="partner-logo flex flex-col items-center gap-2 cursor-default"
            >
              <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center">
                <Icon
                  name={p.icon}
                  className="text-3xl text-on-surface-variant"
                />
              </div>
              <span className="text-xs font-medium text-on-surface-variant">
                {p.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   SOLUTIONS (Bento Grid)
   ========================================================= */
function Solutions({ t }: { t: (k: string) => string }) {
  return (
    <section id="solutions" className="py-16 sm:py-24 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 sm:mb-16">
          <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
            {t('solutions.label')}
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary font-display mb-4">
            {t('solutions.title')}
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            {t('solutions.subtitle')}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Assureurs (large) */}
          <div className="bento-card bento-navy md:col-span-2 lg:col-span-2 bg-surface-lowest rounded-2xl p-6 sm:p-8 ghost-shadow cursor-default">
            <div className="flex items-start gap-5">
              <div className="w-14 h-14 signature-gradient rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon name="assured_workload" className="text-white text-2xl" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-on-surface font-display mb-2">
                  {t('solutions.insurers.title')}
                </h3>
                <p className="text-on-surface-variant bento-desc leading-relaxed">
                  {t('solutions.insurers.desc')}
                </p>
              </div>
            </div>
          </div>

          {/* Entreprises */}
          <div className="bento-card bg-surface-lowest rounded-2xl p-6 sm:p-8 ghost-shadow cursor-default">
            <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center mb-4">
              <Icon
                name="business"
                className="text-violet-600 text-2xl bento-icon"
              />
            </div>
            <h3 className="text-lg font-bold text-on-surface font-display mb-2">
              {t('solutions.companies.title')}
            </h3>
            <p className="text-sm text-on-surface-variant bento-desc leading-relaxed">
              {t('solutions.companies.desc')}
            </p>
          </div>

          {/* Praticiens */}
          <div className="bento-card bg-surface-lowest rounded-2xl p-6 sm:p-8 ghost-shadow cursor-default">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4">
              <Icon
                name="stethoscope"
                className="text-on-tertiary text-2xl bento-icon"
              />
            </div>
            <h3 className="text-lg font-bold text-on-surface font-display mb-2">
              {t('solutions.providers.title')}
            </h3>
            <p className="text-sm text-on-surface-variant bento-desc leading-relaxed">
              {t('solutions.providers.desc')}
            </p>
          </div>

          {/* Adhérents (full width gradient) */}
          <div className="bento-card md:col-span-2 lg:col-span-2 signature-gradient rounded-2xl p-6 sm:p-8 cursor-default relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex items-start gap-5">
              <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon name="favorite" className="text-white text-2xl" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white font-display mb-2">
                  {t('solutions.adherents.title')}
                </h3>
                <p className="text-blue-100/80 leading-relaxed">
                  {t('solutions.adherents.desc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   FEATURES (AI Agents)
   ========================================================= */
function Features({ t }: { t: (k: string) => string }) {
  const features = [
    {
      icon: 'verified_user',
      bgColor: 'bg-blue-50',
      iconColor: 'text-secondary',
      titleKey: 'features.f1.title',
      descKey: 'features.f1.desc',
    },
    {
      icon: 'calculate',
      bgColor: 'bg-emerald-50',
      iconColor: 'text-on-tertiary',
      titleKey: 'features.f2.title',
      descKey: 'features.f2.desc',
    },
    {
      icon: 'gpp_maybe',
      bgColor: 'bg-red-50',
      iconColor: 'text-red-500',
      titleKey: 'features.f3.title',
      descKey: 'features.f3.desc',
    },
    {
      icon: 'account_tree',
      bgColor: 'bg-orange-50',
      iconColor: 'text-orange-500',
      titleKey: 'features.f4.title',
      descKey: 'features.f4.desc',
    },
    {
      icon: 'document_scanner',
      bgColor: 'bg-pink-50',
      iconColor: 'text-pink-500',
      titleKey: 'features.f5.title',
      descKey: 'features.f5.desc',
    },
    {
      icon: 'smartphone',
      bgColor: 'bg-cyan-50',
      iconColor: 'text-cyan-500',
      titleKey: 'features.f6.title',
      descKey: 'features.f6.desc',
    },
  ];

  return (
    <section id="features" className="py-16 sm:py-24 bg-surface-lowest">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 sm:mb-16">
          <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
            {t('features.label')}
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary font-display mb-4">
            {t('features.title')}
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((f) => (
            <div
              key={f.icon}
              className="group bg-surface rounded-2xl p-5 sm:p-7 ghost-shadow hover:ghost-shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div
                className={`w-12 h-12 ${f.bgColor} rounded-xl flex items-center justify-center mb-5`}
              >
                <Icon name={f.icon} className={`${f.iconColor} text-2xl`} />
              </div>
              <h3 className="text-lg font-bold text-on-surface font-display mb-2">
                {t(f.titleKey)}
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                {t(f.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   HOW IT WORKS
   ========================================================= */
function HowItWorks({ t }: { t: (k: string) => string }) {
  const steps = [
    { icon: 'badge', titleKey: 'howItWorks.step1.title', descKey: 'howItWorks.step1.desc', gradient: true },
    { icon: 'medical_services', titleKey: 'howItWorks.step2.title', descKey: 'howItWorks.step2.desc', gradient: true },
    { icon: 'psychology', titleKey: 'howItWorks.step3.title', descKey: 'howItWorks.step3.desc', gradient: true },
    { icon: 'payments', titleKey: 'howItWorks.step4.title', descKey: 'howItWorks.step4.desc', gradient: false },
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 sm:mb-16">
          <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
            {t('howItWorks.label')}
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-primary font-display mb-4">
            {t('howItWorks.title')}
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            {t('howItWorks.subtitle')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`text-center ${i < steps.length - 1 ? 'step-connector' : ''}`}
            >
              <div
                className={`w-14 h-14 ${step.gradient ? 'signature-gradient' : 'bg-on-tertiary'} rounded-2xl flex items-center justify-center mx-auto mb-5 relative z-10`}
              >
                <Icon name={step.icon} className="text-white text-2xl" />
              </div>
              <h3 className="text-base font-bold text-on-surface font-display mb-2">
                {t(step.titleKey)}
              </h3>
              <p className="text-sm text-on-surface-variant">
                {t(step.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   SECURITY
   ========================================================= */
function Security({ t }: { t: (k: string) => string }) {
  const securityFeatures = [
    { icon: 'lock', iconColor: 'text-secondary-container', titleKey: 'security.f1.title', descKey: 'security.f1.desc' },
    { icon: 'policy', iconColor: 'text-on-tertiary', titleKey: 'security.f2.title', descKey: 'security.f2.desc' },
    { icon: 'history', iconColor: 'text-orange-400', titleKey: 'security.f3.title', descKey: 'security.f3.desc' },
  ];

  const orbitingIcons = [
    { icon: 'encrypted', color: 'text-on-tertiary', pos: 'absolute top-4 left-1/2 -translate-x-1/2', delay: '0s' },
    { icon: 'fingerprint', color: 'text-secondary-container', pos: 'absolute bottom-4 left-4', delay: '1s' },
    { icon: 'key', color: 'text-orange-400', pos: 'absolute bottom-4 right-4', delay: '2s' },
    { icon: 'vpn_lock', color: 'text-pink-400', pos: 'absolute top-1/2 -translate-y-1/2 left-0', delay: '0.5s' },
    { icon: 'admin_panel_settings', color: 'text-cyan-400', pos: 'absolute top-1/2 -translate-y-1/2 right-0', delay: '1.5s' },
  ];

  return (
    <section id="security" className="py-16 sm:py-24 bg-primary relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-on-tertiary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left: Content */}
          <div>
            <p className="text-sm font-semibold text-secondary-container uppercase tracking-wider mb-3">
              {t('security.label')}
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-display mb-6">
              {t('security.title')}
            </h2>
            <p className="text-lg text-blue-100/60 mb-10 leading-relaxed">
              {t('security.subtitle')}
            </p>

            <div className="space-y-6">
              {securityFeatures.map((f) => (
                <div key={f.icon} className="flex items-start gap-4">
                  <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Icon name={f.icon} className={f.iconColor} />
                  </div>
                  <div>
                    <h4 className="text-white font-bold font-display mb-1">
                      {t(f.titleKey)}
                    </h4>
                    <p className="text-sm text-blue-100/50">{t(f.descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Security Visualization */}
          <div className="hidden md:flex justify-center">
            <div className="relative w-80 h-80">
              {/* Central shield */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-40 h-40 bg-white/5 rounded-3xl backdrop-blur-sm border border-white/10 flex items-center justify-center">
                  <Icon
                    name="shield_with_heart"
                    className="text-secondary-container"
                    style={{ fontSize: 64 }}
                  />
                </div>
              </div>
              {/* Orbiting elements */}
              {orbitingIcons.map((o) => (
                <div
                  key={o.icon}
                  className={`${o.pos} w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center animate-bounce`}
                  style={{ animationDelay: o.delay, animationDuration: '3s' }}
                >
                  <Icon name={o.icon} className={`${o.color} text-lg`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   CTA
   ========================================================= */
function CtaSection({ t }: { t: (k: string) => string }) {
  return (
    <section
      className="py-16 sm:py-24 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, #0051d5 0%, #316bf3 50%, #009d6d 100%)',
      }}
    >
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-white/5 rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white font-display mb-4 sm:mb-6">
          {t('cta.title')}
        </h2>
        <p className="text-base sm:text-lg text-white/70 mb-8 sm:mb-10 max-w-2xl mx-auto">
          {t('cta.subtitle')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <a
            href={`${PLATFORM_URL}/login`}
            className="inline-flex items-center justify-center gap-2 bg-white text-primary px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl font-semibold text-base sm:text-lg hover:bg-surface transition ghost-shadow-lg"
          >
            <Icon name="rocket_launch" />
            {t('cta.btn1')}
          </a>
          <a
            href="#contact"
            className="inline-flex items-center justify-center gap-2 bg-white/15 backdrop-blur-sm text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-xl font-semibold text-base sm:text-lg hover:bg-white/25 transition"
          >
            <Icon name="chat" />
            {t('cta.btn2')}
          </a>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   CONTACT FORM
   ========================================================= */
function ContactForm({ t }: { t: (k: string) => string }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    orgType: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.orgType || !form.message) return;

    setStatus('sending');

    try {
      const res = await fetch(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${form.firstName} ${form.lastName}`,
          email: form.email,
          company: form.orgType,
          message: form.message,
        }),
      });

      if (res.ok) {
        setStatus('success');
        setForm({ firstName: '', lastName: '', email: '', orgType: '', message: '' });
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }

    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setStatus('idle'), 5000);
  };

  return (
    <section id="contact" className="py-16 sm:py-24 bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
          {/* Left: Info */}
          <div>
            <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
              {t('contact.label')}
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-primary font-display mb-4">
              {t('contact.title')}
            </h2>
            <p className="text-lg text-on-surface-variant mb-10 leading-relaxed">
              {t('contact.subtitle')}
            </p>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon name="mail" className="text-secondary" />
                </div>
                <div>
                  <div className="font-semibold text-on-surface font-display">
                    Email
                  </div>
                  <a
                    href="mailto:contact@e-sante.com.tn"
                    className="text-on-surface-variant hover:text-secondary transition-colors"
                  >
                    contact@e-sante.com.tn
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon name="call" className="text-on-tertiary" />
                </div>
                <div>
                  <div className="font-semibold text-on-surface font-display">
                    {t('contact.phone')}
                  </div>
                  <a
                    href="tel:+21671123456"
                    className="text-on-surface-variant hover:text-secondary transition-colors"
                  >
                    +216 71 123 456
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon name="location_on" className="text-orange-500" />
                </div>
                <div>
                  <div className="font-semibold text-on-surface font-display">
                    {t('contact.address')}
                  </div>
                  <span className="text-on-surface-variant">
                    Centre Urbain Nord, Tunis 1082
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-surface-lowest rounded-2xl p-5 sm:p-8 ghost-shadow-lg">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1.5">
                    {t('contact.form.firstName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) =>
                      setForm({ ...form, firstName: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl bg-surface border-0 text-on-surface placeholder:text-outline text-sm"
                    placeholder={t('contact.form.firstNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1.5">
                    {t('contact.form.lastName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) =>
                      setForm({ ...form, lastName: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-xl bg-surface border-0 text-on-surface placeholder:text-outline text-sm"
                    placeholder={t('contact.form.lastNamePlaceholder')}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl bg-surface border-0 text-on-surface placeholder:text-outline text-sm"
                  placeholder={t('contact.form.emailPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">
                  {t('contact.form.orgType')}
                </label>
                <select
                  required
                  value={form.orgType}
                  onChange={(e) =>
                    setForm({ ...form, orgType: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl bg-surface border-0 text-on-surface text-sm"
                >
                  <option value="">{t('contact.form.select')}</option>
                  <option value="pharmacy">{t('contact.form.pharmacy')}</option>
                  <option value="clinic">{t('contact.form.clinic')}</option>
                  <option value="cabinet">{t('contact.form.cabinet')}</option>
                  <option value="lab">{t('contact.form.lab')}</option>
                  <option value="insurer">{t('contact.form.insurer')}</option>
                  <option value="company">{t('contact.form.company')}</option>
                  <option value="other">{t('contact.form.other')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1.5">
                  {t('contact.form.message')}
                </label>
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) =>
                    setForm({ ...form, message: e.target.value })
                  }
                  className="w-full px-4 py-3 rounded-xl bg-surface border-0 text-on-surface placeholder:text-outline text-sm resize-none"
                  placeholder={t('contact.form.messagePlaceholder')}
                />
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full signature-gradient text-white px-6 py-3.5 rounded-xl font-semibold text-sm hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Icon name="send" className="text-[18px]" />
                <span>
                  {status === 'sending'
                    ? t('contact.form.sending')
                    : t('contact.form.submit')}
                </span>
              </button>
              {status === 'success' && (
                <div className="text-center text-sm py-2 rounded-xl text-on-tertiary bg-emerald-50">
                  {t('contact.form.success')}
                </div>
              )}
              {status === 'error' && (
                <div className="text-center text-sm py-2 rounded-xl text-red-600 bg-red-50">
                  {t('contact.form.error')}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   FOOTER
   ========================================================= */
function Footer({ t }: { t: (k: string) => string }) {
  return (
    <footer className="bg-primary text-white py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          {/* Col 1: Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: '#1a2332' }}
              >
                <span className="text-white font-extrabold text-sm font-display">
                  BH
                </span>
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-lg font-extrabold font-display">
                  E-Santé
                </span>
                <span className="text-[10px] font-medium text-blue-100/50 tracking-wider">
                  BH Assurance
                </span>
              </div>
            </div>
            <p className="text-sm text-blue-100/50 mb-6 leading-relaxed">
              {t('footer.tagline')}
            </p>
            <div className="flex items-center gap-3">
              <a
                href="#"
                className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-secondary transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a
                href="#"
                className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-secondary transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                </svg>
              </a>
              <a
                href="#"
                className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center hover:bg-secondary transition"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Col 2: Produit */}
          <div>
            <h4 className="font-semibold font-display mb-5">
              {t('footer.product')}
            </h4>
            <ul className="space-y-3 text-sm text-blue-100/50">
              <li>
                <a href="#solutions" className="hover:text-white transition-colors">
                  {t('nav.solutions')}
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  {t('nav.features')}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  API
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-white transition-colors">
                  {t('nav.security')}
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Entreprise */}
          <div>
            <h4 className="font-semibold font-display mb-5">
              {t('footer.company')}
            </h4>
            <ul className="space-y-3 text-sm text-blue-100/50">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  {t('footer.about')}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  {t('footer.careers')}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  {t('footer.partners')}
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white transition-colors">
                  {t('nav.contact')}
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Légal */}
          <div>
            <h4 className="font-semibold font-display mb-5">
              {t('footer.legal')}
            </h4>
            <ul className="space-y-3 text-sm text-blue-100/50">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  {t('footer.terms')}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  {t('footer.privacy')}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  {t('footer.legalNotice')}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 text-center text-sm text-blue-100/40">
          <p>{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}

/* =========================================================
   APP
   ========================================================= */
function App() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="bg-surface text-on-surface antialiased">
      <Navbar lang={lang} setLang={setLang} t={t} />
      <main>
        <Hero t={t} />
        <Partners t={t} />
        <Solutions t={t} />
        <Features t={t} />
        <HowItWorks t={t} />
        <Security t={t} />
        <CtaSection t={t} />
        <ContactForm t={t} />
      </main>
      <Footer t={t} />
    </div>
  );
}

export default App;
